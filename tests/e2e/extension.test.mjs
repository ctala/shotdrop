// End to end: the real extension in Chromium against a local Worker (wrangler dev, simulated R2).
// Nothing here touches a deployed server.
//
//   npm run test:e2e             CHROMIUM=/path/to/chrome to use a specific binary
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const ROOT = new URL('../../', import.meta.url).pathname;
const EXT = path.join(ROOT, 'extension');
// A free port picked at random: a fixed one can belong to another local service.
const PORT = await new Promise((resolve) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const SERVER = `http://localhost:${PORT}`;
const TOKEN = 'e2e-token';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcP8PAAIBAYA7GXUAAAAASUVORK5CYII=';

let server, ctx, id, profile, persist, MESSAGES, openedSettingsOnInstall;

// Assertions compare against the locale the extension actually runs in (Chromium on macOS follows
// the system language whatever it is told), so the same suite checks English and Spanish.
const text = (key, vars = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), MESSAGES[key].message);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const M = (key, vars) => new RegExp(esc(text(key, vars)));

async function waitFor(fn, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('timeout');
}

before(async () => {
  persist = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-r2-'));
  server = spawn(
    path.join(ROOT, 'node_modules/.bin/wrangler'),
    ['dev', '--config', 'worker/wrangler.toml', '--port', String(PORT), '--persist-to', persist,
     '--var', `UPLOAD_TOKEN:${TOKEN}`, '--show-interactive-dev-session=false'],
    { cwd: ROOT, stdio: 'ignore', detached: true, env: { ...process.env, CLOUDFLARE_API_TOKEN: '' } }
  );
  // Check it is really shotdrop answering, not just "something on that port".
  await waitFor(async () => /shotdrop server/.test(await (await fetch(SERVER)).text()), 60000);

  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-profile-'));
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM || undefined,
    // Full Chromium (new headless). The default headless shell cannot load extensions.
    channel: process.env.CHROMIUM ? undefined : 'chromium',
    headless: true,
    locale: 'en-US', // assertions below read the English UI
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  id = new URL(sw.url()).host;

  // On first install (no token yet) the extension opens Settings by itself. Wait for that tab.
  const isOptions = (p) => p.url().endsWith('/options.html');
  let firstTab;
  for (let i = 0; i < 50 && !firstTab; i++) {
    firstTab = ctx.pages().find(isOptions);
    if (!firstTab) await new Promise((r) => setTimeout(r, 100));
  }
  openedSettingsOnInstall = Boolean(firstTab);
  await firstTab?.close();

  const ui = await sw.evaluate(() => chrome.i18n.getMessage('@@ui_locale'));
  const lang = ui.startsWith('es') ? 'es' : 'en';
  MESSAGES = JSON.parse(fs.readFileSync(path.join(EXT, `_locales/${lang}/messages.json`), 'utf8'));
  console.log(`# extension UI locale: ${ui} -> asserting against ${lang}`);
});

after(async () => {
  await ctx?.close();
  // Negative pid = the whole group (wrangler + workerd).
  if (server) try { process.kill(-server.pid); } catch {}
  for (const d of [profile, persist]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

async function configure({ endpoint = `localhost:${PORT}`, token = TOKEN, copyMode = 'link' } = {}) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.fill('#endpoint', endpoint);
  await page.fill('#token', token);
  await page.check(`input[name=copyMode][value=${copyMode}]`);
  await page.click('button[type=submit]');
  await page.waitForFunction(() => /ok|error/.test(document.getElementById('result').className), null, { timeout: 15000 });
  const out = { text: await page.textContent('#result'), endpoint: await page.inputValue('#endpoint') };
  await page.close();
  return out;
}

// Opens the panel and records what it copies to the clipboard.
async function openPanel() {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.evaluate(() => {
    window.__copied = [];
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (s) => { window.__copied.push(s); return original(s).catch(() => {}); };
  });
  return page;
}

async function dropFile(page, { name = 'shot.png', type = 'image/png', b64 = PNG_B64 } = {}) {
  await page.evaluate(({ name, type, b64 }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type, b64 });
}

const waitStatus = (page, re) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout: 15000 });

const links = (page) => page.$$eval('#list a', (as) => as.map((a) => a.href));

describe('settings', () => {
  test('opens by itself on first install, when there is no token', () => {
    assert.ok(openedSettingsOnInstall);
  });

  test('connects when the address comes without a scheme', async () => {
    const r = await configure();
    assert.match(r.text, M('connOk'));
    assert.equal(r.endpoint, SERVER);
  });

  test('says when the token is wrong', async () => {
    const r = await configure({ token: 'wrong' });
    assert.match(r.text, M('connBadToken'));
  });

  test('says when the server cannot be reached', async () => {
    const r = await configure({ endpoint: 'localhost:1' });
    assert.match(r.text, M('connFail', { endpoint: 'http://localhost:1' }));
  });
});

describe('panel', () => {
  test('dropping an image uploads it, copies the link and lists it', async () => {
    await configure();
    const page = await openPanel();
    await dropFile(page);
    await waitStatus(page, M('copied'));

    const [url] = await links(page);
    assert.match(url, new RegExp(`^${SERVER}/[0-9a-f]{16}\\.png$`));
    assert.deepEqual(await page.evaluate(() => window.__copied), [url]);

    const r = await fetch(url);
    assert.equal(r.status, 200);
    assert.equal(Buffer.from(await r.arrayBuffer()).toString('base64'), PNG_B64);
    await page.close();
  });

  test('in agent mode it copies a ready-to-paste instruction', async () => {
    await configure({ copyMode: 'agent' });
    const page = await openPanel();
    await dropFile(page);
    await waitStatus(page, M('copiedAgent'));
    const [url] = await links(page);
    const [copied] = await page.evaluate(() => window.__copied);
    assert.ok(copied.includes(`curl -so /tmp/${new URL(url).pathname.slice(1)} ${url}`), copied);
    await configure();
    await page.close();
  });

  test('the Agent button copies the instruction for an existing link', async () => {
    const page = await openPanel();
    const [url] = await links(page);
    await page.click('#list li:first-child button[data-action=agent]');
    const copied = await page.evaluate(() => window.__copied.at(-1));
    assert.equal(copied, text('agentPrompt', { url, file: new URL(url).pathname.slice(1) }));
    await page.close();
  });

  test('pasting works like dropping', async () => {
    const page = await openPanel();
    const before = (await links(page)).length;
    await page.evaluate((b64) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'p.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, PNG_B64);
    await waitStatus(page, M('copied'));
    assert.equal((await links(page)).length, before + 1);
    await page.close();
  });

  test('rejects a file that is not an image', async () => {
    const page = await openPanel();
    await dropFile(page, { name: 'notes.txt', type: 'text/plain', b64: btoa('hello') });
    await waitStatus(page, M('notImage', { name: 'notes.txt' }));
    await page.close();
  });

  test('delete needs two clicks and then the link is gone', async () => {
    const page = await openPanel();
    const [url] = await links(page);
    const del = '#list li:first-child button[data-action=delete]';

    await page.click(del);
    assert.equal(await page.textContent(del), text('confirmDelete'));
    assert.equal((await fetch(url)).status, 200, 'the first click must not delete');

    await page.click(del);
    await waitStatus(page, M('deleted'));
    assert.equal((await fetch(url)).status, 404);
    assert.ok(!(await links(page)).includes(url));
    await page.close();
  });

  test('the delete confirmation disarms itself after 3 seconds', async () => {
    const page = await openPanel();
    const del = '#list li:first-child button[data-action=delete]';
    await page.click(del);
    await page.waitForTimeout(3300);
    assert.equal(await page.textContent(del), text('delete'));
    await page.close();
  });

  test('expired links are not shown and are pruned from storage', async () => {
    const page = await openPanel();
    await page.evaluate(() => chrome.storage.local.set({
      historial: [{ url: 'https://x.example/aaaaaaaaaaaaaaaa.png', expiresAt: Date.now() - 1 }],
    }));
    await page.reload();
    await page.waitForTimeout(300);
    assert.deepEqual(await links(page), []);
    const stored = await page.evaluate(() => chrome.storage.local.get('historial').then((r) => r.historial));
    assert.equal(stored.length, 0);
    await page.close();
  });

  test('server errors are translated, not shown raw', async () => {
    await configure();
    const page = await openPanel();
    await page.evaluate(() => chrome.storage.local.set({ token: 'revoked' }));
    await dropFile(page);
    await waitStatus(page, M('errUnauthorized'));
    await configure();
    await page.close();
  });
});
