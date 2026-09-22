// Records the README demo GIF. The panel is the real extension uploading to a local Worker; only
// the desktop, the cursor and the terminal around it are staged.   node assets/src/demo-gif.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, startServer, launchExtension, configure, samples } from './harness.mjs';

const W = 1000;
const H = 560;
const COPY = {
  en: { file: 'Screenshot 17.42.png', title: 'claude — ~/project', answer: 'I see it: one test fails at render (panel.js:88). Fixing it.' },
  es: { file: 'Captura 17.42.png', title: 'claude — ~/proyecto', answer: 'La veo: falla un test en render (panel.js:88). Lo arreglo.' },
};

const server = await startServer();
const [png] = await samples();
const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotdrop-video-'));

for (const lang of ['en', 'es']) {
  const { ctx, id, close } = await launchExtension({ lang, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
  (await configure(ctx, id, server)).close();

  const page = await ctx.newPage();
  const born = Date.now();
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.evaluate(() => document.fonts.ready);

  const startedAt = await page.evaluate(async ({ b64, copy }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const el = (tag, css, html = '') => { const e = document.createElement(tag); e.style.cssText = css; e.innerHTML = html; return e; };

    // The real panel keeps the right 380 px; the staged desktop takes the rest.
    document.body.style.cssText += ';margin-left:620px;width:380px;min-height:100vh;border-left:1px solid rgba(176,176,176,.22)';
    const stage = el('div', 'position:fixed;left:0;top:0;width:620px;height:100%;background:radial-gradient(circle at 0 0,rgba(122,0,223,.28),transparent 60%),#0a0a1a;overflow:hidden');
    document.body.append(stage);

    const src = `data:image/png;base64,${b64}`;
    const thumb = el('div', 'position:absolute;left:56px;top:46px;width:250px;text-align:center',
      `<img src="${src}" style="width:250px;border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,.55);border:1px solid rgba(176,176,176,.25)">
       <div style="margin-top:8px;font:600 12px Inter,sans-serif;color:#dbdbe5">${copy.file}</div>`);
    stage.append(thumb);

    const term = el('div', 'position:absolute;left:28px;right:28px;bottom:26px;height:250px;background:#1a1a2e;border:2px solid #00d4ff;border-radius:12px;box-shadow:8px 8px 0 0 rgba(0,212,255,.3);opacity:0;transform:translateY(20px);transition:all .35s;overflow:hidden',
      `<div style="display:flex;gap:7px;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(176,176,176,.2)">
         <i style="width:10px;height:10px;border-radius:50%;background:rgba(176,176,176,.35)"></i><i style="width:10px;height:10px;border-radius:50%;background:rgba(176,176,176,.35)"></i><i style="width:10px;height:10px;border-radius:50%;background:rgba(176,176,176,.35)"></i>
         <span style="margin-left:10px;font:700 11px 'JetBrains Mono',monospace;color:#b0b0b0">${copy.title}</span></div>
       <div id="tt" style="padding:14px 16px;font:700 12.5px/1.65 'JetBrains Mono',monospace;color:#dbdbe5;white-space:pre-wrap;word-break:break-all"></div>`);
    stage.append(term);

    const cursor = el('div', 'position:fixed;left:420px;top:420px;z-index:99;width:22px;height:22px;pointer-events:none;transition:left .9s cubic-bezier(.5,0,.2,1),top .9s cubic-bezier(.5,0,.2,1)',
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.7L21 10.6z" fill="#fff" stroke="#0a0a1a" stroke-width="1.4" stroke-linejoin="round"/></svg>');
    document.body.append(cursor);
    const moveTo = async (x, y, ms = 900) => { cursor.style.transitionDuration = `${ms}ms`; cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; await sleep(ms + 60); };

    const copied = [];
    navigator.clipboard.writeText = async (s) => { copied.push(s); };

    const t0 = Date.now();
    await sleep(600);

    // 1. grab the screenshot
    await moveTo(180, 120);
    await sleep(200);
    const ghost = el('img', 'position:fixed;z-index:98;width:150px;border-radius:5px;opacity:.85;box-shadow:0 10px 24px rgba(0,0,0,.6);pointer-events:none;transition:left .9s cubic-bezier(.5,0,.2,1),top .9s cubic-bezier(.5,0,.2,1);left:110px;top:80px');
    ghost.src = src;
    document.body.append(ghost);
    await sleep(120);

    // 2. drag it over the drop zone
    const drop = document.getElementById('drop').getBoundingClientRect();
    const tx = drop.left + drop.width / 2;
    const ty = drop.top + drop.height / 2;
    ghost.style.left = `${tx - 70}px`;
    ghost.style.top = `${ty - 40}px`;
    setTimeout(() => document.getElementById('drop').classList.add('active'), 700);
    await moveTo(tx, ty);
    await sleep(350);

    // 3. release: the real extension uploads it
    ghost.remove();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], copy.file, { type: 'image/png' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    while (!document.getElementById('status').className.includes('ok')) await sleep(50);
    await sleep(1100);

    // 4. "Agent" copies a ready-to-paste instruction
    const agent = document.querySelector('#list li:first-child button[data-action=agent]').getBoundingClientRect();
    await moveTo(agent.left + agent.width / 2, agent.top + agent.height / 2, 800);
    await sleep(150);
    document.querySelector('#list li:first-child button[data-action=agent]').click();
    await sleep(900);

    // 5. paste it in a terminal on "another machine"
    await moveTo(300, 470, 700);
    term.style.opacity = '1';
    term.style.transform = 'none';
    await sleep(400);
    const tt = document.getElementById('tt');
    // The real instruction points at the local test server; show a public-looking address instead.
    const prompt = copied.at(-1).replace(/http:\/\/localhost:\d+/g, 'https://shots.example.com');
    tt.innerHTML = '<span style="color:#39ff14">› </span>';
    const typed = document.createElement('span');
    tt.append(typed);
    for (let i = 0; i < prompt.length; i += 3) { typed.textContent = prompt.slice(0, i + 3); await sleep(16); }
    await sleep(500);
    const file = prompt.match(/\/tmp\/(\S+?\.png)/)[1];
    const line = (html) => { const d = document.createElement('div'); d.innerHTML = html; tt.append(d); };
    line('<br>');
    line(`<span style="color:#00d4ff">●</span> Bash<span style="color:#b0b0b0">(curl -so /tmp/${file} …)</span>`);
    await sleep(500);
    line(`<span style="color:#00d4ff">●</span> Read<span style="color:#b0b0b0">(/tmp/${file})</span>`);
    await sleep(600);
    line(`<span style="color:#39ff14">${copy.answer}</span>`);
    await sleep(2400);
    return t0;
  }, { b64: png.toString('base64'), copy: COPY[lang] });

  const video = page.video();
  await page.close();
  const webm = await video.path();
  await close();

  const offset = Math.max(0, (startedAt - born) / 1000);
  const gif = path.join(ROOT, `assets/demo-${lang}.gif`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', offset.toFixed(2), '-i', webm,
    '-vf', `fps=14,scale=${W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    gif]);
  console.log(`→ assets/demo-${lang}.gif  ${(fs.statSync(gif).size / 1024).toFixed(0)} KB`);
}

fs.rmSync(videoDir, { recursive: true, force: true });
process.exit(0);
