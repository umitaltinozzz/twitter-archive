#!/usr/bin/env node
/**
 * Web Exporter / GraphQL export bazen user_results.result icinde .core olmadan
 * veya tamamen bos düğümler döner; bazi araçlar user.core okuyunca patlar.
 * Bu script tum "User" benzeri result düğümlerine güvenli bir .core ekler.
 *
 * Kullanim: node scripts/normalize-bookmarks-export.mjs giris.json [cikis.json]
 * cikis verilmezse: giris.normalized.json
 */

import fs from 'fs';
import path from 'path';

const inFile = process.argv[2];
const outFile = process.argv[3] || inFile.replace(/\.json$/i, '.normalized.json');

if (!inFile || !fs.existsSync(inFile)) {
  console.error('Kullanim: node scripts/normalize-bookmarks-export.mjs <giris.json> [cikis.json]');
  process.exit(1);
}

function isGraphqlUserNode(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.__typename === 'Tweet') return false;
  if (result.__typename === 'User' || result.__typename === 'UserUnavailable') return true;
  const leg = result.legacy;
  if (leg && typeof leg === 'object' && 'full_text' in leg) return false;
  if (leg && typeof leg === 'object' && ('screen_name' in leg || 'followers_count' in leg))
    return true;
  return false;
}

function patchUserResult(result) {
  if (!result || typeof result !== 'object') return;
  if (!isGraphqlUserNode(result)) return;

  const leg = result.legacy;
  const existingCore =
    result.core && typeof result.core === 'object' && !Array.isArray(result.core)
      ? result.core
      : {};

  const name =
    existingCore.name ||
    leg?.name ||
    leg?.screen_name ||
    (result.reason ? `[${String(result.reason)}]` : null) ||
    (result.__typename === 'UserUnavailable' ? '[Kullanıcı yok]' : null) ||
    'Bilinmiyor';

  const screen =
    existingCore.screen_name ||
    leg?.screen_name ||
    leg?.name?.replace?.(/\s+/g, '') ||
    'bilinmiyor';

  result.core = {
    ...existingCore,
    name,
    screen_name: screen,
    created_at: existingCore.created_at || leg?.created_at || '',
  };
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, visit);
    return;
  }
  visit(node);
  for (const k of Object.keys(node)) walk(node[k], visit);
}

const raw = fs.readFileSync(inFile, 'utf-8');
const data = JSON.parse(raw);

if (!Array.isArray(data)) {
  console.error('Beklenen: kök bir JSON dizi (bookmark export).');
  process.exit(1);
}

let patched = 0;
for (const tweet of data) {
  walk(tweet, (n) => {
    const r = n?.user_results?.result;
    if (!r || typeof r !== 'object') return;
    if (!isGraphqlUserNode(r)) return;
    const before = r.core && typeof r.core === 'object' ? JSON.stringify(r.core) : '';
    patchUserResult(r);
    const after = JSON.stringify(r.core);
    if (before !== after) patched++;
  });
}

fs.writeFileSync(outFile, JSON.stringify(data), 'utf-8');
console.log(`Tamam: ${data.length} kayit, ~${patched} user düğümü güncellendi.`);
console.log(`Çikti: ${path.resolve(outFile)}`);
