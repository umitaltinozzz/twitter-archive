/**
 * Ingest a Twitter export JSON (bookmarks veya likes) into Prisma SQLite.
 *
 * Kullanım:
 *   tsx scripts/ingest.ts <json-path> <type>
 *
 * Örnek:
 *   tsx scripts/ingest.ts "C:/.../twitter-Bookmarks-1776867341444.json" bookmark
 *   tsx scripts/ingest.ts "C:/.../twitter-Likes-1776867440635.json"     like
 *
 * Davranış:
 *   - MEDIA_ROOT env'i altındaki tüm alt klasörleri RECURSIVE tarar (bookmarks/, liked/, N/, vs).
 *   - Tweet ID dosya adında geçen ilk uygun uzantılı dosyayı /api/media/<rel-path> URL'ine dönüştürür.
 *   - Var olan kayıtları UPSERT eder; kullanıcının elle eklediği tags / projectName / notes ASLA silinmez.
 *   - quoted_status sadece ID ise, aynı dosya içindeki tweetlerden lookup yapar.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

type RawMedia = {
  type: string;
  url?: string;
  thumbnail?: string;
  original?: string;
};

type RawTweet = {
  id: string;
  created_at?: string;
  full_text?: string;
  media?: RawMedia[];
  screen_name?: string;
  name?: string;
  profile_image_url?: string;
  user_id?: string;
  in_reply_to?: string | null;
  retweeted_status?: unknown;
  quoted_status?: string | null;
  url?: string;
  metadata?: {
    note_tweet?: { note_tweet_results?: { result?: { text?: string } } };
  };
};

function walkRecursive(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);

function urlForRelPath(relFromMediaRoot: string): string {
  // Windows path → URL-friendly forward slashes; segment-bazında encode
  const parts = relFromMediaRoot.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent);
  return `/api/media/${parts.join('/')}`;
}

async function main() {
  const [, , jsonPathArg, typeArg] = process.argv;
  if (!jsonPathArg || !typeArg) {
    console.error('Kullanım: tsx scripts/ingest.ts <json-path> <bookmark|like>');
    process.exit(1);
  }
  const VALID_TYPES = new Set(['bookmark', 'like']);
  if (!VALID_TYPES.has(typeArg)) {
    console.error(`Geçersiz type: ${typeArg}. bookmark veya like olmalı.`);
    process.exit(1);
  }

  const jsonPath = path.resolve(jsonPathArg);
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON bulunamadı:', jsonPath);
    process.exit(1);
  }

  const mediaRoot = process.env.MEDIA_ROOT;
  if (!mediaRoot) {
    console.error('MEDIA_ROOT env tanımlı değil. .env.local dosyasına ekle.');
    process.exit(1);
  }
  if (!fs.existsSync(mediaRoot)) {
    console.error('MEDIA_ROOT klasörü yok:', mediaRoot);
    process.exit(1);
  }

  console.log(`--- INGEST: ${typeArg.toUpperCase()} ---`);
  console.log('JSON :', jsonPath);
  console.log('Media:', mediaRoot);

  console.log('Medya klasörü taranıyor (recursive)...');
  const allFiles = walkRecursive(mediaRoot);
  console.log(`  → ${allFiles.length} dosya bulundu.`);

  // Hızlı arama için: tweetId → uygun dosya yolları
  // Dosya adı tipik: <user>_<tweetId>_<type>_<idx>_<YYYYMMDD>.<ext>
  // Önce tüm dosyaları tweetId regex'i ile gruplayalım.
  const idToFiles = new Map<string, string[]>();
  const ID_RE = /(\d{15,25})/; // Twitter snowflake (15-25 haneli)
  for (const f of allFiles) {
    const base = path.basename(f);
    const m = base.match(ID_RE);
    if (!m) continue;
    const id = m[1];
    if (!idToFiles.has(id)) idToFiles.set(id, []);
    idToFiles.get(id)!.push(f);
  }
  console.log(`  → ${idToFiles.size} farklı tweet ID'si bulundu medyalarda.`);

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as RawTweet[];
  if (!Array.isArray(data)) {
    console.error('JSON beklenen array formatında değil.');
    process.exit(1);
  }
  console.log(`  → ${data.length} tweet okundu.`);

  // Aynı dosya içinden quoted_status lookup için
  const byId = new Map<string, RawTweet>();
  for (const t of data) byId.set(String(t.id), t);

  let processed = 0;
  let mediaMatched = 0;
  let mediaMissing = 0;
  let withQuoted = 0;

  for (const tweet of data) {
    const tweetId = String(tweet.id);

    const longText = tweet.metadata?.note_tweet?.note_tweet_results?.result?.text;
    const finalText = longText || tweet.full_text || '';

    // ---- Bu tweetin medyalarını eşle ----
    const localCandidates = idToFiles.get(tweetId) || [];
    const tweetMedia = tweet.media || [];

    type ProcessedMedia = {
      type: string;
      url: string;
      original: string;
      thumbnail?: string;
    };
    const processedMedia: ProcessedMedia[] = [];
    const usedFiles = new Set<string>();

    for (const m of tweetMedia) {
      const wantPhoto = m.type === 'photo';
      const match = localCandidates.find((full) => {
        if (usedFiles.has(full)) return false;
        const ext = path.extname(full).toLowerCase();
        return wantPhoto ? PHOTO_EXTS.has(ext) : VIDEO_EXTS.has(ext);
      });

      if (match) {
        usedFiles.add(match);
        const rel = path.relative(mediaRoot, match);
        const localUrl = urlForRelPath(rel);
        processedMedia.push({
          type: m.type,
          url: localUrl,
          original: localUrl,
          thumbnail: m.thumbnail,
        });
        mediaMatched++;
      } else {
        // 404 olursa orijinal CDN URL'ine düş; ama X.com çoğu zaman yetkisiz blocklar.
        processedMedia.push({
          type: m.type,
          url: m.original || m.thumbnail || m.url || '',
          original: m.original || m.thumbnail || m.url || '',
          thumbnail: m.thumbnail,
        });
        mediaMissing++;
      }
    }

    // ---- Quoted status (sadece ID ise aynı export'tan çek) ----
    let quotedData: {
      id: string;
      text: string;
      authorName: string;
      authorUsername: string;
      authorAvatar: string | null;
      media: string;
    } | null = null;

    if (tweet.quoted_status) {
      const qid =
        typeof tweet.quoted_status === 'string'
          ? tweet.quoted_status
          : String((tweet.quoted_status as { id?: unknown })?.id || '');
      const q = byId.get(qid);
      if (q) {
        const qLocalCandidates = idToFiles.get(qid) || [];
        const qProcessed: ProcessedMedia[] = [];
        const qUsed = new Set<string>();
        for (const m of q.media || []) {
          const wantPhoto = m.type === 'photo';
          const match = qLocalCandidates.find((full) => {
            if (qUsed.has(full)) return false;
            const ext = path.extname(full).toLowerCase();
            return wantPhoto ? PHOTO_EXTS.has(ext) : VIDEO_EXTS.has(ext);
          });
          if (match) {
            qUsed.add(match);
            const rel = path.relative(mediaRoot, match);
            const localUrl = urlForRelPath(rel);
            qProcessed.push({ type: m.type, url: localUrl, original: localUrl, thumbnail: m.thumbnail });
          } else {
            qProcessed.push({
              type: m.type,
              url: m.original || m.thumbnail || m.url || '',
              original: m.original || m.thumbnail || m.url || '',
              thumbnail: m.thumbnail,
            });
          }
        }
        quotedData = {
          id: qid,
          text: q.full_text || '',
          authorName: q.name || 'Bilinmiyor',
          authorUsername: q.screen_name || 'bilinmiyor',
          authorAvatar: q.profile_image_url || null,
          media: JSON.stringify(qProcessed),
        };
        withQuoted++;
      }
    }

    // ---- UPSERT (kullanıcının notes/tags/projectName'ini KORU) ----
    const baseData = {
      type: typeArg,
      url: tweet.url || `https://twitter.com/${tweet.screen_name || 'i'}/status/${tweetId}`,
      authorName: tweet.name || 'Bilinmiyor',
      authorUsername: tweet.screen_name || 'bilinmiyor',
      authorAvatar: tweet.profile_image_url || null,
      text: finalText,
      createdAt: tweet.created_at || new Date().toISOString(),
      media: JSON.stringify(processedMedia),
      isReply: tweet.in_reply_to !== null && tweet.in_reply_to !== undefined,
      quotedTweet: quotedData ? JSON.stringify(quotedData) : null,
    };

    await prisma.tweet.upsert({
      where: { id: tweetId },
      create: {
        id: tweetId,
        ...baseData,
        // İlk ekleme: tags/notes/projectName boş başlasın
      },
      update: {
        // Sadece içerik/medya/quote güncellenir; kullanıcı notları korunur
        ...baseData,
      },
    });

    processed++;
    if (processed % 250 === 0) {
      console.log(`  ${processed}/${data.length}...`);
    }
  }

  console.log('--- TAMAM ---');
  console.log(`Tip          : ${typeArg}`);
  console.log(`İşlenen      : ${processed}`);
  console.log(`Medya eşleşti: ${mediaMatched}`);
  console.log(`Medya yok    : ${mediaMissing}`);
  console.log(`Quote bulunan: ${withQuoted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
