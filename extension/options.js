import { t, applyI18n } from './i18n.js';
import { normalizeEndpoint, testConnection } from './common.js';

const $ = (id) => document.getElementById(id);
const endpoint = $('endpoint');
const token = $('token');
const result = $('result');

function show(text, kind = '') {
  result.textContent = text;
  result.className = `status ${kind}`;
}

const MESSAGES = {
  ok: () => [t('connOk'), 'ok'],
  badToken: () => [t('connBadToken'), 'error'],
  notConfigured: () => [t('connNotConfigured'), 'error'],
  unreachable: (e) => [t('connFail', { endpoint: e }), 'error'],
  unexpected: (_e, status) => [t('connUnexpected', { status }), 'error'],
};

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = normalizeEndpoint(endpoint.value);
  const tk = token.value.trim();
  if (!e) return show(t('needEndpoint'), 'error');
  if (!tk) return show(t('needToken'), 'error');

  endpoint.value = e;
  const copyMode = document.querySelector('input[name=copyMode]:checked').value;
  await chrome.storage.local.set({ endpoint: e, token: tk, copyMode });

  show(t('testing'));
  const { result: r, status } = await testConnection(e, tk);
  show(...MESSAGES[r](e, status));
});

$('changeShortcut').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });

async function init() {
  applyI18n();
  $('security').innerHTML = t('securityNote', { cmd: '<code>wrangler secret put UPLOAD_TOKEN</code>' });
  $('madeBy').innerHTML = `${t('madeBy', { name: '<a href="https://cristiantala.com" target="_blank" rel="noopener">Cristian Tala</a>' })} · v${chrome.runtime.getManifest().version}`;

  const c = await chrome.storage.local.get(['endpoint', 'token', 'copyMode']);
  endpoint.value = c.endpoint || '';
  token.value = c.token || '';
  document.querySelector(`input[name=copyMode][value=${c.copyMode === 'agent' ? 'agent' : 'link'}]`).checked = true;

  const [cmd] = (await chrome.commands.getAll()).filter((x) => x.name === '_execute_action');
  $('shortcutValue').textContent = cmd?.shortcut || t('noShortcut');
}

init();
