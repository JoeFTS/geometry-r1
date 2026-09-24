// bench.mjs — per-frame main-thread cost (update + render) at 6x CPU throttle, the closest
// stand-in we have for the R1's Helio P35. Plays Hard with a human-like input pattern
// (no bot search, so only game cost is measured). Usage: node test/bench.mjs [url]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:8765/index.html';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 240, height: 282 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await page.goto(BASE + '?bot=1'); await page.waitForFunction(() => window.__game); await page.waitForTimeout(500);
await page.touchscreen.tap(120, 250); await page.waitForTimeout(300);
await page.evaluate(() => { window.dispatchEvent(new CustomEvent('scrollDown')); });
const res = [];
for (let run = 0; run < 3; run++) {
  await page.evaluate(() => { window.__game.startRun(); window.__game.resetPerf(); });   // hold = bounce: jumps + scrolling
  await page.waitForTimeout(5000);
  res.push(await page.evaluate(() => { const p = window.__game.perf; return { work: p.render / p.frames, workMax: p.renderMax, fps: p.frames / p.sum, state: window.__game.state }; }));
}
await b.close();
const avg = (k) => res.reduce((a, r) => a + r[k], 0) / res.length;
console.log(res.map((r) => r.state).join(' '));
console.log(`render/frame avg ${avg('work').toFixed(2)} ms  worst ${Math.max(...res.map((r) => r.workMax)).toFixed(1)} ms  fps ${avg('fps').toFixed(1)}  (6x throttle, dpr 2)`);
