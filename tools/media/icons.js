// Renders Folio's PNG icons with Chrome so they share the leather + gilt look of the quiz book.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '../..') + '/';
const OUT = ROOT + 'assets/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const rich = (size, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
 <defs>
  <radialGradient id="bg" cx=".38" cy=".3" r="1"><stop offset="0" stop-color="#74262b"/><stop offset=".55" stop-color="#46151a"/><stop offset="1" stop-color="#1c0709"/></radialGradient>
  <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="60" y1="60" x2="452" y2="452"><stop offset="0" stop-color="#6a4b15"/><stop offset=".2" stop-color="#e7cb78"/><stop offset=".42" stop-color="#a57a27"/><stop offset=".58" stop-color="#fdf0b4"/><stop offset=".78" stop-color="#94691f"/><stop offset="1" stop-color="#d8b55c"/></linearGradient>
  <linearGradient id="gg" href="#g" gradientUnits="userSpaceOnUse" x1="3" y1="3.5" x2="17" y2="17.5"/>
  <filter id="lth" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="4" seed="7" result="n"/>
   <feDiffuseLighting in="n" surfaceScale="1.6" diffuseConstant="1.12" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="60"/></feDiffuseLighting>
   <feComposite in="d" in2="SourceGraphic" operator="arithmetic" k1="1.08" k2="0" k3="0" k4="0"/></filter>
  <filter id="emb" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/>
   <feSpecularLighting in="b" surfaceScale="5" specularConstant=".9" specularExponent="22" lighting-color="#fff" result="s"><feDistantLight azimuth="225" elevation="40"/></feSpecularLighting>
   <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/><feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".8" k4="0" result="lit"/>
   <feDropShadow dx="2" dy="4" stdDeviation="3" flood-color="#000" flood-opacity=".55"/></filter>
  <clipPath id="c"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath>
 </defs>
 <g clip-path="url(#c)">
  <rect width="512" height="512" fill="url(#bg)" filter="url(#lth)"/>
  <rect x="34" y="34" width="444" height="444" rx="${rounded ? 84 : 26}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5"/>
  <rect x="37" y="37" width="444" height="444" rx="${rounded ? 84 : 26}" fill="none" stroke="#ffd9c4" stroke-opacity=".08" stroke-width="3"/>
  <rect x="58" y="58" width="396" height="396" rx="${rounded ? 64 : 10}" fill="none" stroke="url(#g)" stroke-width="3"/>
  <g filter="url(#emb)"><g transform="translate(64 50) scale(19.2)" fill="none" stroke="url(#gg)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round">
   <path d="M3 4.5c2.5-1 5-1 7 .8 2-1.8 4.5-1.8 7-.8v11c-2.5-1-5-1-7 .8-2-1.8-4.5-1.8-7-.8z"/><path d="M10 5.3v11"/></g></g>
 </g></svg>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  const shot = async (svg, size, file) => {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: OUT + file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot(rich(512, true), 512, 'icon-512.png');
  await shot(rich(192, true), 192, 'icon-192.png');
  await shot(rich(180, false), 180, 'apple-touch-icon.png');   // iOS rounds the corners itself
  const fav = fs.readFileSync(OUT + 'favicon.svg', 'utf8').replace('<svg ', '<svg width="32" height="32" ');
  await shot(fav, 32, 'favicon-32.png');
  await browser.close();
  console.log('icons done');
})();
