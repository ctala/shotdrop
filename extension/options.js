const endpoint = document.getElementById('endpoint');
const token = document.getElementById('token');
const ok = document.getElementById('ok');

chrome.storage.local.get(['endpoint', 'token']).then((c) => {
  endpoint.value = c.endpoint || ENDPOINT_POR_DEFECTO;
  token.value = c.token || '';
});

document.getElementById('guardar').onclick = async () => {
  const e = normalizarEndpoint(endpoint.value);
  const t = token.value.trim();
  endpoint.value = e;
  await chrome.storage.local.set({ endpoint: e, token: t });

  ok.style.color = '#9a9aab';
  ok.textContent = 'Guardado, probando conexión…';
  const prueba = await probarConexion(e, t);
  ok.style.color = prueba.ok ? '#39ff14' : '#ff5c7a';
  ok.textContent = prueba.mensaje;
};
