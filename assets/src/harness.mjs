// Shared by the asset scripts: a local Worker (wrangler dev, simulated R2) and the real extension
// in Chromium. Nothing here touches a deployed server.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

export const ROOT = new URL('../../', import.meta.url).pathname;
export const EXT = path.join(ROOT, 'extension');
export const TOKEN = 'demo-token';

const freePort = () =>
  new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

export async function startServer() {
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-demo-'));
  const proc = spawn(path.join(ROOT, 'node_modules/.bin/wrangler'),
    ['dev', '--config', 'worker/wrangler.toml', '--port', String(port), '--persist-to', persist,
     '--var', `UPLOAD_TOKEN:${TOKEN}`, '--show-interactive-dev-session=false'],
    { cwd: ROOT, stdio: 'ignore', detached: true, env: { ...process.env, CLOUDFLARE_API_TOKEN: '' } });
  // wrangler spawns workerd: kill the whole group, always, even if the script fails.
  const stop = () => { try { process.kill(-proc.pid); } catch {} fs.rmSync(persist, { recursive: true, force: true }); };
  process.on('exit', stop);
  for (let i = 0; i < 200; i++) {
    try { if (/shotdrop server/.test(await (await fetch(url)).text())) return { url, port, stop }; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('local server did not start');
}

// macOS ignores --lang: Chromium follows AppleLanguages. Only the Chrome for Testing bundle is
// touched (never the user's Chrome), and the setting is removed on exit.
export function setMacLanguage(lang) {
  if (process.platform !== 'darwin') return;
  const args = lang ? ['write', 'com.google.chrome.for.testing', 'AppleLanguages', '-array', lang]
                    : ['delete', 'com.google.chrome.for.testing', 'AppleLanguages'];
  try { execFileSync('defaults', args, { stdio: 'ignore' }); } catch {}
}
process.on('exit', () => setMacLanguage(null));
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });

export async function launchExtension({ lang = 'en', recordVideo } = {}) {
  setMacLanguage(lang);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-ui-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM || undefined,
    // Full Chromium (new headless). The default headless shell cannot load extensions.
    channel: process.env.CHROMIUM ? undefined : 'chromium',
    headless: true,
    locale: lang,
    recordVideo,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;

  // First install opens Settings by itself: wait for that tab and close it.
  for (let i = 0; i < 50; i++) {
    const tab = ctx.pages().find((p) => p.url().endsWith('/options.html'));
    if (tab) { await tab.close(); break; }
    await new Promise((r) => setTimeout(r, 100));
  }

  const close = async () => { await ctx.close(); fs.rmSync(profile, { recursive: true, force: true }); };
  return { ctx, id, close };
}

export async function configure(ctx, id, server, { copyMode = 'link' } = {}) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.fill('#endpoint', server.url);
  await page.fill('#token', TOKEN);
  await page.check(`input[name=copyMode][value=${copyMode}]`);
  await page.click('button[type=submit]');
  await page.waitForFunction(() => /ok|error/.test(document.getElementById('result').className));
  return page;
}

// Sample screenshots drawn with the brand palette: a failing test, a chart, a diff.
const SAMPLES = [
  `<div style="background:#0a0a1a;color:#dbdbe5;font:15px/1.65 monospace;padding:20px;height:100%">
     <div style="color:#39ff14">$ npm test</div><div>✓ 47 passing</div><div style="color:#ff006e">✗ 1 failing</div>
     <div style="color:#b0b0b0">  TypeError: Cannot read properties of undefined</div><div style="color:#00d4ff">    at render (panel.js:88)</div></div>`,
  `<div style="background:#1a1a2e;padding:20px;height:100%;display:flex;align-items:flex-end;gap:10px">
     ${[40, 65, 50, 85, 70, 95, 60].map((h, i) => `<div style="flex:1;height:${h}%;background:${i === 5 ? '#39ff14' : '#7a00df'}"></div>`).join('')}</div>`,
  `<div style="background:#1a0a2e;font:15px/1.7 monospace;padding:20px;height:100%">
     <div style="color:#b0b0b0">@@ -12,4 +12,6 @@</div><div style="color:#ff006e">- const port = 8799;</div>
     <div style="color:#39ff14">+ const port = await freePort();</div><div style="color:#39ff14">+ await waitFor(isShotdrop);</div></div>`,
];

export async function samples() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const out = [];
  for (const html of SAMPLES) {
    const p = await browser.newPage({ viewport: { width: 480, height: 300 } });
    await p.setContent(`<body style="margin:0;height:300px">${html}</body>`);
    out.push(await p.screenshot());
    await p.close();
  }
  await browser.close();
  return out;
}

export async function dropPng(page, png) {
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'shot.png', { type: 'image/png' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, png.toString('base64'));
}
