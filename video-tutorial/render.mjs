#!/usr/bin/env node
/**
 * HTML -> MP4 逐帧渲染器
 *   1) Puppeteer 打开 index.html
 *   2) 对每一帧调用 window.__seek(t)（确定性，不依赖实际播放速度）
 *   3) 截图存 PNG
 *   4) ffmpeg 把 PNG 序列 + 配音 合成为 MP4
 *
 * 用法:
 *   node render.mjs                       # 默认 2x 缩放, 带配音
 *   SCALE=3 node render.mjs               # 3x 输出 1920x1368
 *   AUDIO=audio/voice.m4a node render.mjs # 指定音轨
 *   NO_AUDIO=1 node render.mjs            # 纯画面
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// puppeteer-core：不下载 Chromium，直接用本机已装的 Chrome
const NODE_MODULES = process.env.NODE_MODULES
  || '/Users/wqlm/.workbuddy/binaries/node/workspace/node_modules';
const puppeteer = require(path.join(NODE_MODULES, 'puppeteer-core'));
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const HERE     = path.dirname(fileURLToPath(import.meta.url));
// 中间产物（帧序列 / Chrome profile）一律丢到 /tmp，让系统自动回收
const TMPROOT  = process.env.TMPROOT || path.join('/tmp', 'loveco-video');
const FRAMES   = path.join(TMPROOT, 'frames');
const OUT_DIR  = path.join(HERE, 'out');
const FFMPEG   = process.env.FFMPEG || 'ffmpeg';
const SCALE    = Number(process.env.SCALE || 2);
const AUDIO    = process.env.AUDIO || path.join(HERE, 'audio', 'voice.m4a');
const NO_AUDIO = process.env.NO_AUDIO === '1';
const OUT      = process.env.OUT || path.join(OUT_DIR, `loveco-tutorial-${SCALE}x.mp4`);
const PROFILE  = process.env.PROFILE || path.join(TMPROOT, 'chrome');

fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(PROFILE, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const launchOpts = {
  executablePath: CHROME,
  headless: true,   // puppeteer >= 22 里 true 就是新版 headless
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--mute-audio',
         '--no-first-run', '--no-default-browser-check', '--disable-component-update',
         '--disable-features=RlzPing', '--no-pings',
         '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
};
if (process.env.NO_PROFILE !== '1') launchOpts.userDataDir = PROFILE;
const browser = await puppeteer.launch(launchOpts);
browser.on('disconnected', () => console.error('[warn] browser disconnected'));
const pages = await browser.pages();
const page = pages[0] || await browser.newPage();   // 用默认页，避免 "Requesting main frame too early"
await new Promise(r => setTimeout(r, 300));

// ?render=1 让页面停在渲染模式：只响应 __seek(t)，不跑实时动画 → 帧号可复现
await page.goto('file://' + path.join(HERE, 'index.html') + '?render=1', { waitUntil: 'load' });
await page.evaluate(() => { window.__renderMode = true; });
await page.evaluate(() => document.fonts.ready);

const meta = await page.evaluate(() => ({
  w: TIMELINE.width, h: TIMELINE.height, fps: TIMELINE.fps, dur: TIMELINE.duration,
}));

await page.setViewport({
  width: meta.w, height: meta.h,
  deviceScaleFactor: SCALE,
});

const total = Math.round(meta.dur * meta.fps);
console.log(`[render] ${meta.w}x${meta.h} @${SCALE}x -> ${meta.w*SCALE}x${meta.h*SCALE}, ${total} frames @ ${meta.fps}fps`);

const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = i / meta.fps;
  await page.evaluate((tt) => window.__seek(tt), t);
  const file = path.join(FRAMES, `f_${String(i).padStart(5, '0')}.png`);
  await page.screenshot({ path: file, type: 'png', captureBeyondViewport: false });
  if (i % 30 === 0) process.stdout.write(`\r  ${i}/${total}`);
}
process.stdout.write(`\r  ${total}/${total}  截图耗时 ${((Date.now()-t0)/1000).toFixed(1)}s\n`);

await browser.close();

/* ---------------- 编码 ---------------- */
const hasAudio = !NO_AUDIO && fs.existsSync(AUDIO);
const args = [
  '-y',
  '-framerate', String(meta.fps),
  '-i', path.join(FRAMES, 'f_%05d.png'),
];
if (hasAudio) args.push('-i', AUDIO);
args.push(
  '-t', String(meta.dur),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
);
if (hasAudio) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
args.push(OUT);

console.log(`[encode] ${hasAudio ? 'with' : 'without'} audio -> ${path.relative(HERE, OUT)}`);
execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'inherit'] });

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`[done] ${OUT} (${kb} KB)`);
console.log(`[hint] 清帧序列: rm -rf ${path.relative(HERE, FRAMES)}`);
