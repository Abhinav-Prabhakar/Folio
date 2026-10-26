#!/usr/bin/env node
// Builds Folio's library from Four Minute Books (fourminutebooks.com), republished with the author's permission.
//
//   data/catalog.json          every book: title, author, categories, one-line hook, read time, lessons, source link
//   data/summaries/<slug>.md   each summary, converted to Folio's Markdown (promos, forms and embeds removed)
//
// Usage: cd tools/catalog && npm install && npm run scrape        (Node 18+)
import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_CATALOG = resolve(ROOT, 'data/catalog.json');
const OUT_DIR = resolve(ROOT, 'data/summaries');
const API = 'https://fourminutebooks.com/wp-json/wp/v2';
const UA = 'Folio library builder (+https://github.com/Abhinav-Prabhakar/Folio)';
const SKIP_CATS = new Set(['Uncategorized', 'Review', 'Quotes', 'Book List (Topic)', 'Book List (Author)', 'Book List (Year)']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- text helpers ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', uuml: 'ü', ouml: 'ö', auml: 'ä' };
const decode = s => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = s => decode(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tidy = s => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?’”)])/g, '$1').replace(/([(“‘])\s+/g, '$1')
  .replace(/\*\*\s*\*\*/g, '').replace(/(^|\s)\*\*\s+/g, '$1**').replace(/\s+\*\*(\s|$)/g, '**$1').trim();

async function get(url, tries = 5) {
  for (let k = 1; ; k++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return { json: await res.json(), headers: res.headers };
    } catch (e) {
      if (k >= tries) throw new Error(`${url}: ${e.message}`);
      await sleep(2000 * k);
    }
  }
}

/* ---------- book author, from the SEO title ---------- */
// "Title (Author) | …", "Title Summary (Author) | …", "Title by Author (4-Min Book Summary)"
const NAMEISH = /^[\p{Lu}][\p{L}.'’\-]*(?:[ ,&]+(?:and |de |van |von |la |del |da |di |le )?[\p{Lu}][\p{L}.'’\-]*){0,7}$/u;
function authorOf(seoTitle, description) {
  const head = clean(seoTitle).split(' | ')[0].trim();
  let m = head.match(/\(([^()]+)\)\s*$/);
  if (m && !/\b(min|minute|summary|book|review|quotes?)\b/i.test(m[1]) && NAMEISH.test(m[1].trim())) return m[1].trim();
  m = head.match(/\sby\s(.+?)(?:\s*\(|$)/);
  if (m && NAMEISH.test(m[1].trim())) return m[1].trim();
  m = clean(description).match(/\bby ((?:[\p{Lu}][\p{L}.'’\-]+)(?: (?:[\p{Lu}][\p{L}.'’\-]+)){1,3})/u);
  return m ? m[1] : '';
}

/* ---------- summary HTML -> Folio Markdown ---------- */
const DROP = 'script,style,iframe,form,noscript,img,figure,svg,video,audio,.su-note,.convertkit-form,[class*="convertkit"],.youtube-video,.wp-block-embed,a.button,.glyphicon,sup';
function inline(node) {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { out += decode(c.rawText); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.rawTagName?.toLowerCase();
    const inner = inline(c);
    if (t === 'br') out += ' ';
    else if ((t === 'strong' || t === 'b') && inner.trim()) out += ` **${inner.trim()}** `;
    else if ((t === 'em' || t === 'i') && inner.trim()) out += ` *${inner.trim()}* `;
    else out += inner;
  }
  return out.replace(/\*/g, m => m);   // keep markers; tidy() fixes spacing
}
const text = n => tidy(inline(n));
// Markdown-safe paragraph: a line that happens to start like a list, quote or heading is escaped by a zero-width joiner
const para = s => /^([-*>#]|\d+\.)\s/.test(s) ? '‍' + s : s;

function convert(html, title) {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  root.querySelectorAll(DROP).forEach(n => n.remove());
  const md = [], lessons = [];
  let hook = '', minutes = 4, skipping = false, introOpen = false, sawHeading = false;
  const push = s => { if (!skipping && s) md.push(s); };

  const blocks = [];
  (function collect(n) {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      const t = c.rawTagName?.toLowerCase();
      if (['p', 'h2', 'h3', 'h4', 'ol', 'ul', 'blockquote'].includes(t)) blocks.push(c);
      else if (['div', 'section', 'article', 'span', 'center'].includes(t)) collect(c);
    }
  })(root);

  for (const b of blocks) {
    const t = b.rawTagName.toLowerCase();
    if (t === 'h2' || t === 'h3' || t === 'h4') {
      const h = clean(b.innerHTML);
      if (!h) continue;
      sawHeading = true;
      skipping = /^video summary|^(listen|watch)\b|^free (pdf|audio)|^download/i.test(h);
      if (skipping) continue;
      let m;
      if ((m = h.match(/^lesson\s*(\d+)\s*[:.–—-]\s*(.+)$/i))) {
        const lesson = m[2].trim().replace(/\.$/, '');   // headlines read better without a full stop
        lessons.push(lesson);
        push(`## Lesson ${m[1]}`); push(`### ${lesson}`);
      } else if (/^who would i recommend/i.test(h)) push(`## Who it’s for`);
      else if (/\breview\b/i.test(h) && h.length < title.length + 40) push(`## Review`);
      else push(t === 'h2' ? `### ${h}` : `### ${h}`);
      continue;
    }
    if (t === 'ol' || t === 'ul') {
      const items = b.querySelectorAll(':scope > li').map(text).filter(Boolean);
      if (!items.length) continue;
      if (!sawHeading && !introOpen) { push('## Overview'); introOpen = true; }
      push(items.map((x, k) => (t === 'ol' ? `${k + 1}. ` : '- ') + x).join('\n'));
      continue;
    }
    const s = text(b);
    if (!s) continue;
    const plain = s.replace(/\*/g, '');
    let m;
    if ((m = plain.match(/^1-Sentence[- ]Summary:\s*(.+)$/i))) { hook = m[1].trim(); continue; }
    if ((m = plain.match(/^Read in:\s*(\d+)/i))) { minutes = +m[1]; continue; }
    if (/^(favorite|favourite) quote from the author/i.test(plain)) continue;
    if (/^(if you want to save this summary|download pdf|video summary|listen to the audio|read the full|get the book)/i.test(plain)) continue;
    if (t === 'blockquote') { push(`> ${s}`); continue; }
    if (!sawHeading && !introOpen) { push('## Overview'); introOpen = true; }
    push(para(s));
  }
  const body = md.join('\n\n').replace(/\n{3,}/g, '\n\n');
  const head = `# ${title}\n\n` + (hook ? `> ${hook.replace(/\*/g, '')}\n\n` : '');
  return { md: head + body + '\n', hook: hook.replace(/\*/g, ''), minutes, lessons };
}

/* ---------- fetch everything ---------- */
const cats = (await get(`${API}/categories?per_page=100&_fields=id,name`)).json;
const catName = new Map(cats.map(c => [c.id, clean(c.name)]));
const fields = 'id,date,link,title,categories,content.rendered,yoast_head_json.title,yoast_head_json.description';
const first = await get(`${API}/posts?per_page=100&page=1&_fields=${fields}`);
const pages = +first.headers.get('x-wp-totalpages') || 1;
let posts = first.json;
for (let p = 2; p <= pages; p++) {
  await sleep(800);
  posts = posts.concat((await get(`${API}/posts?per_page=100&page=${p}&_fields=${fields}`)).json);
  process.stdout.write(`\rfetched page ${p}/${pages}`);
}
process.stdout.write('\n');

await mkdir(OUT_DIR, { recursive: true });
for (const f of await readdir(OUT_DIR)) if (f.endsWith('.md')) await rm(resolve(OUT_DIR, f));

const used = new Map(), books = [], problems = [];
for (const p of posts.filter(p => /-summary\/?$/.test(p.link))) {
  const slug = p.link.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
  const title = clean(p.title?.rendered).replace(/\s*[-–—:]?\s*(Book\s+)?Summary$/i, '').trim();
  if (!title) continue;
  const y = p.yoast_head_json || {};
  const names = (p.categories || []).map(id => catName.get(id)).filter(n => n && !SKIP_CATS.has(n));
  names.forEach(n => used.set(n, (used.get(n) || 0) + 1));
  const { md, hook, minutes, lessons } = convert(p.content?.rendered || '', title);
  const words = md.split(/\s+/).length;
  if (words < 250) problems.push(`${slug} (${words} words)`);
  await writeFile(resolve(OUT_DIR, slug.replace(/-summary$/, '') + '.md'), md);
  books.push({ s: slug, t: title, a: authorOf(y.title, y.description), c: names, h: hook, m: minutes, l: lessons.slice(0, 5), w: words, d: String(p.date || '').slice(0, 10) });
}
books.sort((x, y) => x.t.localeCompare(y.t, 'en', { sensitivity: 'base' }));

const catList = [...used.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
const idx = new Map(catList.map((n, i) => [n, i]));
await writeFile(OUT_CATALOG, JSON.stringify({
  source: 'https://fourminutebooks.com/book-summaries/',
  credit: 'Summaries by Four Minute Books (Niklas Göke), fourminutebooks.com. Republished with permission.',
  base: 'https://fourminutebooks.com/',
  updated: new Date().toISOString().slice(0, 10),
  cats: catList,
  books: books.map(b => ({ ...b, c: b.c.map(n => idx.get(n)) })),
}));
const stats = {
  books: books.length, categories: catList.length,
  noAuthor: books.filter(b => !b.a).length, noHook: books.filter(b => !b.h).length,
  noLessons: books.filter(b => !b.l.length).length, short: problems.length,
};
console.log(stats);
if (problems.length) console.log('short summaries:', problems.slice(0, 12).join(', '), problems.length > 12 ? '…' : '');
