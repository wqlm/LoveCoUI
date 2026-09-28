#!/usr/bin/env node
/**
 * 光标平滑度探针：逐帧跑 window.__seek(t)，把 #cursor 的位移打出来。
 *
 * 用途：光标轨迹“一卡一卡”时，先用数字定位而不是靠眼睛。
 * 判据：单帧位移峰值 < 10 CSS px（30fps）时观感连续；
 *       出现 20px+ 的尖峰 = 关键帧之间距离太长 / 时间太短。
 *
 * 用法:
 *   node probe-cursor.mjs                 # 默认 index.html
 *   node probe-cursor.mjs other.html
 * 依赖: CHROME / NODE_MODULES（同 render-cdp.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NODE_MODULES = process.env.NODE_MODULES
  || '/Users/wqlm/.workbuddy/binaries/node/workspace/node_modules';
const WebSocket = require(path.join(NODE_MODULES, 'ws'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(process.argv[2] || path.join(HERE, 'index.html'));
const TMPROOT = process.env.TMPROOT || path.join('/tmp', 'loveco-video');
const PORT = Number(process.env.PORT || (9100 + Math.floor(Math.random() * 800)));
const CHROME = process.env.CHROME || [
  process.env.HOME + '/Library/Caches/ms-playwright/chromium-1246/chrome-mac-arm64/' +
    'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome，设置 CHROME=/path/to/chrome'); process.exit(1); }

fs.mkdirSync(path.join(TMPROOT, 'chrome'), { recursive: true });
const PROFILE = fs.mkdtempSync(path.join(TMPROOT, 'chrome', 'probe-'));

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--allow-file-access-from-files', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--disable-component-update',
  '--disable-background-networking', '--no-pings', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const bye = (c) => { try { chrome.kill('SIGTERM'); } catch {} process.exit(c); };
process.on('uncaughtException', (e) => { console.error(e); bye(1); });

let version = null;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250));
  try { version = await getJSON('/json/version'); break; } catch {}
}
if (!version) { console.error('CDP 未就绪'); bye(1); }

const target = await new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/json/new?about:blank', method: 'PUT' },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); });
  req.on('error', rej); req.end();
});
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 60000);
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 456, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'file://' + PAGE + '?render=1' });
await new Promise(r => setTimeout(r, 900));
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });

const res = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
  const out = [];
  const total = Math.round(TIMELINE.duration * TIMELINE.fps);
  const taps = [TIMELINE.events.tapToggle1, TIMELINE.events.tapToggle2];
  for (let i = 0; i < total; i++) {
    const t = i / TIMELINE.fps;
    window.__seek(t);
    const m = document.querySelector('#cursor').style.transform
      .match(/translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/);
    const rip = document.querySelector('#ripple');
    const ages = taps.filter(a => t >= a).map(a => t - a);
    out.push({ t: +t.toFixed(3), x: +m[1], y: +m[2],
      rc: rip.style.display === 'none' ? null : [parseFloat(rip.style.left), parseFloat(rip.style.top)],
      age: ages.length ? Math.min(...ages) : Infinity });
  }
  return JSON.stringify(out);
})()` });

const data = JSON.parse(res.result.value);
const HS = JSON.parse((await send('Runtime.evaluate', {
  expression: 'JSON.stringify(TIMELINE.hotspot)', returnByValue: true,
})).result.value);

let maxJump = 0, worst = null;
for (let i = 1; i < data.length; i++) {
  const d = Math.hypot(data[i].x - data[i-1].x, data[i].y - data[i-1].y);
  if (d > maxJump) { maxJump = d; worst = [data[i-1].t, data[i].t]; }
}
// 波纹圆心 vs 指尖：只看敲下去的瞬间（波纹前 0.05s），之后指尖离开是正常的
let maxMiss = 0, missAt = null;
for (const d of data) {
  if (!d.rc || d.age > 0.05) continue;
  const m = Math.hypot(d.x + HS[0] - d.rc[0], d.y + HS[1] - d.rc[1]);
  if (m > maxMiss) { maxMiss = m; missAt = d.t; }
}
console.log(`帧数        : ${data.length}`);
console.log(`单帧位移峰值: ${maxJump.toFixed(2)} px  @ ${worst?.[0]}s -> ${worst?.[1]}s   ${maxJump < 10 ? 'OK' : '偏快，拉长这段的时间或缩短距离'}`);
console.log(`点击命中偏差: ${maxMiss.toFixed(2)} px  @ ${missAt}s   ${maxMiss < 1.5 ? 'OK' : '热点算错了'}`);
ws.close(); bye(0);
