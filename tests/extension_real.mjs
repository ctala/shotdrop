// Carga la extension REAL en Chromium, la configura por su pagina de opciones y
// suelta una imagen en el panel. Registra consola y fallos de red.
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = new URL('../extension', import.meta.url).pathname;
const EXE = process.env.CHROMIUM || undefined; // vacio = el Chromium de Playwright
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-'));
const endpoint = process.env.ENDPOINT || 'https://shots.cristiantala.com';

const ctx = await chromium.launchPersistentContext(perfil, {
  executablePath: EXE,
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
const id = new URL(sw.url()).host;
console.log('extension id:', id);

// Configurar como lo haria el usuario: pagina de opciones
const op = await ctx.newPage();
await op.goto(`chrome-extension://${id}/options.html`);
await op.fill('#endpoint', endpoint);
await op.fill('#token', process.env.SHOTDROP_UPLOAD_TOKEN);
await op.click('#guardar');
await op.waitForFunction(() => !/probando|^$/.test(document.getElementById('ok').textContent), null, { timeout: 15000 }).catch(() => {});
console.log('OPCIONES:', JSON.stringify(await op.textContent('#ok')), '| endpoint guardado:', await op.inputValue('#endpoint'));

const panel = await ctx.newPage();
panel.on('console', (m) => console.log(`[consola ${m.type()}]`, m.text()));
panel.on('requestfailed', (r) => console.log('[red FALLO]', r.method(), r.url(), r.failure()?.errorText));
panel.on('response', (r) => { if (r.url().includes('shots.')) console.log('[red]', r.request().method(), r.status(), r.url()); });
await panel.goto(`chrome-extension://${id}/panel.html`);

// Soltar una imagen de verdad (PNG de 1x1) con un DataTransfer real
await panel.evaluate(async () => {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcP8PAAIBAYA7GXUAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], 'captura.png', { type: 'image/png' }));
  document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});

await panel.waitForFunction(() => !['', 'Subiendo…'].includes(document.getElementById('estado').textContent), null, { timeout: 15000 }).catch(() => {});
console.log('AVISO DEL PANEL:', JSON.stringify(await panel.textContent('#estado')));
console.log('HISTORIAL:', await panel.evaluate(() => [...document.querySelectorAll('.item a')].map((a) => a.href)));

await ctx.close();
fs.rmSync(perfil, { recursive: true, force: true });
