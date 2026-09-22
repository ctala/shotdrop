// Carga la extension REAL en Chromium y la usa como el usuario: la configura por su pagina
// de opciones, suelta una imagen en el panel, la borra con dos clics y revisa el historial.
//
//   SHOTDROP_UPLOAD_TOKEN=<de Infisical> node tests/extension_real.mjs
//   ENDPOINT=...   direccion a escribir en Configuracion (por defecto la real)
//   CHROMIUM=...   ejecutable de Chromium (por defecto el de Playwright)
import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const EXT = process.env.EXT || new URL('../extension', import.meta.url).pathname;
const endpoint = process.env.ENDPOINT || 'https://shots.cristiantala.com';
const token = process.env.SHOTDROP_UPLOAD_TOKEN;
if (!token) throw new Error('falta SHOTDROP_UPLOAD_TOKEN');

let fallas = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallas++;
};

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-'));
const ctx = await chromium.launchPersistentContext(perfil, {
  executablePath: process.env.CHROMIUM || undefined,
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const id = new URL(sw.url()).host;

  // --- Configuracion, como la haria el usuario
  const op = await ctx.newPage();
  await op.goto(`chrome-extension://${id}/options.html`);
  await op.fill('#endpoint', endpoint);
  await op.fill('#token', token);
  await op.click('#guardar');
  await op.waitForFunction(() => !/probando|^$/.test(document.getElementById('ok').textContent), null, { timeout: 15000 });
  check('configuración conecta', /token válido/.test(await op.textContent('#ok')), await op.textContent('#ok'));

  // Sembrar un link de hace 8 dias: no debe aparecer y debe salir del almacenamiento.
  const viejo = 'https://shots.cristiantala.com/aaaaaaaaaaaaaaaa.png';
  await op.evaluate((u) => chrome.storage.local.set({ historial: [{ url: u, fecha: Date.now() - 8 * 864e5 }] }), viejo);

  // --- Panel
  const panel = await ctx.newPage();
  panel.on('requestfailed', (r) => console.log('   [red FALLO]', r.method(), r.url(), r.failure()?.errorText));
  await panel.goto(`chrome-extension://${id}/panel.html`);
  await panel.waitForTimeout(400);

  const links = () => panel.$$eval('.item a', (as) => as.map((a) => a.href));
  check('link caducado no se muestra', !(await links()).includes(viejo));
  const guardado = await panel.evaluate(() => chrome.storage.local.get('historial').then((r) => r.historial));
  check('link caducado sale del almacenamiento', guardado.length === 0, `${guardado.length} en storage`);

  // Soltar una imagen real
  await panel.evaluate(() => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcP8PAAIBAYA7GXUAAAAASUVORK5CYII=';
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'captura.png', { type: 'image/png' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await panel.waitForFunction(() => /copiado|Listo|error|No /.test(document.getElementById('estado').textContent), null, { timeout: 15000 });
  const [url] = await links();
  check('subida', /copiado|Listo/.test(await panel.textContent('#estado')) && !!url, url);
  check('el link responde', (await fetch(url)).status === 200);

  // Borrar: un clic arma, no borra
  await panel.click('.item button.borrar');
  check('primer clic solo pide confirmación', (await panel.textContent('.item button.borrar')) === '¿Seguro?');
  check('todavía existe tras el primer clic', (await fetch(url)).status === 200);

  // Segundo clic borra
  await panel.click('.item button.borrar');
  await panel.waitForFunction(() => /Borrado|No se pudo/.test(document.getElementById('estado').textContent), null, { timeout: 15000 });
  check('aviso de borrado', /Borrado/.test(await panel.textContent('#estado')), await panel.textContent('#estado'));
  check('el link ya no existe', (await fetch(url)).status === 404);
  check('sale del historial', (await links()).length === 0);

  // El armado se desarma solo a los 3 s
  await panel.evaluate(() => chrome.storage.local.set({ historial: [{ url: 'https://shots.cristiantala.com/bbbbbbbbbbbbbbbb.png', fecha: Date.now() }] }));
  await panel.reload();
  await panel.waitForTimeout(300);
  await panel.click('.item button.borrar');
  await panel.waitForTimeout(3300);
  check('confirmación caduca a los 3 s', (await panel.textContent('.item button.borrar')) === 'Borrar');
} finally {
  await ctx.close();
  fs.rmSync(perfil, { recursive: true, force: true });
}

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
