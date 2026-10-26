#!/usr/bin/env node
// Headless smoke tests for Folio's newest behaviour: the daily shelf never repeats, read marks
// flow through the library and shelf caption, Recall schedules FSRS cards, and the Memory sheet
// works on desktop and phone. Run against a served copy of the app:
//   python3 -m http.server 8791
//   node tools/media/check.js
const puppeteer = require('puppeteer-core');

const BASE = process.env.FOLIO_URL || 'http://localhost:8791/index.html';
const ORIGIN = new URL(BASE).origin;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const dateAt = d => {
  const x = new Date(2026, 0, 1 + d, 12, 0, 0);
  const p = n => String(n).padStart(2, '0');
  return { iso: `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T12:00:00`, key: `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}` };
};
const freeze = async (page, iso) => page.evaluateOnNewDocument(iso => {
  const Real = Date, fixed = new Real(iso).getTime();
  class FixedDate extends Real {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  }
  window.Date = FixedDate;
}, iso);
const seed = async (page, values) => page.evaluate(v => {
  localStorage.clear();
  for (const [k, x] of Object.entries(v)) localStorage.setItem(k, x);
}, values);
const setRead = async (page, read) => page.evaluate(r => localStorage.setItem('folio:read', JSON.stringify(r)), read);
const load = async (page, iso, values, clear = true) => {
  await page.goto(ORIGIN + '/README.md', { waitUntil: 'domcontentloaded' });   // same origin, no app
  if (clear) await seed(page, values || {});
  else if (values) await page.evaluate(v => { for (const [k, x] of Object.entries(v)) localStorage.setItem(k, x); }, values);
  await freeze(page, iso);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.slot');
};
const openQuiz = async page => {
  await page.evaluate(() => document.querySelector('#rail button.qz').click());
  await page.waitForFunction(() => document.querySelector('#title').textContent === 'Recall', { timeout: 10000 });
  await sleep(400);
  await page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
  await page.keyboard.press('Enter');
  await page.waitForSelector('#reader.ready', { timeout: 15000 });
};
const ORWELL = [
  ['Where does Winston work?', 'The Ministry of Truth'],
  ['What forbidden act begins Winston’s rebellion?', 'Keeping a diary'],
  ['Who turns out to be a loyal Party man all along?', 'O’Brien'],
  ['What must Winston believe two and two make?', 'Five'],
  ['Where does Winston finally betray Julia?', 'Room 101'],
];

let browser;
(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

  // 1. Daily shelves never repeat and never show a book already marked read.
  {
    const ctx = await browser.createBrowserContext();
    const read = {}, seen = new Set();
    for (let d = 0; d < 12; d++) {
      const { iso, key } = dateAt(d);
      const page = await ctx.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      if (d === 0) {
        await load(page, iso, { 'folio:read': '{}', 'folio:perday': '6' });
      } else {
        await page.goto(ORIGIN + '/README.md', { waitUntil: 'domcontentloaded' });
        await setRead(page, read);
        await freeze(page, iso);
        await page.goto(BASE, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.slot');
      }
      const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('folio:days') || '{}'));
      const ids = hist[key] || [];
      check(`day ${d + 1}: six books picked`, ids.length === 6, `${ids.length}`);
      const repeats = ids.filter(id => seen.has(id));
      check(`day ${d + 1}: no repeated book`, repeats.length === 0, repeats.join(', '));
      const readShown = ids.filter(id => read[id]);
      check(`day ${d + 1}: read books stay off the shelf`, readShown.length === 0, readShown.join(', '));
      ids.forEach(id => seen.add(id));
      if (ids[0]) read[ids[0]] = key;
      await page.close();
    }
    await ctx.close();
  }

  // 2. Finishing a library book marks it read, seals its tile, and adds the shelf check glyph.
  const READ_DATE = dateAt(59);   // 2026-03-01 at local noon
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await load(page, READ_DATE.iso, {
      'folio:read': '{}',
      'folio:perday': '6',
      'folio:days': JSON.stringify({ [READ_DATE.key]: ['be-our-guest'] }),
    });
    const title = await page.$eval('#title', el => el.textContent);
    check('library book is first on the shelf', title === 'Be Our Guest', title);
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Enter');
    await page.waitForSelector('#reader.ready', { timeout: 15000 });

    let turns = 0;
    while (turns++ < 60 && !(await page.$eval('#rNext', b => b.disabled))) {
      const before = await page.$eval('#rProg', el => el.dataset.tip);
      await page.click('#rNext');
      await page.waitForFunction(b => document.querySelector('#rProg').dataset.tip !== b, { timeout: 6000 }, before).catch(() => {});
    }
    await sleep(400);
    check('reached the final spread', await page.$eval('#rNext', b => b.disabled), await page.$eval('#rProg', el => el.dataset.tip));
    const read = await page.evaluate(() => JSON.parse(localStorage.getItem('folio:read') || '{}'));
    check('final spread writes folio:read', read['be-our-guest'] === READ_DATE.key, JSON.stringify(read));

    await page.click('#rClose');
    await page.waitForFunction(() => document.querySelector('#reader').hidden, { timeout: 12000 });
    await page.click('#libBtn');
    await page.waitForSelector('#lib:not([hidden]) .tile');
    const tile = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.tile')].find(x => (x.getAttribute('aria-label') || '').startsWith('Be Our Guest'));
      return t ? { done: t.classList.contains('done'), seal: getComputedStyle(t.querySelector('.seal')).display, hidden: t.hidden } : null;
    });
    check('library tile carries .done', tile && tile.done);
    check('library tile shows the gilt seal', tile && tile.seal !== 'none', tile && tile.seal);
    await page.evaluate(() => document.querySelector('.chip[data-cat="read"]').click());
    await sleep(200);
    const filtered = await page.evaluate(() => ({
      count: document.querySelector('#libCount').textContent,
      shown: [...document.querySelectorAll('.tile')].filter(t => !t.hidden).map(t => t.getAttribute('aria-label')),
      readCount: document.querySelector('#readCount')?.textContent,
    }));
    check('Read chip filters to the finished book', filtered.shown.length === 1 && filtered.shown[0].startsWith('Be Our Guest'), JSON.stringify(filtered));
    check('Read chip count is 1', filtered.readCount === '1', filtered.readCount);
    await page.evaluate(() => document.querySelector('#libClose').click());
    await page.waitForFunction(() => document.querySelector('#lib').hidden, { timeout: 5000 });
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('ArrowRight'); await sleep(700);
    await page.keyboard.press('ArrowLeft'); await sleep(700);
    const glyph = await page.evaluate(() => [...document.querySelectorAll('#glyphs [data-tip]')].map(x => x.dataset.tip).find(x => x.startsWith('Read')));
    check('shelf caption shows the check glyph', !!glyph, glyph || 'missing');
    await ctx.close();
  }

  // 3. Recall: a read Folio original gives five new cards, answers schedule FSRS, confidence re-grades,
  //    and the Memory sheet saves settings and traps arrow keys while a field is focused.
  const QUIZ_DATE = dateAt(60);   // 2026-03-02
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await load(page, QUIZ_DATE.iso, {
      'folio:read': JSON.stringify({ orwell: '2026-01-01' }),
      'folio:perday': '6',
      'folio:mem': JSON.stringify({ confidence: true }),
    });
    await openQuiz(page);
    let answers = 0, firstDue = null;
    for (let k = 0; k < 5; k++) {
      if (k === 0) { await page.click('#rNext'); await sleep(900); }
      await page.waitForSelector('#rRight .qq h3', { timeout: 8000 });
      const q = await page.$eval('#rRight .qq', el => ({
        text: el.querySelector('h3').textContent,
        opts: [...el.querySelectorAll('.opt span')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      }));
      const known = ORWELL.find(x => x[0] === q.text);
      const i = known ? q.opts.indexOf(known[1]) : -1;
      check(`Recall question ${k + 1} has a known correct answer`, i >= 0, q.text);
      await page.click(`#rRight .qq .opt[data-i="${Math.max(0, i)}"]`);
      await page.waitForFunction(id => !!document.querySelector(`#rRight .qq .nextrev`), { timeout: 5000 }, `orwell-${k}`).catch(() => {});
      const review = await page.$eval('#rRight .qq', el => ({
        next: el.querySelector('.nextrev')?.textContent.trim() || '',
        conf: [...el.querySelectorAll('.cf')].map(x => x.textContent.trim()),
      }));
      check(`question ${k + 1}: scheduled for later`, /back (in|tomorrow|today)/.test(review.next), review.next);
      if (k === 0) {
        check('confidence buttons appear after a right answer', review.conf.join(',') === 'Hard,Good,Easy', review.conf.join(','));
        const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('folio:cards') || '{}'));
        firstDue = cards['orwell-0']?.due;
        await page.click('#rRight .qq .cf[data-g="4"]');
        await sleep(300);
        const after = await page.evaluate(() => ({
          cards: JSON.parse(localStorage.getItem('folio:cards') || '{}'),
          on: document.querySelector('#rRight .qq .cf.on')?.textContent.trim(),
        }));
        check('re-grade to Easy updates the card', after.cards['orwell-0'].due >= firstDue, `${firstDue} -> ${after.cards['orwell-0'].due}`);
        check('Easy is marked as the chosen confidence', after.on === 'Easy', after.on);
        const ansKey = 'folio:quiz:' + QUIZ_DATE.key;
        const ans = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), ansKey);
        check('answer saved with grade 4', ans['orwell-0']?.g === 4, JSON.stringify(ans['orwell-0']));
      }
      answers++;
      if (k < 4) { await page.click('#rNext'); await sleep(900); }
    }
    check('all five cards answered', answers === 5, String(answers));
    const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('folio:cards') || '{}'));
    check('five orwell cards exist in folio:cards', ['orwell-0','orwell-1','orwell-2','orwell-3','orwell-4'].every(id => cards[id]?.reps === 1));

    await page.evaluate(() => document.querySelector('#rMem').click());
    await page.waitForFunction(() => !document.querySelector('#memSheet').hidden, { timeout: 3000 });
    const sheet = await page.$eval('#memSheet', el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: el.scrollHeight, client: el.clientHeight, overflow: getComputedStyle(el).overflowY };
    });
    check('desktop Memory sheet is on screen', sheet.left >= 0 && sheet.right <= sheet.w + 1 && sheet.top >= 0 && sheet.bottom <= sheet.h + 1, JSON.stringify(sheet));
    await page.evaluate(() => document.querySelector('#memSheet details').open = true);
    await page.$eval('#msW', el => { el.value = '1, 2, 3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(100);
    const bad = await page.evaluate(() => ({ cls: document.querySelector('#msW').classList.contains('bad'), hint: document.querySelector('#msWHint').textContent }));
    check('FSRS textarea rejects anything but 19 numbers', bad.cls && /Needs 19 numbers/.test(bad.hint), JSON.stringify(bad));
    const w19 = Array.from({ length: 19 }, (_, i) => (0.4 + i * 0.1).toFixed(4)).join(', ');
    await page.$eval('#msW', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, w19);
    await sleep(100);
    const savedW = await page.evaluate(() => JSON.parse(localStorage.getItem('folio:mem') || '{}').w?.length);
    check('valid 19-number parameters save to folio:mem', savedW === 19, String(savedW));
    await page.evaluate(() => { const el = document.querySelector('#msRet'); el.value = '95'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(100);
    check('retention slider saves', await page.evaluate(() => JSON.parse(localStorage.getItem('folio:mem') || '{}').retention === 0.95));
    const tipBefore = await page.$eval('#rProg', el => el.dataset.tip);
    await page.focus('#msW');
    await page.keyboard.press('ArrowRight');
    await sleep(250);
    const tipAfter = await page.$eval('#rProg', el => el.dataset.tip);
    check('arrow keys do not turn pages while a field is focused', tipBefore === tipAfter && !(await page.$eval('#reader', el => el.hidden)), `${tipBefore} -> ${tipAfter}`);

    // Same sheet on a phone viewport.
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await sleep(300);
    await page.evaluate(() => { document.querySelector('#memSheet').hidden = true; });
    await page.evaluate(() => window.closeMemSheet && window.closeMemSheet());
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.slot');
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Enter');
    await page.waitForSelector('#reader.ready', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('#rMem').click());
    await page.waitForFunction(() => !document.querySelector('#memSheet').hidden, { timeout: 3000 });
    const phone = await page.$eval('#memSheet', el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, scroll: el.scrollHeight, client: el.clientHeight, overflow: getComputedStyle(el).overflowY };
    });
    check('phone Memory sheet fits the screen', phone.left >= 0 && phone.right <= phone.w + 1 && phone.top >= 0 && phone.bottom <= phone.h + 1, JSON.stringify(phone));
    check('phone Memory sheet scrolls when needed', phone.overflow === 'auto' || phone.overflow === 'scroll', phone.overflow);
    await page.evaluate(() => document.querySelector('#memSheet details').open = true);
    const pTip = await page.$eval('#rProg', el => el.dataset.tip);
    await page.focus('#msW');
    await page.keyboard.press('ArrowRight');
    await sleep(250);
    check('phone: arrow keys do not turn the page under the sheet', pTip === await page.$eval('#rProg', el => el.dataset.tip));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch(async e => { console.error(e); if (browser) await browser.close(); process.exitCode = 1; });
