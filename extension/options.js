const endpoint = document.getElementById('endpoint');
const token = document.getElementById('token');
const ok = document.getElementById('ok');

chrome.storage.local.get(['endpoint', 'token']).then((c) => {
  endpoint.value = c.endpoint || '';
  token.value = c.token || '';
});

document.getElementById('guardar').onclick = async () => {
  await chrome.storage.local.set({
    endpoint: endpoint.value.trim().replace(/\/+$/, ''),
    token: token.value.trim(),
  });
  ok.textContent = 'Guardado ✓';
  setTimeout(() => { ok.textContent = ''; }, 1500);
};
