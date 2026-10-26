// Collects every cover in the library (by loading the app on different dates) and lays them out as one image.
const puppeteer = require('puppeteer-core');
const ROOT = require('path').resolve(__dirname, '../..') + '/';
const OUT = ROOT + 'docs/media/';
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const covers = new Map(); let quiz = null;
  for (let d = 0; d < 40 && covers.size < 8; d++) {
    const page = await browser.newPage();
    const iso = new Date(Date.UTC(2026, 0, 1 + d, 12)).toISOString();
    await page.evaluateOnNewDocument(iso => {
      const Real = Date, fixed = new Real(iso).getTime();
      class D extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
      window.Date = D;
    }, iso);
    await page.goto((process.env.FOLIO_URL || 'http://localhost:8791/index.html'), { waitUntil: 'networkidle0' });
    const got = await page.evaluate(() => [...document.querySelectorAll('.slot')].map(s => ({
      title: s.querySelector('.spine span').textContent, svg: s.querySelector('.front svg').outerHTML, i: s.dataset.i })));
    for (const g of got) {
      const svg = g.svg.replaceAll(`c${g.i}-`, `L${covers.size + (quiz ? 1 : 0)}x${g.i}-`);
      if (g.title === 'Recall') { if (!quiz) quiz = svg; } else if (!covers.has(g.title)) covers.set(g.title, svg);
    }
    await page.close();
  }
  console.log('collected', covers.size, [...covers.keys()]);
  const order = ['Pride and Prejudice', 'Frankenstein', 'Moby-Dick', 'The Great Gatsby', 'The Hobbit', 'Nineteen Eighty-Four', 'Dune', 'One Hundred Years of Solitude'];
  const all = order.filter(t => covers.has(t)).map(t => covers.get(t)).concat(quiz ? [quiz] : []);
  const html = `<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Jost:wght@200;300;400;500&family=Poiret+One&family=Cinzel:wght@400;500&display=swap">
  <style>body{margin:0;background:transparent}
  .row{display:flex;gap:34px;padding:60px 70px 90px;align-items:flex-end}
  .c{position:relative;width:170px;aspect-ratio:2/3;border-radius:1px 3px 3px 1px;overflow:hidden;
     box-shadow:0 1px 1px rgba(0,0,0,.25),0 14px 26px -10px rgba(20,18,30,.5),0 40px 60px -30px rgba(20,18,30,.45)}
  .c.q{width:190px}
  .c svg{display:block;width:100%;height:100%}
  .ov{position:absolute;inset:0;pointer-events:none}
  .light{background:linear-gradient(118deg,rgba(255,255,255,.2) 0%,rgba(255,255,255,0) 30%,rgba(0,0,0,0) 58%,rgba(0,0,0,.26) 100%)}
  .hinge{background:linear-gradient(90deg,rgba(0,0,0,.34) 0,rgba(0,0,0,0) 2.4%,rgba(255,255,255,.16) 4.2%,rgba(0,0,0,.26) 5.9%,rgba(255,255,255,.1) 7.2%,rgba(255,255,255,0) 10%)}
  </style></head><body><div class="row">${all.map((s, k) => `<div class="c${k === all.length - 1 && quiz ? ' q' : ''}">${s}<div class="ov light"></div><div class="ov hinge"></div></div>`).join('')}</div></body></html>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 2000, height: 500, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready); await new Promise(r => setTimeout(r, 1500));
  const row = await page.$('.row');
  await row.screenshot({ path: OUT + 'library.png', omitBackground: true });
  await browser.close();
  console.log('library.png written');
})();
