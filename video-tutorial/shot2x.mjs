// 用 CDP 以 deviceScaleFactor=2 截图（等于最终 1280x912 成片里的观感），可只截一块区域
// 用法: node shot2x.mjs <file-url> <out.png> [clipX clipY clipW clipH] [scale]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NODE_MODULES = process.env.NODE_MODULES;
const WebSocket = require(NODE_MODULES ? NODE_MODULES + '/ws' : 'ws');

const [url, out, cx, cy, cw, ch, sc] = process.argv.slice(2);
const SCALE = +(sc || 2);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9200 + Math.floor(Math.random() * 500);
// 中间产物一律放 /tmp（系统自动回收），可用 TMPROOT 改位置
const TMPROOT = process.env.TMPROOT || '/tmp/loveco-video';
fs.mkdirSync(path.join(TMPROOT, 'chrome2x'), { recursive: true });
const PROFILE = fs.mkdtempSync(path.join(TMPROOT, 'chrome2x', 'run-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--no-default-browser-check', '--disable-component-update', '--disable-background-networking',
  '--no-pings', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
], { stdio: 'ignore' });

const get = (u) => new Promise((res, rej) =>
  http.get(u, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej));
// /json/new 只接受 PUT
const put = (u) => new Promise((res, rej) => {
  const req = http.request(u, { method: 'PUT' }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
  });
  req.on('error', rej); req.end();
});

let msgId = 0;
const pending = new Map();
let ws;
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
});

try {
  let version;
  for (let i = 0; i < 100; i++) {
    try { version = JSON.parse(await get(`http://127.0.0.1:${PORT}/json/version`)); break; }
    catch { await new Promise(r => setTimeout(r, 150)); }
  }
  const target = JSON.parse(await put(`http://127.0.0.1:${PORT}/json/new?about:blank`));
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  const sess = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  const sid = sess.sessionId;
  const sendS = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId: sid }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 60000);
  });
  await sendS('Page.enable');
  await sendS('Emulation.setDeviceMetricsOverride', { width: 640, height: 456, deviceScaleFactor: SCALE, mobile: false });
  await sendS('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 1200));
  await sendS('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });
  const params = { format: 'png' };
  if (cw) params.clip = { x: +cx, y: +cy, width: +cw, height: +ch, scale: SCALE };
  const shot = await sendS('Page.captureScreenshot', params);
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`-> ${out}${cw ? `  (clip ${cx},${cy} ${cw}x${ch} @${SCALE}x)` : `  (640x456 @${SCALE}x)`}`);
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
}
