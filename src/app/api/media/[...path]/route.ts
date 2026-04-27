/**
 * /api/media/<...path>
 *
 * MEDIA_ROOT (örn. C:\Users\Umit Altinoz\Desktop\twittermedia\bookmarks) altındaki
 * dosyaları stream eder. Range request destekler (büyük video scrub için).
 *
 * Güvenlik: Path traversal'a karşı, çözümlenen mutlak yolun MEDIA_ROOT altında
 * kaldığı `path.relative` ile doğrulanır.
 */

import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
};

function nodeReadableToWeb(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer | string) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
    cancel() {
      // Best effort
      (stream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const root = process.env.MEDIA_ROOT;
  if (!root) {
    return new Response('MEDIA_ROOT env tanımlı değil.', { status: 500 });
  }

  const { path: parts } = await ctx.params;
  if (!parts || parts.length === 0) {
    return new Response('Path eksik.', { status: 400 });
  }

  // URL-encoded segmentleri decode et (Türkçe karakter / boşluk vb.)
  const decoded = parts.map((p: string) => decodeURIComponent(p));
  const target = path.resolve(root, ...decoded);

  // Path traversal koruması: target, root altında mı?
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return new Response('Geçersiz path.', { status: 400 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return new Response('Bulunamadı.', { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response('Dosya değil.', { status: 404 });
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const fileSize = stat.size;

  const range = request.headers.get('range');
  if (range) {
    // bytes=START-END (END opsiyonel)
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start > end ||
        start < 0 ||
        end >= fileSize
      ) {
        return new Response('Range geçersiz.', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
      }
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(target, { start, end });
      return new Response(nodeReadableToWeb(stream), {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
  }

  const stream = fs.createReadStream(target);
  return new Response(nodeReadableToWeb(stream), {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
