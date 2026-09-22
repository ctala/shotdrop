const zona = document.getElementById('zona');
const estado = document.getElementById('estado');
const lista = document.getElementById('lista');
const titulo = document.getElementById('titulo');

const MAX_HISTORIAL = 10;
// Igual a la regla de lifecycle del bucket. Pasado este plazo el link ya no sirve y no se muestra.
const VIDA_MS = 7 * 24 * 60 * 60 * 1000;

const vivos = (historial) => historial.filter((h) => Date.now() - h.fecha < VIDA_MS);

function aviso(texto, clase = '') {
  estado.textContent = texto;
  estado.className = clase;
}

async function config() {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token']);
  if (!token) throw new Error('Falta el token: ábrelo en Configuración.');
  return { endpoint: normalizarEndpoint(endpoint), token };
}

// Los bytes se leen EN el drop, no al subir. La miniatura flotante de ⌘⇧4 entrega un
// archivo temporal que macOS borra apenas termina el arrastre; si fetch lo lee despues,
// ya no existe y falla con un "Failed to fetch" sin respuesta del servidor.
function leerTodos(archivos) {
  return Promise.all(
    [...archivos].map(async (a) => ({
      nombre: a.name,
      tipo: a.type,
      datos: a.type.startsWith('image/') ? await a.arrayBuffer() : null,
    }))
  );
}

async function subir({ nombre, tipo, datos }) {
  if (!datos) {
    aviso(`"${nombre}" no es una imagen.`, 'error');
    return;
  }

  aviso('Subiendo…');
  try {
    const { endpoint, token } = await config();
    let r;
    try {
      r = await fetch(`${endpoint}/up`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': tipo },
        body: datos,
      });
    } catch {
      throw new Error(`No pude conectar con ${endpoint}. Revisa la Configuración.`);
    }

    const resp = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(resp.error || `error ${r.status}`);

    // El copiado ocurre dentro del gesto de soltar, asi que Chrome lo permite. Si igual
    // falla (panel sin foco), el link queda a la vista con su boton de copiar.
    let copiado = true;
    try {
      await navigator.clipboard.writeText(resp.url);
    } catch {
      copiado = false;
    }

    await guardar(resp.url);
    aviso(copiado ? 'Link copiado ✓' : 'Listo — copia el link abajo', 'listo');
  } catch (e) {
    aviso(e.message, 'error');
  }
}

async function guardar(url) {
  const { historial = [] } = await chrome.storage.local.get('historial');
  const nuevo = [{ url, fecha: Date.now() }, ...vivos(historial)].slice(0, MAX_HISTORIAL);
  await chrome.storage.local.set({ historial: nuevo });
  pintar(nuevo);
}

async function quitar(url) {
  const { historial = [] } = await chrome.storage.local.get('historial');
  const nuevo = vivos(historial).filter((h) => h.url !== url);
  await chrome.storage.local.set({ historial: nuevo });
  pintar(nuevo);
}

async function borrar(url) {
  try {
    const { token } = await config();
    const r = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    // 404 = ya no existia (lo borro el lifecycle o se borro antes): igual se saca de la lista.
    if (!r.ok && r.status !== 404) {
      const resp = await r.json().catch(() => ({}));
      throw new Error(resp.error || `error ${r.status}`);
    }
    await quitar(url);
    aviso('Borrado ✓ El link ya no funciona.', 'listo');
  } catch (e) {
    aviso(`No se pudo borrar: ${e.message}`, 'error');
  }
}

function boton(texto, clase) {
  const b = document.createElement('button');
  b.textContent = texto;
  if (clase) b.className = clase;
  return b;
}

function pintar(historial) {
  historial = vivos(historial);
  titulo.hidden = historial.length === 0;
  lista.replaceChildren();

  for (const { url } of historial) {
    const item = document.createElement('div');
    item.className = 'item';

    const img = document.createElement('img');
    img.src = url;
    img.loading = 'lazy';
    // Si el lifecycle ya borro el objeto, el link sigue listado pero sin miniatura.
    img.onerror = () => { img.style.visibility = 'hidden'; };

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.textContent = url.replace(/^https?:\/\//, '');

    const copiar = boton('Copiar');
    copiar.onclick = async () => {
      await navigator.clipboard.writeText(url);
      copiar.textContent = '✓';
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1200);
    };

    // Dos clics para borrar: el primero arma, el segundo confirma. Sin dialogos del navegador.
    const tacho = boton('Borrar', 'borrar');
    let armado = null;
    tacho.onclick = () => {
      if (armado) {
        clearTimeout(armado);
        tacho.disabled = true;
        tacho.textContent = '…';
        return borrar(url);
      }
      tacho.textContent = '¿Seguro?';
      tacho.classList.add('armado');
      armado = setTimeout(() => {
        armado = null;
        tacho.textContent = 'Borrar';
        tacho.classList.remove('armado');
      }, 3000);
    };

    item.append(img, a, copiar, tacho);
    lista.append(item);
  }
}

// Al abrir el panel se limpian del almacenamiento los links que ya caducaron.
chrome.storage.local.get('historial').then(({ historial = [] }) => {
  const v = vivos(historial);
  if (v.length !== historial.length) chrome.storage.local.set({ historial: v });
});

['dragenter', 'dragover'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add('activa');
  })
);

['dragleave', 'drop'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'drop' || e.relatedTarget === null) zona.classList.remove('activa');
  })
);

async function recibir(archivos) {
  let leidos;
  try {
    leidos = await leerTodos(archivos);
  } catch {
    aviso('No pude leer el archivo. Si arrastraste la miniatura flotante, prueba con el archivo ya guardado.', 'error');
    return;
  }
  if (leidos.length === 0) return aviso('No llegó ninguna imagen.', 'error');
  for (const a of leidos) await subir(a);
}

document.addEventListener('drop', (e) => recibir(e.dataTransfer.files));
document.addEventListener('paste', (e) => recibir(e.clipboardData.files));

document.getElementById('abrirOpciones').onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

chrome.storage.local.get('historial').then(({ historial = [] }) => pintar(historial));
config().catch((e) => aviso(e.message, 'error'));
