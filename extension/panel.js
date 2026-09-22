import { t, applyI18n } from './i18n.js';
import { normalizeEndpoint, alive, agentPrompt, errorMessageKey } from './common.js';

const MAX_HISTORY = 10;
const $ = (id) => document.getElementById(id);
const drop = $('drop');
const statusEl = $('status');
const list = $('list');

let clearTimer;
function status(text, kind = '') {
  clearTimeout(clearTimer);
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
  // Success fades out; errors stay until the next action.
  if (kind === 'ok') clearTimer = setTimeout(() => status(''), 5000);
}

async function config() {
  const c = await chrome.storage.local.get(['endpoint', 'token', 'copyMode']);
  const endpoint = normalizeEndpoint(c.endpoint);
  if (!endpoint || !c.token) throw new Error(t('missingConfig'));
  return { endpoint, token: c.token, copyMode: c.copyMode || 'link' };
}

async function serverError(r) {
  const body = await r.json().catch(() => ({}));
  const key = errorMessageKey(body.error);
  return new Error(key ? t(key) : body.message || t('errHttp', { status: r.status }));
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Bytes are read at drop time, not at upload time. The floating thumbnail from ⌘⇧4 hands over a
// temporary file that macOS deletes as soon as the drag ends; reading it later fails silently.
const readAll = (files) =>
  Promise.all(
    [...files].map(async (f) => ({
      name: f.name,
      type: f.type,
      data: f.type.startsWith('image/') ? await f.arrayBuffer() : null,
    }))
  );

async function upload({ name, type, data }) {
  if (!data) return status(t('notImage', { name }), 'error');

  status(t('uploading'));
  drop.classList.add('busy');
  try {
    const { endpoint, token, copyMode } = await config();
    let r;
    try {
      r = await fetch(`${endpoint}/up`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': type },
        body: data,
      });
    } catch {
      throw new Error(t('connectError', { endpoint }));
    }
    if (!r.ok) throw await serverError(r);

    const { url, expiresAt } = await r.json();
    const forAgent = copyMode === 'agent';
    const copied = await copy(forAgent ? agentPrompt(url, t('agentPrompt')) : url);
    await remember({ url, expiresAt, fecha: Date.now() });
    status(copied ? t(forAgent ? 'copiedAgent' : 'copied') : t('copyFallback'), 'ok');
  } catch (e) {
    status(e.message, 'error');
  } finally {
    drop.classList.remove('busy');
  }
}

async function history() {
  const { historial = [] } = await chrome.storage.local.get('historial');
  return alive(historial);
}

async function save(entries) {
  await chrome.storage.local.set({ historial: entries });
  render(entries);
}

const remember = async (entry) => save([entry, ...(await history())].slice(0, MAX_HISTORY));
const forget = async (url) => save((await history()).filter((h) => h.url !== url));

async function remove(url) {
  try {
    const { token } = await config();
    const r = await fetch(url, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    // 404 means it was already gone: drop it from the list anyway.
    if (!r.ok && r.status !== 404) throw await serverError(r);
    await forget(url);
    status(t('deleted'), 'ok');
  } catch (e) {
    status(t('deleteError', { reason: e.message }), 'error');
  }
}

function button(label, title, extra = '') {
  const b = document.createElement('button');
  b.className = `btn ${extra}`.trim();
  b.textContent = label;
  b.title = title;
  return b;
}

function flash(btn, label) {
  const original = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = original; }, 1200);
  status(label, 'ok');
}

function render(entries) {
  entries = alive(entries);
  $('empty').hidden = entries.length > 0;
  list.replaceChildren();

  for (const { url } of entries) {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.style.visibility = 'hidden'; };

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = new URL(url).pathname.slice(1);
    a.title = url;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const agent = button(t('copyAgent'), t('copyAgentTitle'));
    agent.dataset.action = 'agent';
    agent.onclick = async () => { if (await copy(agentPrompt(url, t('agentPrompt')))) flash(agent, t('copiedAgent')); };

    const link = button(t('copy'), t('copyTitle'));
    link.dataset.action = 'copy';
    link.onclick = async () => { if (await copy(url)) flash(link, t('copied')); };

    // Two clicks to delete: the first arms it, the second confirms. No browser dialogs.
    const del = button(t('delete'), t('deleteTitle'), 'btn-danger');
    del.dataset.action = 'delete';
    let armed = null;
    del.onclick = () => {
      if (armed) {
        clearTimeout(armed);
        del.disabled = true;
        del.textContent = '…';
        return remove(url);
      }
      del.textContent = t('confirmDelete');
      del.classList.add('armed');
      armed = setTimeout(() => {
        armed = null;
        del.textContent = t('delete');
        del.classList.remove('armed');
      }, 3000);
    };

    actions.append(agent, link, del);
    li.append(img, a, actions);
    list.append(li);
  }
}

async function receive(files) {
  let read;
  try {
    read = await readAll(files);
  } catch {
    return status(t('readError'), 'error');
  }
  if (read.length === 0) return status(t('noImage'), 'error');
  for (const f of read) await upload(f);
}

// --- wiring
['dragenter', 'dragover'].forEach((ev) =>
  document.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('active');
  })
);
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) drop.classList.remove('active');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('active');
  receive(e.dataTransfer.files);
});
document.addEventListener('paste', (e) => receive(e.clipboardData.files));

$('openSettings').onclick = () => chrome.runtime.openOptionsPage();

async function showShortcut() {
  const el = $('shortcut');
  const [cmd] = (await chrome.commands.getAll()).filter((c) => c.name === '_execute_action');
  el.textContent = cmd?.shortcut ? t('shortcutHint', { shortcut: cmd.shortcut }) : t('noShortcut');
  el.onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  };
}

applyI18n();
if (!/Mac/i.test(navigator.platform)) $('pasteKey').textContent = 'Ctrl+V';
showShortcut();

// Prune expired links from storage when the panel opens.
chrome.storage.local.get('historial').then(({ historial = [] }) => {
  const live = alive(historial);
  if (live.length !== historial.length) chrome.storage.local.set({ historial: live });
  render(live);
});
config().catch((e) => status(e.message, 'error'));
