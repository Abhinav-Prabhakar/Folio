#!/usr/bin/env node
// Scans every data/summaries/*.md and data/catalog.json for conversion problems. Prints a count per issue type and the first 10 files.
// Usage: node tools/catalog/audit.mjs        (exit code 1 if anything is flagged)
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = resolve(ROOT, 'data/summaries');
const catalog = JSON.parse(await readFile(resolve(ROOT, 'data/catalog.json'), 'utf8'));
const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const normT = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const issues = {};
const flag = (type, file, note = '') => (issues[type] ||= []).push(note ? `${file}  ${note}` : file);

// Call-to-action boilerplate. Editorial mentions (the author recommending Blinkist, "email subscribers", YouTube subscribers) are fine.
const PROMO = /download (the |this |your )?(free )?pdf|listen to the audio|audio summary|free (pdf|audio) |click here|read the full (summary|review)|blinkist[^.]{0,60}(coupon|discount|promo code)|(coupon|discount|promo code)[^.]{0,60}blinkist|use (my|the) (link|code)/i;
// Posts whose source has no "Lesson N" headings at all (checked against the WordPress HTML): one flowing overview, then Review.
const NO_LESSONS = new Set(['better-than-before', 'humans-are-underrated', 'learned-optimism', 'rich-dad-poor-dad', 'spartan-up', 'the-end-of-jobs', 'the-happiness-hypothesis', 'the-magic-of-thinking-big'].map(x => x + '.md'));
for (const f of (await readdir(DIR)).filter(f => f.endsWith('.md')).sort()) {
  const md = await readFile(resolve(DIR, f), 'utf8');
  const lines = md.split('\n');
  const words = md.split(/\s+/).length;
  if (words < 250) flag('short (<250 words)', f, `${words} words`);
  if (!/^> /m.test(md)) flag('no hook line', f);
  if (!/^## Lesson \d+/m.test(md) && !NO_LESSONS.has(f)) flag('no lessons', f);
  let m;
  lines.forEach((l, i) => {
    if (PROMO.test(l)) flag('promo/boilerplate', f, `L${i + 1}: ${l}`);
    if (/https?:\/\/|www\./i.test(l)) flag('raw URL', f, `L${i + 1}: ${l}`);
    if (/<\/?[a-z][^>]*>|&(amp|lt|gt|quot|nbsp|#\d+);/i.test(l)) flag('HTML tag/entity', f, `L${i + 1}: ${l}`);
    // a long one-sentence lesson headline is how the source wrote it; several sentences means a paragraph was fused into the heading
    if (/^#{1,6} /.test(l) && l.length > 140 && /[.!?] \p{Lu}/u.test(l)) flag('heading >140 chars', f, `L${i + 1}`);
    else if (!/^#{1,6} /.test(l) && l.length > 1500) flag('paragraph >1500 chars', f, `L${i + 1}: ${l.length} chars`);
    // Stray asterisks: literal stars in censored words (f*ck, a**hole) and arithmetic are content, not markers.
    // Mask those, strip well-formed **bold** / *italic* pairs, and anything still standing is a conversion artefact.
    let body = l.replace(/^(\s*[*-]\s+|>\s*)/, '');
    // What is left should be balanced Markdown emphasis. Walk the * and ** runs with a stack so
    // nested and ***bold italic*** pairs pass, while a leftover or malformed marker fails.
    const balanced = s => {
      const stack = [];
      for (const r of s.matchAll(/\*+/g)) {
        const n = r[0].length, at = r.index;
        if (n > 3 || (/\s/.test(s[at - 1] || ' ') && /\s/.test(s[at + n] || ' '))) return false;
        let left = n;
        while (left && stack.length && left >= stack[stack.length - 1]) left -= stack.pop();
        // A run of *** is bold + italic: push the bold delimiter under the italic one.
        while (left > 0) { const d = left >= 2 ? 2 : 1; stack.push(d); left -= d; }
      }
      return !stack.length;
    };
    let bad = false;
    if (!bad && !balanced(body)) {
      // Literal stars in censored words (f*ck, a**hole) and arithmetic can look like stray markers.
      body = body.replace(/(?<=[\p{L}\p{N}])\*+(?=[\p{L}\p{N}])/gu, 'x')
        .replace(/(?<=[\d)])\s*\*\s*(?=[\d(])/g, 'x')                             // 0.75*0.01, 2*(k + j)
        .replace(/\s\*\s/g, 'x')                                                  // 7 * 13, a lone star
        .replace(/\\\*/g, 'x');                                                   // escaped literal
      bad = !balanced(body);
    }
    if (bad) flag('stray * marker', f, `L${i + 1}: ${l}`);
  });
  const heads = lines.map((l, i) => [l, i]).filter(([l]) => /^#{1,6} /.test(l));
  heads.forEach(([l, i], k) => {
    const next = lines.slice(i + 1).findIndex(x => x.trim());
    if (next >= 0 && /^#{1,6} /.test(lines[i + 1 + next]) && /^#{2,3} /.test(l)) {
      // "## Lesson N" directly followed by "### headline" is the normal pairing
      if (!(/^## /.test(l) && /^### /.test(lines[i + 1 + next]))) flag('empty section', f, l);
    } else if (next < 0) flag('empty section', f, l + ' (end of file)');
  });
}

const seen = new Map();
const ownTitles = new Set();
const lib = html.slice(html.indexOf('const LIB = ['), html.indexOf('LIB.forEach'));
for (const m of lib.matchAll(/\btitle:'((?:[^'\\]|\\.)*)'/g)) ownTitles.add(normT(m[1].replace(/\\'/g, "'")));
for (const m of lib.matchAll(/\baka:\[([^\]]*)\]/g)) for (const a of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) ownTitles.add(normT(a[1].replace(/\\'/g, "'")));
const deduped = [];
for (const b of catalog.books) {
  const n = normT(b.t), id = b.s.replace(/-summary$/, '') + '.md';
  if (seen.has(n)) flag('duplicate catalog title', id, `same as ${seen.get(n)}`); else seen.set(n, id);
  // The app skips catalog copies of Folio's own books (see ownTitles in index.html), so these are expected, not errors.
  if (ownTitles.has(n)) deduped.push(`${id}  duplicates Folio original "${b.t}" (hidden by id)`);
}

if (deduped.length) {
  console.log(`Catalog copies of Folio originals (hidden by the app): ${deduped.length}`);
  deduped.forEach(x => console.log('  ' + x));
}
const types = Object.keys(issues);
if (!types.length) console.log(`Audit clean: ${catalog.books.length} catalog books, no issues.`);
for (const t of types) {
  console.log(`\n${t}: ${issues[t].length}`);
  (process.argv.includes('--all') ? issues[t] : issues[t].slice(0, 10)).forEach(x => console.log('  ' + x));
}
if (types.length) process.exitCode = 1;
