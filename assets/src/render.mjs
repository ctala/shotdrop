// Renderiza los assets graficos (iconos, hero, promo y capturas de la Store) con Chromium.
// Todo sale de HTML/SVG con los tokens de la marca: sin texto generado por IA.
//
//   npm i -D playwright && node assets/src/render.mjs [iconos|hero|store|todo]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;
const SRC = path.join(RAIZ, 'assets/src');
const que = process.argv[2] || 'todo';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

async function svgAPng(svg, tam, destino) {
  const page = await browser.newPage({ viewport: { width: tam, height: tam }, deviceScaleFactor: 1 });
  const codigo = fs.readFileSync(path.join(SRC, svg), 'utf8');
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${tam}px;height:${tam}px}</style>${codigo}`
  );
  await page.screenshot({ path: destino, omitBackground: true });
  await page.close();
  console.log('→', path.relative(RAIZ, destino));
}

// Paginas HTML de assets/src; `?lang=es|en` elige el idioma del texto.
async function htmlAPng(html, ancho, alto, destino, { escala = 1, lang = 'en' } = {}) {
  const page = await browser.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: escala });
  await page.goto(`file://${path.join(SRC, html)}?lang=${lang}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: destino });
  await page.close();
  console.log('→', path.relative(RAIZ, destino));
}

if (['iconos', 'todo'].includes(que)) {
  const ICONOS = path.join(RAIZ, 'extension/icons');
  fs.mkdirSync(ICONOS, { recursive: true });
  await svgAPng('icon-small.svg', 16, path.join(ICONOS, 'icon16.png'));
  await svgAPng('icon-small.svg', 32, path.join(ICONOS, 'icon32.png'));
  await svgAPng('icon.svg', 48, path.join(ICONOS, 'icon48.png'));
  await svgAPng('icon.svg', 128, path.join(ICONOS, 'icon128.png'));
  // La Store pide 128x128 con el dibujo en 96x96 y 16 px de aire alrededor.
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  const codigo = fs.readFileSync(path.join(SRC, 'icon.svg'), 'utf8');
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:96px;height:96px;margin:16px}</style>${codigo}`
  );
  await page.screenshot({ path: path.join(RAIZ, 'store/icon-store-128.png'), omitBackground: true });
  await page.close();
  console.log('→ store/icon-store-128.png');
}

if (['hero', 'todo'].includes(que)) {
  // 1280x640 is also GitHub's social preview size.
  for (const lang of ['en', 'es']) await htmlAPng('hero.html', 1280, 640, path.join(RAIZ, `assets/hero-${lang}.png`), { lang });
}

if (['store', 'todo'].includes(que)) {
  for (const lang of ['en', 'es']) {
    await htmlAPng('store-1.html', 1280, 800, path.join(RAIZ, `store/screenshot-1-${lang}.png`), { lang });
    await htmlAPng('store-2.html', 1280, 800, path.join(RAIZ, `store/screenshot-2-${lang}.png`), { lang });
    await htmlAPng('promo.html', 440, 280, path.join(RAIZ, `store/promo-small-${lang}.png`), { lang });
  }
}

await browser.close();
