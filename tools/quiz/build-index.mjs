#!/usr/bin/env node
// Validates every data/quiz/<id>.json and writes data/quiz/index.json, the list of books the app may load questions for.
// Files that fail validation are reported and left out of the index, so a half-finished batch never breaks the site.
// Usage: node tools/quiz/build-index.mjs            (exit code 1 if any file is invalid)
import { readdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = resolve(ROOT, 'data/quiz');
const catalog = JSON.parse(await readFile(resolve(ROOT, 'data/catalog.json'), 'utf8'));
const known = new Set(catalog.books.map(b => b.s.replace(/-summary$/, '')));

const problems = [], ok = [];
const str = (x, max) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
for (const f of (await readdir(DIR)).filter(f => f.endsWith('.json') && f !== 'index.json').sort()) {
  const id = f.replace(/\.json$/, ''), errs = [];
  let j;
  try { j = JSON.parse(await readFile(resolve(DIR, f), 'utf8')); } catch (e) { problems.push(`${f}: not valid JSON (${e.message})`); continue; }
  if (!known.has(id)) errs.push('no book with this id in data/catalog.json');
  try { await access(resolve(ROOT, 'data/summaries', id + '.md')); } catch { errs.push('no matching data/summaries/' + id + '.md'); }
  if (j.book !== id) errs.push(`"book" must be "${id}"`);
  if (!Array.isArray(j.questions) || j.questions.length !== 5) errs.push('"questions" must hold exactly 5 items');
  (j.questions || []).forEach((q, n) => {
    const at = `question ${n + 1}`;
    if (!str(q.q, 160)) errs.push(`${at}: "q" must be a non-empty string up to 160 characters`);
    if (!Array.isArray(q.a) || q.a.length !== 4 || !q.a.every(a => str(a, 90))) errs.push(`${at}: "a" must hold exactly 4 non-empty strings up to 90 characters`);
    else if (new Set(q.a.map(a => a.trim().toLowerCase())).size !== 4) errs.push(`${at}: answers must all differ`);
    if (q.why !== undefined && !str(q.why, 200)) errs.push(`${at}: "why", if present, must be a string up to 200 characters`);
    if (/[*_`#<>]/.test([q.q, ...(q.a || []), q.why || ''].join(' '))) errs.push(`${at}: plain text only (no Markdown or HTML)`);
  });
  if (errs.length) problems.push(`${f}: ${errs.join('; ')}`); else ok.push(id);
}
await writeFile(resolve(DIR, 'index.json'), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), books: ok }) + '\n');
console.log(`${ok.length} valid quiz files indexed, ${problems.length} with problems, ${known.size - ok.length} books still without questions`);
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
