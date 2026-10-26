#!/usr/bin/env node
// Adds book authors and first-publication years to data/catalog.json using the Open Library search API.
// Four Minute Books doesn't publish authors as data, so each title is looked up and checked against the summary
// text: a candidate only wins if its author's surname is actually mentioned in that book's summary.
// Results are cached in openlibrary-cache.json, so re-runs only look up new titles.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const CATALOG = resolve(ROOT, 'data/catalog.json');
const CACHE = resolve(HERE, 'openlibrary-cache.json');
const UA = 'Folio library builder (+https://github.com/Abhinav-Prabhakar/Folio)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
const mainTitle = t => t.split(/\s[:–—-]\s|:\s/)[0];
const surname = a => norm(a).split(' ').filter(w => w.length > 1).pop() || '';

function titleScore(want, got) {
  const a = norm(mainTitle(want)), b = norm(mainTitle(got));
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(' ')), B = new Set(b.split(' '));
  const inter = [...A].filter(w => B.has(w)).length;
  return inter / Math.max(A.size, B.size);
}

async function search(title) {
  const q = new URLSearchParams({ title: mainTitle(title), fields: 'title,author_name,first_publish_year', limit: '8' });
  for (let k = 1; k <= 4; k++) {
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${q}`, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) throw new Error(String(res.status));
      return (await res.json()).docs || [];
    } catch (e) { await sleep(3000 * k); }
  }
  return [];
}

const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
let cache = {};
try { cache = JSON.parse(await readFile(CACHE, 'utf8')); } catch (_) {}

let looked = 0, matched = 0;
for (const [n, b] of catalog.books.entries()) {
  if (!(b.s in cache)) {
    const body = norm(await readFile(resolve(ROOT, 'data/summaries', b.s.replace(/-summary$/, '') + '.md'), 'utf8').catch(() => ''));
    const docs = await search(b.t);
    let best = null;
    for (const d of docs) {
      const ts = titleScore(b.t, d.title);
      const author = (d.author_name || [])[0];
      if (!author || ts < 0.6) continue;
      const named = body.includes(' ' + surname(author) + ' ') || body.includes(' ' + surname(author) + 's ');
      const score = ts + (named ? 1 : 0) + (b.a && norm(b.a) === norm(author) ? 2 : 0);
      if (named && (!best || score > best.score)) best = { score, author, year: d.first_publish_year || null };
    }
    cache[b.s] = best ? { a: best.author, y: best.year } : null;
    looked++;
    if (looked % 25 === 0) { await writeFile(CACHE, JSON.stringify(cache)); }
    process.stdout.write(`\r${n + 1}/${catalog.books.length} looked up ${looked}`);
    await sleep(900);
  }
  const hit = cache[b.s];
  if (hit) { if (!b.a) b.a = hit.a; if (hit.y) b.y = hit.y; matched++; }
}
process.stdout.write('\n');
await writeFile(CACHE, JSON.stringify(cache));
await writeFile(CATALOG, JSON.stringify(catalog));
const withA = catalog.books.filter(b => b.a).length, withY = catalog.books.filter(b => b.y).length;
console.log({ books: catalog.books.length, newLookups: looked, matched, withAuthor: withA, withYear: withY });
