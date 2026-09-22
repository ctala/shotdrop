// Captures the real extension UI (panel + settings) against a local Worker, in English and Spanish.
// The PNGs feed the README hero and the Store screenshots.   node assets/src/capture-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, startServer, launchExtension, configure, samples, dropPng } from './harness.mjs';

const OUT = path.join(ROOT, 'assets/ui');
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer();
const pngs = await samples();

for (const lang of ['en', 'es']) {
  const { ctx, id, close } = await launchExtension({ lang });

  const opt = await configure(ctx, id, server);
  await opt.setViewportSize({ width: 760, height: 1180 });
  // A realistic public address in the screenshot instead of localhost.
  await opt.evaluate(() => { document.getElementById('endpoint').value = 'https://shotdrop.your-account.workers.dev'; });
  await opt.evaluate(() => document.fonts.ready);
  await opt.screenshot({ path: path.join(OUT, `options-${lang}.png`), fullPage: true });

  const panel = await ctx.newPage();
  await panel.setViewportSize({ width: 380, height: 720 });
  await panel.goto(`chrome-extension://${id}/panel.html`);
  for (const png of pngs) {
    await dropPng(panel, png);
    await panel.waitForFunction(() => document.getElementById('status').className.includes('ok'));
  }
  await panel.evaluate(() => document.fonts.ready);
  await panel.waitForTimeout(400);
  await panel.screenshot({ path: path.join(OUT, `panel-${lang}.png`) });

  await panel.evaluate(() => document.getElementById('drop').classList.add('active'));
  await panel.screenshot({ path: path.join(OUT, `panel-active-${lang}.png`) });

  console.log(`${lang} → assets/ui/*-${lang}.png`);
  await close();
}
process.exit(0);
