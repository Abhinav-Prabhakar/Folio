// Captures README media from the running app: stills, phone shots and GIFs (via CDP screencast -> gifski).
// usage: node capture.js [stills|mobile|hero|gifs|<gifname>] ...
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { execSync } = require('child_process');
const ROOT = require('path').resolve(__dirname, '../..') + '/';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.FOLIO_URL || (process.env.FOLIO_URL || 'http://localhost:8791/index.html');
const OUT = ROOT + 'docs/media/';
const ASSETS = ROOT + 'assets/';
const TMP = __dirname + '/.frames/';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const THEME = process.env.THEME || 'light', SUF = THEME === 'dark' ? '-dark' : '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = k => !want.length || want.includes(k);

async function fresh(browser, w, h, dpr = 1, mobile = false) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: THEME }]);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(2600);
  return page;
}
const $c = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const ready = page => page.waitForFunction(() => document.getElementById('reader').classList.contains('ready'), { timeout: 60000 });
const shut = page => page.waitForFunction(() => document.getElementById('reader').hidden, { timeout: 60000 });
const idle = async page => { await sleep(250); await page.waitForFunction(() => document.getElementById('rLeaf').style.visibility !== 'visible', { timeout: 60000 }); await sleep(150); };
const goto = async (page, i) => { await page.evaluate(i => document.querySelector(`.rail button[data-i="${i}"]`).click(), i); await sleep(1800); };
const quizIndex = page => page.evaluate(() => +document.querySelector('.rail button.qz').dataset.i);

/* a soft touch indicator, since headless Chrome draws no cursor */
async function cursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('fakecur')) return;
    const c = document.createElement('div'); c.id = 'fakecur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(23,23,26,.10);border:1px solid rgba(23,23,26,.45);z-index:9999;pointer-events:none;transition:transform .55s cubic-bezier(.3,.7,.2,1),opacity .3s;opacity:0;transform:translate(640px,700px)';
    document.body.appendChild(c);
  });
}
async function tap(page, p, { drag } = {}) {
  await page.evaluate(({ x, y }) => { const c = document.getElementById('fakecur'); c.style.opacity = 1; c.style.transform = `translate(${x}px,${y}px)`; }, p);
  await sleep(650);
  await page.evaluate(() => { const c = document.getElementById('fakecur'); c.animate([{ scale: 1 }, { scale: .72 }, { scale: 1 }], { duration: 260 }); });
  await page.mouse.click(p.x, p.y);
}
async function drag(page, from, to, steps = 26) {
  await page.evaluate(({ x, y }) => { const c = document.getElementById('fakecur'); c.style.opacity = 1; c.style.transform = `translate(${x}px,${y}px)`; }, from);
  await sleep(600);
  await page.evaluate(() => { document.getElementById('fakecur').style.transition = 'opacity .3s'; });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let k = 1; k <= steps; k++) {
    const x = from.x + (to.x - from.x) * k / steps, y = from.y + (to.y - from.y) * k / steps;
    await page.mouse.move(x, y);
    await page.evaluate(({ x, y }) => { document.getElementById('fakecur').style.transform = `translate(${x}px,${y}px) scale(.8)`; }, { x, y });
    await sleep(16);
  }
  await page.mouse.up();
  await page.evaluate(() => { const c = document.getElementById('fakecur'); c.style.transition = 'transform .55s cubic-bezier(.3,.7,.2,1),opacity .3s'; });
}
const hideCur = page => page.evaluate(() => { const c = document.getElementById('fakecur'); if (c) c.style.opacity = 0; });

/* record a GIF: screencast frames resampled to a steady frame rate, then encoded by gifski */
async function record(page, name, action, { fps = 25, width = 960, hold = 900 } = {}) {
  const client = await page.target().createCDPSession();
  const frames = [];
  client.on('Page.screencastFrame', async f => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    try { await client.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (_) {}
  });
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await sleep(300);
  await action();
  await sleep(hold);
  await client.send('Page.stopScreencast');
  const dir = TMP + name + SUF + '/'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  const t0 = frames[0].t, t1 = frames[frames.length - 1].t + hold / 1000;
  let j = 0, k = 0;
  for (let t = t0; t <= t1; t += 1 / fps) {
    while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
    fs.writeFileSync(dir + String(k++).padStart(5, '0') + '.png', Buffer.from(frames[j].data, 'base64'));
  }
  execSync(`gifski --fps ${fps} --width ${width} --quality 90 --motion-quality 80 -o "${OUT}${name}${SUF}.gif" ${dir}*.png`, { stdio: 'pipe' });
  const kb = Math.round(fs.statSync(OUT + name + SUF + '.gif').size / 1024);
  console.log(`${name}.gif  ${frames.length} raw frames -> ${k} @${fps}fps  ${kb} KB`);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-color-profile=srgb'] });

  if (on('stills')) {
    const page = await fresh(browser, 1440, 900, 2);
    await goto(page, 2); await page.screenshot({ path: OUT + 'shelf' + SUF + '.png' });
    // hover a glyph to show a tucked-away detail
    const g = await $c(page, '#glyphs .g:nth-of-type(1)'); await page.mouse.move(g.x, g.y); await sleep(500);
    const gr = await page.evaluate(() => { const r = document.getElementById('glyphs').getBoundingClientRect(); return { x: r.left - 80, y: r.top - 96, width: r.width + 160, height: r.height + 120 }; });
    await page.screenshot({ path: OUT + 'detail-hover' + SUF + '.png', clip: gr });
    await page.mouse.move(10, 10);
    const qi = await quizIndex(page);
    await goto(page, qi); await page.screenshot({ path: OUT + 'quiz-shelf' + SUF + '.png' });
    await goto(page, 2);
    await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page); await sleep(400);
    await page.screenshot({ path: OUT + 'reading-title' + SUF + '.png' });
    await page.evaluate(() => document.getElementById('rNext').click()); await idle(page);
    await page.screenshot({ path: OUT + 'reading' + SUF + '.png' });
    await page.evaluate(() => document.getElementById('rClose').click()); await shut(page);
    await goto(page, qi);
    await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page); await sleep(1800);
    await page.screenshot({ path: OUT + 'quiz-intro' + SUF + '.png' });
    await page.evaluate(() => document.getElementById('rNext').click()); await idle(page);
    // answer wrong on purpose, so both the strike and the ink circle show
    await page.evaluate(() => document.querySelectorAll('#rRight .opt')[0].click());
    await sleep(1800);
    await page.screenshot({ path: OUT + 'quiz-answer' + SUF + '.png' });
    await page.close(); console.log('stills done');
  }

  if (on('mobile')) {
    const page = await fresh(browser, 390, 844, 3, true);
    await goto(page, 1); await page.screenshot({ path: TMP + 'm-shelf' + SUF + '.png' });
    await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page);
    await page.evaluate(() => document.getElementById('rNext').click()); await idle(page);
    await page.screenshot({ path: TMP + 'm-reading' + SUF + '.png' });
    await page.evaluate(() => document.getElementById('rClose').click()); await shut(page);
    const qi = await quizIndex(page);
    await goto(page, qi);
    await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page);
    await page.evaluate(() => document.getElementById('rNext').click()); await idle(page);
    await page.evaluate(() => document.querySelectorAll('#rRight .opt')[1].click()); await sleep(1800);
    await page.screenshot({ path: TMP + 'm-quiz' + SUF + '.png' });
    await page.close(); console.log('mobile done');
  }

  if (on('hero')) {
    for (const [file, w, h, dpr] of [['hero.png', 1600, 800, 2], ['og.png', 1200, 630, 1]]) {
      const page = await fresh(browser, w, h, dpr);
      const qi = await quizIndex(page);
      await goto(page, qi - 3);
      await page.addStyleTag({ content: `.glyphs,.rail,.count{display:none!important} main{grid-template-rows:auto minmax(300px,1fr) auto!important}
        .details{min-height:0!important;padding-bottom:${h > 700 ? 34 : 18}px!important} .details h1{font-size:${h > 700 ? 58 : 46}px!important}
        .details .author{letter-spacing:.42em!important}` });
      await page.evaluate(() => { document.getElementById('title').textContent = 'Folio'; document.getElementById('author').textContent = 'six books a day · read, then recall'; });
      await sleep(900);
      await page.screenshot({ path: (file === 'og.png' && !SUF ? ASSETS : OUT) + file.replace('.png', SUF + '.png') });
      await page.close();
    }
    console.log('hero done');
  }

  const G = n => on('gifs') || want.includes(n);
  if (G('swipe')) {
    const page = await fresh(browser, 1280, 800, 1); await cursor(page);
    await record(page, 'swipe', async () => {
      const c = await $c(page, '.slot.center .front');
      await drag(page, { x: c.x + 260, y: c.y }, { x: c.x - 300, y: c.y }); await sleep(1500);
      await drag(page, { x: c.x + 240, y: c.y }, { x: c.x - 160, y: c.y }); await sleep(1400);
      await drag(page, { x: c.x - 220, y: c.y }, { x: c.x + 200, y: c.y }); await sleep(1300);
      await hideCur(page);
    }, { fps: 20, width: 800, hold: 300 });
    await page.close();
  }
  if (G('open')) {
    const page = await fresh(browser, 1280, 800, 1); await cursor(page);
    await goto(page, 2);
    await record(page, 'open', async () => {
      const c = await $c(page, '.slot.center .front'); await tap(page, c); await hideCur(page);
      await ready(page);
    }, { hold: 1400 });
    await page.close();
  }
  if (G('read')) {
    const page = await fresh(browser, 1280, 800, 1); await cursor(page);
    await goto(page, 2); await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page); await sleep(500);
    await record(page, 'read', async () => {
      await tap(page, { x: 980, y: 420 }); await idle(page); await sleep(900);
      await tap(page, { x: 1000, y: 470 }); await idle(page); await sleep(900);
      await tap(page, { x: 300, y: 450 }); await idle(page); await sleep(500);
      await hideCur(page);
    });
    await page.close();
  }
  if (G('quiz')) {
    const page = await fresh(browser, 1280, 800, 1); await cursor(page);
    const qi = await quizIndex(page); await goto(page, qi);
    await page.evaluate(() => document.getElementById('openBtn').click()); await ready(page); await sleep(1500);
    await page.evaluate(() => document.getElementById('rNext').click()); await idle(page);
    await record(page, 'quiz', async () => {
      await tap(page, await $c(page, '#rRight .opt[data-i="1"] span')); await sleep(2200);
      await tap(page, { x: 1010, y: 640 }); await idle(page); await sleep(500);
      await tap(page, await $c(page, '#rRight .opt[data-i="2"] span')); await sleep(2000);
      await hideCur(page);
    });
    await page.close();
  }
  if (G('theme')) {
    const page = await fresh(browser, 1280, 800, 1); await cursor(page);
    await goto(page, 2);
    await record(page, 'theme', async () => {
      const t = await $c(page, '#theme');
      await tap(page, t); await sleep(1900);
      await page.evaluate(() => { const c = document.getElementById('fakecur'); c.style.borderColor = 'rgba(236,235,239,.6)'; c.style.background = 'rgba(236,235,239,.12)'; });
      await tap(page, t); await sleep(1500);
      await hideCur(page);
    }, { hold: 500 });
    const state = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('folio:theme')]);
    await page.evaluate(() => document.getElementById('theme').click()); await sleep(1200);
    await page.reload({ waitUntil: 'networkidle0' });
    const after = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('folio:theme')]);
    console.log('after two toggles', state, '| after third toggle + reload', after);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
