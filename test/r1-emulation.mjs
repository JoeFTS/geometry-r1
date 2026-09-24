// r1-emulation.mjs — drives the real page in Chromium set up like the R1:
// 240x282 touch viewport, Android UA, creationStorage stub that enforces Base64,
// hardware events (sideClick / longPress / scrollUp / scrollDown), 4x CPU throttle.
// Usage: node test/r1-emulation.mjs [baseUrl]   (serve src/ first)
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv.slice(2).find((a) => a.startsWith('http')) || 'http://localhost:8765/index.html';
const OUT = new URL('../docs/screens/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const results = []; let failed = 0;
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STORAGE_STUB = () => {
  const store = {}; window.__store = store; window.__storeWrites = 0;
  const isB64 = (v) => typeof v === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(v) && v.length % 4 === 0;
  window.creationStorage = { plain: {
    async getItem(k) { return k in store ? store[k] : null; },
    async setItem(k, v) { if (!isB64(v)) throw new Error('creationStorage: value must be Base64'); store[k] = v; window.__storeWrites++; },
    async removeItem(k) { delete store[k]; }, async clear() { for (const k in store) delete store[k]; },
  } };
};
const fire = (page, name) => page.evaluate((n) => window.dispatchEvent(new CustomEvent(n)), name);

const browser = await chromium.launch();
async function newPage(query = '') {
  const ctx = await browser.newContext({
    viewport: { width: 240, height: 282 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; r1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript(STORAGE_STUB);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.__game);
  await sleep(600);
  return { page, errors, ctx };
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });
const G = (page, expr) => page.evaluate(`(() => { const g = window.__game; return ${expr}; })()`);

const ONLY_SONGS = process.argv.includes('--songs');
if (!ONLY_SONGS) {
// ---------- 1. flow: splash -> menu -> run -> death -> menu, with R1 hardware events ----------
{
  const { page, errors } = await newPage();
  await shot(page, '01-splash');
  ok('boots to splash', await G(page, 'g.state') === 'SPLASH');
  await page.touchscreen.tap(120, 200);
  await sleep(400);
  ok('tap unlocks audio -> menu', await G(page, 'g.state') === 'MENU');
  ok('AudioContext running after tap', await G(page, 'g.music.ctx && g.music.ctx.state') === 'running');
  ok('menu music playing', await G(page, 'g.music.playing && g.music.songKey') === 'menu');
  // measure real output level through an analyser tapped off the master bus
  const rms = await page.evaluate(async () => {
    const m = window.__game.music, an = m.ctx.createAnalyser(); an.fftSize = 2048; m.master.connect(an);
    const buf = new Float32Array(2048); let peak = 0;
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 50)); an.getFloatTimeDomainData(buf);
      let s = 0; for (const v of buf) s += v * v; peak = Math.max(peak, Math.sqrt(s / buf.length)); }
    return peak;
  });
  ok('menu music is audible (RMS)', rms > 0.02, rms.toFixed(3));
  await sleep(700);
  await shot(page, '02-menu');
  await fire(page, 'scrollDown'); await sleep(100);
  ok('wheel down -> HARD', await G(page, 'g.data.diff') === 1);
  await fire(page, 'scrollDown'); await sleep(100);
  ok('wheel down -> EXPERT', await G(page, 'g.data.diff') === 2);
  await sleep(500);
  await shot(page, '03-menu-expert');
  await fire(page, 'scrollUp'); await fire(page, 'scrollUp'); await sleep(100);
  ok('wheel up x2 -> NORMAL', await G(page, 'g.data.diff') === 0);

  await fire(page, 'sideClick'); await sleep(300);
  ok('side button starts a run', await G(page, 'g.state') === 'PLAY');
  ok('stage song playing', await G(page, 'g.music.songKey') === 'normal');
  await page.waitForFunction(() => window.__game.P.grounded);
  await fire(page, 'sideClick'); await sleep(40);
  ok('side button jumps', await G(page, '!g.P.grounded || g.P.vy < 0'));
  await sleep(700);
  // touch hold = bounce repeatedly
  const box = { x: 120, y: 160 };
  await page.touchscreen.tap(box.x, box.y); await sleep(30);
  ok('screen tap jumps', await G(page, '!g.P.grounded'));
  await fire(page, 'scrollUp'); await sleep(80);
  ok('wheel in-run changes volume', Math.abs(await G(page, 'g.data.volume') - 0.8) < 1e-6);
  await shot(page, '04-run-volume');
  // no input: the first obstacle kills us
  await page.waitForFunction(() => window.__game.state === 'DEAD', null, { timeout: 20000 });
  ok('death on no input', true, await G(page, 'g.P.dead.what + " at " + Math.floor(g.P.x/16) + "m"'));
  ok('music stops on death', await G(page, '!g.music.playing'));
  await sleep(900);
  await shot(page, '05-death');
  const saved = await page.evaluate(() => JSON.parse(decodeURIComponent(escape(atob(window.__store.geometryRabbit)))));
  ok('creationStorage holds Base64 JSON save', saved && saved.attempts[0] === 1, JSON.stringify(saved));
  await page.touchscreen.tap(172, 190); await sleep(300);
  ok('MENU button on death card', await G(page, 'g.state') === 'MENU');
  await fire(page, 'sideClick'); await sleep(200);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // simulate hidden: override document.hidden
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  ok('leaving the Creation pauses', await G(page, 'g.state') === 'PAUSE');
  ok('audio suspended while away', await G(page, 'g.music.ctx.state') === 'suspended');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await shot(page, '06-paused');
  await page.touchscreen.tap(120, 150); await sleep(300);
  ok('tap resumes', await G(page, 'g.state') === 'PLAY' && await G(page, 'g.music.ctx.state') === 'running');
  // side button held (longPressStart..End) keeps bouncing
  await page.evaluate(() => window.__game.toMenu()); await sleep(200);
  await fire(page, 'sideClick'); await sleep(300);
  await page.waitForFunction(() => window.__game.P && window.__game.P.grounded);
  const jumps = await page.evaluate(async () => {
    const g = window.__game; let n = 0, prevVy = 0;   // count takeoffs: landing + re-jump happen in one substep
    window.dispatchEvent(new CustomEvent('longPressStart'));
    const t0 = performance.now();
    while (performance.now() - t0 < 1200 && g.state === 'PLAY') { await new Promise((r) => setTimeout(r, 10)); if (g.P.vy < 0 && prevVy >= 0) n++; prevVy = g.P.vy; }
    window.dispatchEvent(new CustomEvent('longPressEnd'));
    return n;
  });
  ok('holding the side button keeps bouncing', jumps >= 2, `${jumps} jumps in 1.2 s`);
  // BUTTON TEST screen measures side-button lag against a touch
  await page.evaluate(() => window.__game.toMenu()); await sleep(200);
  for (let i = 0; i < 3; i++) await fire(page, 'scrollDown');
  await fire(page, 'sideClick'); await sleep(200);
  ok('BUTTON TEST opens from the menu', await G(page, 'g.state') === 'PROBE');
  for (let i = 0; i < 3; i++) { await page.touchscreen.tap(120, 150); await sleep(90); await fire(page, 'sideClick'); await sleep(250); }
  await shot(page, '07-button-test');
  const lag = await page.evaluate(() => window.__probe && window.__probe.lags);
  ok('BUTTON TEST reports side lag', Array.isArray(lag) && lag.length === 3 && lag.every((v) => v > 50 && v < 300), JSON.stringify(lag && lag.map(Math.round)));
  await fire(page, 'scrollUp'); await sleep(150);
  ok('wheel leaves BUTTON TEST', await G(page, 'g.state') === 'MENU');
  ok('no page errors (flow)', errors.length === 0, errors.join(' | '));
}

// ---------- 2. bot runs on each difficulty under 4x CPU throttle ----------
for (const diff of [0, 1, 2]) {
  const { page, errors } = await newPage('?bot=1');
  await page.touchscreen.tap(120, 200); await sleep(300);
  for (let i = 0; i < diff; i++) await fire(page, 'scrollDown');
  await fire(page, 'sideClick'); await sleep(200);
  await G(page, 'g.resetPerf()');
  const names = ['normal', 'hard', 'expert'];
  const RUN = 24;
  for (let t = 0; t < RUN; t += 4) {
    await sleep(4000);
    if (t === 8 || t === 16) await shot(page, `1${diff}-${names[diff]}-${t}s`);
  }
  const st = await G(page, '({ state: g.state, t: g.P.time, m: Math.floor(g.P.x/16), speed: g.P.speed, ship: g.P.ship, inv: g.P.inv, dead: g.P.dead, perf: { avg: g.perf.sum / g.perf.frames * 1000, max: g.perf.max * 1000, upd: g.perf.updMax }, bpm: g.music.bpm })');
  ok(`bot survives ${RUN}s on ${names[diff]}`, st.state === 'PLAY', `${st.m}m t=${st.t.toFixed(1)} ${st.dead ? JSON.stringify(st.dead) : ''}`);
  ok(`frame time ok on ${names[diff]} @4x throttle`, st.perf.avg < 20, `avg ${st.perf.avg.toFixed(1)} ms, worst ${st.perf.max.toFixed(0)} ms, update+render worst ${st.perf.upd.toFixed(1)} ms (bot search included), music ${st.bpm.toFixed(0)} BPM`);
  ok(`no page errors (${names[diff]})`, errors.length === 0, errors.join(' | '));
}

} // !ONLY_SONGS

// ---------- 3. offline-render each song to WAV ----------
{
  const { page } = await newPage();
  for (const key of ['menu', 'normal', 'hard', 'expert']) {
    const secs = 42;
    const wav = await page.evaluate(async ({ key, secs }) => {
      const { Music } = await import('./music.mjs');
      const sr = 32000, off = new OfflineAudioContext(1, sr * secs, sr);
      const m = new Music(); m.build(off); m.setVolume(0.8); m.prerender(key, secs - 0.5);
      const buf = await off.startRendering(), d = buf.getChannelData(0);
      let peak = 0, sum = 0; for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      // 16-bit PCM WAV
      const n = d.length, ab = new ArrayBuffer(44 + n * 2), dv = new DataView(ab);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
      let bin = ''; const u8 = new Uint8Array(ab);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { b64: btoa(bin), peak, rms: Math.sqrt(sum / n) };
    }, { key, secs });
    fs.mkdirSync(new URL('../docs/audio/', import.meta.url).pathname, { recursive: true });
    fs.writeFileSync(new URL(`../docs/audio/${key}.wav`, import.meta.url).pathname, Buffer.from(wav.b64, 'base64'));
    ok(`song ${key}: renders, audible, no clipping`, wav.rms > 0.03 && wav.peak < 0.999, `rms ${wav.rms.toFixed(3)} peak ${wav.peak.toFixed(3)}`);
  }
}

await browser.close();
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
