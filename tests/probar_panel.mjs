// Ejecuta extension/panel.js tal cual, con un DOM y un chrome.* falsos, y fetch REAL
// contra shots.cristiantala.com. Lo unico simulado es lo que solo existe dentro de Chrome.
import fs from 'node:fs';
import zlib from 'node:zlib';

const PANEL = new URL('../extension/panel.js', import.meta.url).pathname;
const COMUN = new URL('../extension/comun.js', import.meta.url).pathname;

function png() {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(tipo), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.from([0, ...Array(4).fill([0, 212, 255]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function elemento() {
  return {
    textContent: '', className: '', hidden: false, style: {}, children: [],
    classList: { add() {}, remove() {} },
    replaceChildren() { this.children = []; },
    append(...h) { this.children.push(...h); },
  };
}

async function correr({ token, archivos, evento = 'drop' }) {
  const els = {};
  const listeners = {};
  const store = { endpoint: 'https://shots.cristiantala.com', token };
  let portapapeles = null;

  globalThis.document = {
    getElementById: (id) => (els[id] ??= elemento()),
    createElement: () => elemento(),
    addEventListener: (ev, fn) => (listeners[ev] ??= []).push(fn),
  };
  globalThis.chrome = {
    storage: { local: {
      get: async (k) => Object.fromEntries([k].flat().filter((x) => x in store).map((x) => [x, store[x]])),
      set: async (o) => Object.assign(store, o),
    } },
    runtime: { openOptionsPage() {} },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (t) => { portapapeles = t; } } }, configurable: true,
  });

  // Carga el archivo real del panel, sin modificarlo.
  // Mismo orden que los <script> de panel.html: comun.js y despues panel.js, en un solo ambito.
  new Function(fs.readFileSync(COMUN, 'utf8') + '\n' + fs.readFileSync(PANEL, 'utf8'))();
  await new Promise((r) => setTimeout(r, 50));

  const e = { preventDefault() {}, relatedTarget: null,
    dataTransfer: { files: archivos }, clipboardData: { files: archivos } };
  await Promise.all(listeners[evento].map((fn) => fn(e)));
  // subir() es async dentro de recibir(); esperar a que el aviso deje de ser "Subiendo…"
  for (let i = 0; i < 100 && ['', 'Subiendo…'].includes(els.estado.textContent); i++)
    await new Promise((r) => setTimeout(r, 100));

  return { aviso: els.estado.textContent, clase: els.estado.className, portapapeles, historial: store.historial };
}

const token = process.env.SHOTDROP_UPLOAD_TOKEN;
if (!token) throw new Error('falta SHOTDROP_UPLOAD_TOKEN');
const img = () => new File([png()], 'Captura.png', { type: 'image/png' });
let fallas = 0;
const check = (nombre, ok, detalle) => { console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre} — ${detalle}`); if (!ok) fallas++; };

// 1. Arrastrar una imagen
let r = await correr({ token, archivos: [img()] });
check('drop de imagen', r.clase === 'listo' && /^https:\/\/shots\.cristiantala\.com\/[0-9a-f]{16}\.png$/.test(r.portapapeles || ''), `"${r.aviso}" → ${r.portapapeles}`);
if (r.portapapeles) {
  const b = Buffer.from(await (await fetch(r.portapapeles)).arrayBuffer());
  check('la imagen bajada es idéntica', b.equals(png()), `${b.length} bytes`);
}
check('queda en el historial', r.historial?.length === 1, `${r.historial?.length ?? 0} entradas`);

// 2. Pegar con ⌘V
r = await correr({ token, archivos: [img()], evento: 'paste' });
check('pegar imagen', r.clase === 'listo' && !!r.portapapeles, `"${r.aviso}"`);

// 3. Archivo que no es imagen
r = await correr({ token, archivos: [new File(['hola'], 'nota.txt', { type: 'text/plain' })] });
check('rechaza no-imagen', r.clase === 'error' && /no es una imagen/.test(r.aviso), `"${r.aviso}"`);

// 4. Token malo
r = await correr({ token: 'malo', archivos: [img()] });
check('token malo', r.clase === 'error' && /token/.test(r.aviso), `"${r.aviso}"`);

// 5. Archivo que ya no se puede leer (lo que pasa con la miniatura temporal de macOS)
const roto = { name: 'tmp.png', type: 'image/png', arrayBuffer: () => Promise.reject(new Error('NotFoundError')) };
r = await correr({ token, archivos: [roto] });
check('archivo temporal borrado', r.clase === 'error' && /No pude leer/.test(r.aviso), `"${r.aviso}"`);

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
