#!/usr/bin/env node
/**
 * HTML -> MP4 逐帧渲染器（纯 CDP 版，不依赖 puppeteer）
 *
 *   为什么不直接用 puppeteer：本机 Chrome 与 puppeteer-core 25.x 协议不匹配，
 *   会出现 "Requesting main frame too early!"；而且沙箱环境下 puppeteer 启动
 *   Chrome 会触发系统目录写入被拦截。这里直接：
 *     1) spawn Chrome --headless=new --remote-debugging-port
 *     2) 走 CDP HTTP/WS（只依赖 node_modules/ws）
 *     3) 每帧 Runtime.evaluate(window.__seek(t)) + Page.captureScreenshot
 *     4) ffmpeg 合成 MP4
 *
 * 用法:
 *   node render-cdp.mjs                       # 2x, 带配音
 *   SCALE=3 node render-cdp.mjs               # 1920x1368
 *   NO_AUDIO=1 node render-cdp.mjs            # 只出画面
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NODE_MODULES = process.env.NODE_MODULES
  || '/Users/wqlm/.workbuddy/binaries/node/workspace/node_modules';
const WebSocket = require(path.join(NODE_MODULES, 'ws'));

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 所有中间产物（帧序列 / Chrome profile）一律丢到 /tmp，让系统自动回收，不污染工程目录
const TMPROOT = process.env.TMPROOT || path.join('/tmp', 'loveco-video');
const FRAMES = path.join(TMPROOT, 'frames');
const OUT_DIR = path.join(HERE, 'out');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const SCALE = Number(process.env.SCALE || 2);
const AUDIO = process.env.AUDIO || path.join(HERE, 'audio', 'voice.m4a');
const NO_AUDIO = process.env.NO_AUDIO === '1';
const OUT = process.env.OUT || path.join(OUT_DIR, `loveco-tutorial-${SCALE}x.mp4`);
const PORT = Number(process.env.PORT || (9100 + Math.floor(Math.random() * 800)));
// 每次跑用独立 profile：避免上一次没退干净的 Chrome 锁住目录，导致 CDP 连上但指令超时
fs.rmSync(FRAMES, { recursive: true, force: true });   // 只清 /tmp 下的帧，重跑不会串帧
fs.mkdirSync(path.join(TMPROOT, 'chrome'), { recursive: true });
const PROFILE = process.env.PROFILE
  || fs.mkdtempSync(path.join(TMPROOT, 'chrome', 'run-'));

const CHROME = process.env.CHROME || [
  process.env.HOME + '/Library/Caches/ms-playwright/chromium-1246/chrome-mac-arm64/' +
    'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));

if (!CHROME) { console.error('找不到 Chrome，设置 CHROME=/path/to/chrome'); process.exit(1); }

fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const getJSON = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej);
});

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--allow-file-access-from-files',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--disable-component-update',
  '--disable-background-networking', '--no-pings',
  // 受限/沙箱环境里 Chrome 的子进程沙箱起不来（sandbox initialization failed），
  // 页面会一直不响应 → CDP 指令超时。渲染静态本地文件，关掉进程沙箱是安全的。
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--window-size=800,600',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

const bye = (code) => { try { chrome.kill('SIGTERM'); } catch {} process.exit(code); };
process.on('SIGINT', () => bye(130));
process.on('uncaughtException', (e) => { console.error(e); bye(1); });

/* ---------- 等 CDP 起来 ---------- */
let version = null;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 250));
  try { version = await getJSON('/json/version'); break; } catch {}
}
if (!version) { console.error('CDP 未就绪，Chrome 可能没起来'); bye(1); }
console.log(`[chrome] ${version.Browser}`);

/* ---------- 开一个标签页 ---------- */
const target = await new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/json/new?about:blank', method: 'PUT' },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); });
  req.on('error', rej); req.end();
});
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let id = 0;
const pending = new Map();
const events = [];
ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method) events.push(msg);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 60000);
});

await send('Page.enable');
await send('Runtime.enable');


/* ---------- 设备像素比 ---------- */
async function setViewport(w, h, scale) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: scale, mobile: false, screenOrientation: { angle: 0, type: 'portraitPrimary' },
  });
}

/* ---------- 打开页面，等 load + fonts ---------- */
const url = 'file://' + path.join(HERE, 'index.html') + '?render=1';
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 1200));
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>1)', awaitPromise: true });

const meta = JSON.parse((await send('Runtime.evaluate', {
  expression: 'JSON.stringify({w:TIMELINE.width,h:TIMELINE.height,fps:TIMELINE.fps,dur:TIMELINE.duration})',
  returnByValue: true,
})).result.value);

await setViewport(meta.w, meta.h, SCALE);
const total = Math.round(meta.dur * meta.fps);
console.log(`[render] ${meta.w}x${meta.h} @${SCALE}x -> ${meta.w * SCALE}x${meta.h * SCALE}, ${total} frames @${meta.fps}fps`);

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = i / meta.fps;
  await send('Runtime.evaluate', { expression: `window.__seek(${t})`, returnByValue: true });
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(FRAMES, `f_${String(i).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'));
  if (i % 30 === 0) process.stdout.write(`\r  ${i}/${total}`);
}
process.stdout.write(`\r  ${total}/${total}  截图耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

ws.close();
try { await getJSON(`/json/close/${target.id}`); } catch {}
chrome.kill('SIGTERM');

/* ---------------- 编码 ---------------- */
const hasAudio = !NO_AUDIO && fs.existsSync(AUDIO);
const args = ['-y', '-framerate', String(meta.fps), '-i', path.join(FRAMES, 'f_%05d.png')];
if (hasAudio) args.push('-i', AUDIO);
args.push('-t', String(meta.dur),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
if (hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
args.push(OUT);

console.log(`[encode] ${hasAudio ? 'with' : 'without'} audio -> ${path.relative(HERE, OUT)}`);
execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });
console.log(`[done] ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
process.exit(0);
