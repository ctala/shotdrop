const zona = document.getElementById('zona');
const estado = document.getElementById('estado');
const lista = document.getElementById('lista');
const titulo = document.getElementById('titulo');

const MAX_HISTORIAL = 10;

function aviso(texto, clase = '') {
  estado.textContent = texto;
  estado.className = clase;
}

async function config() {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token']);
  if (!endpoint || !token) throw new Error('Falta configurar el endpoint y el token.');
  return { endpoint: endpoint.replace(/\/+$/, ''), token };
}

async function subir(archivo) {
  if (!archivo.type.startsWith('image/')) {
    aviso(`"${archivo.name}" no es una imagen.`, 'error');
    return;
  }

  aviso('Subiendo…');
  try {
    const { endpoint, token } = await config();
    const r = await fetch(`${endpoint}/up`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': archivo.type },
      body: archivo,
    });

    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || `error ${r.status}`);

    // El copiado ocurre dentro del gesto de soltar, asi que Chrome lo permite. Si igual
    // falla (panel sin foco), el link queda a la vista con su boton de copiar.
    let copiado = true;
    try {
      await navigator.clipboard.writeText(datos.url);
    } catch {
      copiado = false;
    }

    await guardar(datos.url);
    aviso(copiado ? 'Link copiado ✓' : 'Listo — copia el link abajo', 'listo');
  } catch (e) {
    aviso(e.message, 'error');
  }
}

async function guardar(url) {
  const { historial = [] } = await chrome.storage.local.get('historial');
  const nuevo = [{ url, fecha: Date.now() }, ...historial].slice(0, MAX_HISTORIAL);
  await chrome.storage.local.set({ historial: nuevo });
  pintar(nuevo);
}

function pintar(historial) {
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

    const btn = document.createElement('button');
    btn.textContent = 'Copiar';
    btn.onclick = async () => {
      await navigator.clipboard.writeText(url);
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1200);
    };

    item.append(img, a, btn);
    lista.append(item);
  }
}

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

document.addEventListener('drop', async (e) => {
  for (const archivo of e.dataTransfer.files) await subir(archivo);
});

document.addEventListener('paste', async (e) => {
  for (const item of e.clipboardData.files) await subir(item);
});

document.getElementById('abrirOpciones').onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

chrome.storage.local.get('historial').then(({ historial = [] }) => pintar(historial));
config().catch((e) => aviso(e.message, 'error'));
