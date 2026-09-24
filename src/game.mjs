// game.mjs — Geometry Rabbit: screens, input, rendering. Physics lives in engine.mjs,
// music in music.mjs. Portrait 240x282: music visualizer strip on top, sky, the
// 6-row play band, and the HUD on the floor band below the ground line.
import { World, newPlayer, clonePlayer, step, T, TILE, ROWS, GY, TOP, DT, SPEED0, SHIP_VMAX, JUMP_BUFFER, DIFF } from './engine.mjs';
import { Music, SONG_TITLES } from './music.mjs';
import { SONG_FOR_DIFF } from './songs.mjs';
import { load, save } from './storage.mjs';
import { createBot } from './bot.mjs';

const W = 240, H = 282;
const Y0 = 112;                 // screen y of the local TOP (ceiling line)
const FLOOR = Y0 + GY;          // screen y of the ground line (208)
const PX = 56;                  // player's fixed screen x
const CEIL_H = 14;              // ceiling slab (Hard / Expert) drawn above the play band
const MENU_Y = 80, MENU_STEP = 25, MENU_ROWS = 4;   // level list + BUTTON TEST
const FONT = '"Press Start 2P", monospace';
const PARAMS = new URLSearchParams(location.search);
const BOT = PARAMS.has('bot');

const COL = {
  bgTop: ['#070722', '#12082a', '#1c0a26', '#240a14'],     // deep space, warms with tier
  bgBot: ['#16165a', '#2a1060', '#3c1250', '#48122a'],
  ground: '#1e1464', groundHi: '#6e5ad2', pit: '#05031a',
  block: '#181446', edge: '#ffffff', spikeFill: '#181446',
  cube: '#ff4f00', ship: '#14bee6', flame: '#ffd23c',
  accent: '#ff4f00',            // R1 orange
  dim: '#8c82c8', text: '#ffffff', gold: '#ffd23c', red: '#ff3b3b',
  flip: '#3c8cff', unflip: '#ffdc3c',
};

// ---------- canvas ----------
const canvas = document.getElementById('c');
const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
canvas.width = W * dpr; canvas.height = H * dpr;
const g = canvas.getContext('2d', { alpha: false });
g.setTransform(dpr, 0, 0, dpr, 0, 0);
// older Android WebViews lack roundRect: square corners are fine
if (!g.roundRect) g.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };

// ---------- the rabbit: a 16x16 pixel sprite filling the hitbox square ----------
const RABBIT = [
  'BBBBBBBBBBBBBBBB',
  'BOOFFOOOOOOFFOOB',
  'BOFPPFOOOOFPPFOB',
  'BOFPPFOOOOFPPFOB',
  'BOFPPFOOOOFPPFOB',
  'BOFFFFOOOOFFFFOB',
  'BOFFFFFFFFFFFFOB',
  'BFFFFFFFFFFFFFFB',
  'BFFEEFFFFFFEEFFB',
  'BFFEWFFFFFFEWFFB',
  'BFFFFFFNNFFFFFFB',
  'BFPPFFMFFMFFPPFB',
  'BFFFFFFMMFFFFFFB',
  'BSFFFFFFFFFFFFSB',
  'BSSFFFFFFFFFFSSB',
  'BBBBBBBBBBBBBBBB',
];
const RABBIT_PAL = { B: '#7a2200', O: '#ff4f00', F: '#fff6ee', S: '#f0d2c0', P: '#ff9ac1',
                     E: '#14102e', W: '#ffffff', N: '#e0306a', M: '#14102e' };
const rabbitSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  RABBIT.forEach((row, y) => [...row].forEach((ch, i) => { x.fillStyle = RABBIT_PAL[ch]; x.fillRect(i, y, 1, 1); }));
  return c;
})();

// ---------- state ----------
const music = new Music();
let data = { best: [0, 0, 0], attempts: [0, 0, 0], diff: 0, volume: 0.5, sideLag: 120 };
let state = 'SPLASH';            // SPLASH -> MENU -> PLAY <-> PAUSE, PLAY -> DEAD
let world = null, P = null, bot = null;
let acc = 0, renderX = 0, renderY = 0;
let touchHeld = false, sideHeld = false, keyHeld = false;
let deathTimer = 0, newBest = false, attempt = 0;
let shake = 0, flash = 0, flashColor = '#fff';
let volShow = 0;
const parts = [];
let menuT = 0;
let menuSel = 0;                 // 0-2 = level, 3 = BUTTON TEST
let visAngle = 0;
let visOffsetY = 0;              // eases away the visual pop when a side-button jump is rewound
const hist = [];                 // last ~330 ms of substeps: { s: state before the step, held, jumped }
const HIST_MAX = 40;                // drawn rotation: follows the flip, settles upright on landing

const held = () => touchHeld || sideHeld || keyHeld;

// ---------- stars ----------
const stars = [];
{ let r = 0xBEEF1234; for (let i = 0; i < 34; i++) { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0;
  stars.push({ x: r % W, y: 34 + ((r >>> 8) % 60), layer: i % 4 === 0 ? 2 : i % 2, seed: (r >>> 20) & 255 }); } }

// ---------- flow ----------
function startRun() {
  world = new World(data.diff, (Date.now() ^ 0xA5A5F00D) >>> 0);
  P = newPlayer(); acc = 0; parts.length = 0; visAngle = 0; visOffsetY = 0; hist.length = 0;
  attempt = ++data.attempts[data.diff]; save(data);
  bot = BOT ? createBot() : null;
  state = 'PLAY';
  music.setSpeedFactor(1);
  music.play(SONG_FOR_DIFF[data.diff]);
}
function toMenu() {
  state = 'MENU'; touchHeld = sideHeld = keyHeld = false; menuSel = data.diff;
  music.setSpeedFactor(1); music.play('menu');
}
function die() {
  state = 'DEAD'; deathTimer = 0; shake = 12;
  newBest = P.time > data.best[data.diff];
  if (newBest) data.best[data.diff] = P.time;
  save(data);
  music.stop(0.4); music.sfx('death');
  if (newBest && P.time > 3) setTimeout(() => state === 'DEAD' && music.sfx('best'), 650);
  const [sx, sy] = playerScreen();
  for (let i = 0; i < 18; i++) parts.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 260 + 40, life: 0.9 });
  try { navigator.vibrate && navigator.vibrate(60); } catch { /* no motor */ }
}
function changeDiff(d) {
  menuSel = (menuSel + d + MENU_ROWS) % MENU_ROWS;
  if (menuSel < 3) { data.diff = menuSel; save(data); }
  music.sfx('blip');
}
function changeVolume(d) {
  data.volume = Math.round(Math.max(0, Math.min(1, data.volume + d)) * 10) / 10;
  music.setVolume(data.volume); save(data); volShow = 1.5; music.sfx('blip');
}

// ---------- input ----------
// primary = side button (or a screen tap). In a run it is a jump press, buffered 125 ms.
function press() {
  music.unlock();
  switch (state) {
    case 'SPLASH': music.setVolume(data.volume); music.sfx('start'); toMenu(); break;
    case 'MENU': music.sfx('start'); if (menuSel === 3) openProbe(); else startRun(); break;
    case 'PLAY': P.jumpBuffer = JUMP_BUFFER; break;
    case 'PAUSE': state = 'PLAY'; music.resume(); break;
    case 'DEAD': if (deathTimer > 0.45) startRun(); break;
  }
}
function closeProbe() {
  if (probe.lags.length >= 3) {
    const l = [...probe.lags].sort((a, b) => a - b), med = l[l.length >> 1];
    data.sideLag = Math.round(Math.max(0, Math.min(150, med))); save(data);
  }
  toMenu();
}
function wheel(dir) {                         // dir: -1 up, +1 down
  if (state === 'PROBE') { closeProbe(); return; }
  if (state === 'MENU') changeDiff(dir);
  else if (state === 'PLAY' || state === 'PAUSE' || state === 'DEAD') changeVolume(-dir * 0.1);
}
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
}
const active = new Set();
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const [x, y] = canvasPoint(e);
  if (state === 'PROBE') { music.unlock(); if (x > 176 && y > 250) closeProbe(); return; }
  active.add(e.pointerId); touchHeld = true;
  if (state === 'MENU') {
    if (x > 196 && y < 30) { music.unlock(); changeVolume(data.volume >= 1 ? -1 : 0.25); return; }   // speaker icon
    for (let d = 0; d < MENU_ROWS; d++) if (y >= MENU_Y + d * MENU_STEP && y < MENU_Y + 22 + d * MENU_STEP && x > 24 && x < 216) {
      if (d !== menuSel) { menuSel = d; if (d < 3) { data.diff = d; save(data); } music.sfx('blip'); return; }
    }
  }
  if (state === 'DEAD' && deathTimer > 0.45 && y > 176 && y < 206 && x > 132 && x < 212) { toMenu(); return; }
  press();
}, { passive: false });
const release = (e) => { active.delete(e.pointerId); if (!active.size) touchHeld = false; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// The R1 reports sideClick ~120 ms after the button goes down (measured in BUTTON TEST:
// about the length of a press, so it most likely fires on release). To remove that lag,
// a side-button jump is applied where the rabbit was when the button was really pressed:
// rewind data.sideLag ms of substeps, press there, and replay the recorded input up to now.
// Falls back to an ordinary buffered press if a jump already happened in that window, the
// history is too short, or the replay would die (it can't undo the past).
function sideJump() {
  if (state !== 'PLAY' || bot || P.ship) { press(); return; }
  const lagSteps = Math.min(18, Math.round((data.sideLag || 0) / 1000 / DT));
  if (lagSteps < 1 || hist.length < lagSteps) { press(); return; }
  const k = hist.length - lagSteps;
  for (let i = k; i < hist.length; i++) if (hist[i].jumped) { press(); return; }
  const s = clonePlayer(hist[k].s);
  s.jumpBuffer = JUMP_BUFFER;
  const replay = [];
  for (let i = k; i < hist.length; i++) {
    const before = clonePlayer(s), ev = [];
    step(s, world, hist[i].held, ev);
    if (s.dead) { press(); return; }
    replay.push({ s: before, held: hist[i].held, jumped: ev.some((e) => e.type === 'jump') });
  }
  if (!replay.some((r) => r.jumped)) { press(); return; }   // wasn't grounded in time: normal buffer
  hist.splice(k, hist.length - k, ...replay);
  visOffsetY += P.y - s.y;
  P = s;
}

// R1 hardware (creations-sdk): the side button is the jump button.
//   sideClick      -> one jump (buffered, so pressing just before landing still counts)
//   longPressStart -> held: keeps bouncing, or keeps the ship climbing, until longPressEnd
// A double click arrives as two sideClicks ~50 ms apart; the second just re-arms the buffer.
window.addEventListener('sideClick', () => { if (state !== 'PROBE') sideJump(); });
window.addEventListener('longPressStart', () => { if (state === 'PROBE') return; sideHeld = true; press(); });
window.addEventListener('longPressEnd', () => { sideHeld = false; });
window.addEventListener('scrollUp', () => wheel(-1));
window.addEventListener('scrollDown', () => wheel(1));
// Keys: arrows = wheel, escape = menu. Any other key is the jump button (desktop Space, and
// whatever key event the R1 might deliver for its button, which is faster than sideClick).
window.addEventListener('keydown', (e) => {
  if (e.repeat || state === 'PROBE') return;
  if (e.key === 'ArrowUp') wheel(-1);
  else if (e.key === 'ArrowDown') wheel(1);
  else if (e.key === 'Escape') { if (state !== 'SPLASH') toMenu(); }
  else { keyHeld = true; press(); e.preventDefault(); }
});
window.addEventListener('keyup', () => { keyHeld = false; });

// ---------- BUTTON TEST: logs what the R1 actually delivers, and when ----------
// Every event carries timeStamp on the same clock. Touch events are stamped by the OS at
// the moment of contact, so pressing the side button and touching the screen together
// shows how late the side button's event arrives compared with a touch.
const probe = { log: [], lags: [], lastDown: -1, frames: 0, fpsT: 0, fps: 0 };
window.__probe = probe;
function openProbe() { state = 'PROBE'; probe.log = []; probe.lags = []; probe.lastDown = -1; music.stop(0.2); }
function probeLog(name, t) {
  if (state !== 'PROBE') return;
  const prev = probe.log.length ? probe.log[probe.log.length - 1].t : t;
  probe.log.push({ name, t, gap: t - prev });
  if (probe.log.length > 11) probe.log.shift();
  if (name === 'touch down') probe.lastDown = t;
  if ((name === 'sideClick' || name === 'longPressStart' || name.startsWith('key down')) && probe.lastDown > 0 && t - probe.lastDown < 700) {
    probe.lags.push(t - probe.lastDown); probe.lastDown = -1;
  }
}
for (const n of ['sideClick', 'longPressStart', 'longPressEnd', 'scrollUp', 'scrollDown'])
  window.addEventListener(n, (e) => probeLog(n, e.timeStamp || performance.now()), true);
window.addEventListener('keydown', (e) => probeLog(`key down ${e.key || e.code}`, e.timeStamp), true);
window.addEventListener('keyup', (e) => probeLog(`key up ${e.key || e.code}`, e.timeStamp), true);
canvas.addEventListener('pointerdown', (e) => probeLog('touch down', e.timeStamp), true);
canvas.addEventListener('pointerup', (e) => probeLog('touch up', e.timeStamp), true);

// Leaving the Creation (or the screen sleeping) pauses the run and the music.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (state === 'PLAY') state = 'PAUSE'; music.suspend(); touchHeld = sideHeld = false; active.clear(); }
  else if (state !== 'PAUSE') music.resume();
});

// ---------- update ----------
function update(dt) {
  if (volShow > 0) volShow -= dt;
  menuT += dt;
  if (state === 'PLAY') {
    acc += dt;
    while (acc >= DT && state === 'PLAY') {
      const ev = [];
      const h = bot ? bot(world, P) : held();
      const before = clonePlayer(P);
      step(P, world, h, ev);
      hist.push({ s: before, held: h, jumped: ev.some((e) => e.type === 'jump') });
      if (hist.length > HIST_MAX) hist.shift();
      for (const e of ev) {
        if (e.type === 'pad') music.sfx('pad');
        else if (e.type === 'portal') {
          flash = 0.1;
          if (e.kind === T.PORTAL_SHIP) { flashColor = COL.ship; music.sfx('ship'); }
          else { flashColor = e.kind === T.PORTAL_FLIP ? COL.flip : COL.unflip; music.sfx(e.kind === T.PORTAL_FLIP ? 'portalUp' : 'portalDown'); }
        }
      }
      if (P.dead) { acc = 0; die(); break; }
      acc -= DT;
    }
    if (P) music.setSpeedFactor(P.speed / SPEED0);
    visOffsetY *= Math.exp(-dt / 0.045);
    if (Math.abs(visOffsetY) < 0.3) visOffsetY = 0;
    if (!P.grounded && !P.ship) visAngle = P.angle;
    else { const up = Math.round(visAngle / 360) * 360; visAngle += (up - visAngle) * Math.min(1, dt * 30); if (Math.abs(up - visAngle) < 1) visAngle = 0; }
  } else if (state === 'DEAD') {
    deathTimer += dt;
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.life -= dt; }
  }
  if (flash > 0) flash -= dt;
}

// ---------- drawing helpers ----------
const screenY = (localTop, h, inv) => Y0 + (inv ? (TOP + GY - localTop - h) : localTop);
function playerScreen() {
  return [PX + 8, screenY(renderY, TILE, P.inv) + 8];
}
function text(s, x, y, size = 8, color = COL.text, align = 'left') {
  g.font = `${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'top';
  g.fillText(s, x, y);
}
function tri(x1, y1, x2, y2, x3, y3) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); }
const mix = (a, b, t) => a + (b - a) * t;

function drawSky(tier, vis, ox, oy) {
  const kick = music.env(vis.kickT, 9), bar = music.env(vis.barT, 3);
  const grd = g.createLinearGradient(0, 0, 0, FLOOR);
  grd.addColorStop(0, COL.bgTop[tier]); grd.addColorStop(1, COL.bgBot[tier]);
  g.fillStyle = grd; g.fillRect(0, 0, W, FLOOR);
  if (kick > 0.01) { g.fillStyle = `rgba(120,90,255,${0.07 * kick})`; g.fillRect(0, 0, W, FLOOR); }
  if (bar > 0.01) { g.fillStyle = `rgba(255,79,0,${0.05 * bar})`; g.fillRect(0, 0, W, FLOOR); }
  if (P && P.inv) return;              // upside down the sky is the floor: keep it clear
  const t = performance.now() >> 7;
  for (const s of stars) {
    const sp = [0.08, 0.22, 0.5][s.layer];
    let sx = (s.x - (renderX * sp) % W); if (sx < 0) sx += W;
    sx += ox; const sy = s.y + oy, tw = (t + s.seed) & 7;
    if (s.layer === 0) { g.fillStyle = '#50508a'; g.fillRect(sx, sy, 1, 1); }
    else if (s.layer === 1) { g.fillStyle = tw < 4 ? '#9696e6' : '#d2d2ff'; g.fillRect(sx - 1, sy, 3, 1); g.fillRect(sx, sy - 1, 1, 3); }
    else {
      const r = (tw < 3 ? 2 : 3) + kick * 1.5;
      g.fillStyle = '#78c8ff'; g.strokeStyle = '#fff'; g.lineWidth = 1;
      if (s.seed & 1) { tri(sx, sy - r, sx - r, sy + r, sx + r, sy + r); g.fill(); g.stroke(); }
      else { g.beginPath(); g.moveTo(sx, sy - r); g.lineTo(sx + r, sy); g.lineTo(sx, sy + r); g.lineTo(sx - r, sy); g.closePath(); g.fill(); g.stroke(); }
    }
  }
  // hex planet, slow parallax
  let cx = 200 - (renderX * 0.05) % 640; if (cx < -30) cx += 640;
  cx += ox; const cy = 62 + oy, R = 13 + bar * 1.5;
  g.beginPath();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); }
  g.closePath(); g.fillStyle = '#462882'; g.fill(); g.strokeStyle = '#a082dc'; g.stroke();
  g.fillStyle = '#9678c8'; g.fillRect(cx - 22, cy + 2, 44, 1); g.fillStyle = '#6e55aa'; g.fillRect(cx - 19, cy + 4, 38, 1);
}

// Music strip: song title + 16 bars driven by the sequencer (kick, snare, lead pitch).
function drawMusicStrip(vis) {
  g.fillStyle = 'rgba(5,3,20,0.85)'; g.fillRect(0, 0, W, 28);
  g.fillStyle = COL.accent; g.fillRect(0, 27, W, 1);
  const key = state === 'MENU' || state === 'SPLASH' ? 'menu' : SONG_FOR_DIFF[data.diff];
  text('♪ ' + SONG_TITLES[key], 6, 5, 8, music.playing ? COL.text : COL.dim);
  const kick = music.env(vis.kickT, 10), snare = music.env(vis.snareT, 12), lead = music.env(vis.leadT, 5);
  const beat = music.env(vis.beatT, 6);
  for (let i = 0; i < 24; i++) {
    const x = 6 + i * 8;
    let h;
    if (!music.playing) h = 1;
    else {
      const ph = (i * 0.9 + (vis.leadMidi % 12)) % 24;
      h = 1 + kick * (i < 6 ? 10 - i : 3) + snare * (i >= 9 && i < 15 ? 7 : 2) + lead * 8 * Math.abs(Math.sin(ph)) + beat * 2;
    }
    h = Math.min(12, h);
    g.fillStyle = i % 6 === 0 ? COL.accent : '#6e5ad2';
    g.fillRect(x, 25 - h, 5, h);
  }
  // volume / speaker
  const vx = 214;
  g.fillStyle = data.volume > 0 ? COL.text : COL.red;
  g.fillRect(vx, 8, 4, 6); tri(vx + 2, 11, vx + 9, 4, vx + 9, 18); g.fill();
  if (data.volume === 0) { g.strokeStyle = COL.red; g.lineWidth = 2; g.beginPath(); g.moveTo(vx + 12, 6); g.lineTo(vx + 20, 16); g.moveTo(vx + 20, 6); g.lineTo(vx + 12, 16); g.stroke(); }
  else for (let k = 0; k < Math.ceil(data.volume * 3); k++) { g.fillRect(vx + 12 + k * 3, 14 - k * 3, 2, 2 + k * 3); }
}

function drawTile(t, sx, sy, flip, pulse) {
  if (t === T.SPIKE_DOWN) { t = T.SPIKE; flip = !flip; }
  const edge = pulse > 0.05 ? `rgb(255,${Math.round(255 - 120 * pulse)},${Math.round(255 - 200 * pulse)})` : COL.edge;
  g.lineWidth = 1;
  if (t === T.BLOCK) {
    g.fillStyle = COL.block; g.fillRect(sx, sy, TILE, TILE);
    g.strokeStyle = edge; g.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
    g.fillStyle = '#7866dc'; g.fillRect(sx + 3, flip ? sy + TILE - 4 : sy + 3, TILE - 6, 1);
  } else if (t === T.SPIKE) {
    if (!flip) tri(sx + 0.5, sy + TILE - 0.5, sx + TILE - 0.5, sy + TILE - 0.5, sx + 8, sy + 0.5);
    else tri(sx + 0.5, sy + 0.5, sx + TILE - 0.5, sy + 0.5, sx + 8, sy + TILE - 0.5);
    g.fillStyle = COL.spikeFill; g.fill(); g.strokeStyle = edge; g.stroke();
  } else if (t === T.PAD) {
    const y = flip ? sy + 2 : sy + TILE - 3;
    g.fillStyle = COL.gold; g.beginPath(); g.ellipse(sx + 8, y, 7, 3, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillRect(sx + 5, flip ? y : y - 1, 6, 1);
  }
}
function drawPortal(kind, sx, syBottom, flip) {
  const c = kind === T.PORTAL_FLIP ? COL.flip : kind === T.PORTAL_UNFLIP ? COL.unflip : COL.ship;
  const h = 3 * TILE, y = flip ? syBottom : syBottom - h;
  g.fillStyle = '#0a061e'; g.strokeStyle = c; g.lineWidth = 2;
  g.beginPath(); g.roundRect(sx + 2, y, 12, h, 6); g.fill(); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.roundRect(sx + 4.5, y + 3.5, 7, h - 7, 3); g.stroke();
  g.fillStyle = c;
  const ay = y + h / 2;
  if (kind === T.PORTAL_SHIP) { tri(sx + 5, ay - 4, sx + 12, ay, sx + 5, ay + 4); g.fill(); }
  else { const up = (kind === T.PORTAL_FLIP) !== flip;
    if (up) tri(sx + 8, ay - 5, sx + 4, ay + 2, sx + 12, ay + 2); else tri(sx + 8, ay + 5, sx + 4, ay - 2, sx + 12, ay - 2); g.fill(); }
}
// flipY: running on the ceiling, so the rabbit's feet point up
function drawRabbit(cx, cy, deg, scale = 1, flipY = false) {
  g.save(); g.translate(Math.round(cx), Math.round(cy)); g.rotate(deg * Math.PI / 180); g.scale(scale, flipY ? -scale : scale);
  g.imageSmoothingEnabled = false;
  g.drawImage(rabbitSprite, -8, -8);
  g.restore();
}
function drawShip(cx, cy, tilt, flip, thrust) {
  g.save(); g.translate(cx, cy); if (flip) g.scale(1, -1); g.rotate(tilt * Math.PI / 180);
  g.fillStyle = COL.ship; g.strokeStyle = '#fff'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-9, 1); g.lineTo(2, 0); g.lineTo(10, 4); g.lineTo(-9, 8); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-9, 1); g.lineTo(-4, 1); g.lineTo(-8, -5); g.closePath(); g.fill(); g.stroke();
  g.imageSmoothingEnabled = false; g.drawImage(rabbitSprite, -6, -9, 9, 9);   // rabbit pilot
  if (thrust) { const f = Math.random() * 3; g.fillStyle = COL.flame; tri(-9, 3, -9, 7, -15 - f, 5); g.fill(); }
  g.restore();
}

function drawWorld(vis, ox, oy) {
  const tier = world.tierForCol(Math.floor(P.x / TILE));
  drawSky(tier, vis, ox, oy);
  const kick = music.env(vis.kickT, 9);
  // "ATTEMPT N" floats in the world at the start of the run, GD style
  const ax = 70 - (renderX - PX) + ox;
  if (ax > -200) text(`ATTEMPT ${attempt}`, ax, Y0 + 20 + oy, 8, 'rgba(255,255,255,0.85)');
  const first = Math.floor(renderX / TILE) - 4, scrollPx = Math.round(renderX) - PX;
  const ceil = data.diff !== 0;
  const lineCol = `rgb(${Math.round(mix(255, 255, kick))},${Math.round(mix(255, 160, kick))},${Math.round(mix(255, 90, kick))})`;
  for (let c = first; c <= first + 20; c++) {
    const sx = c * TILE - scrollPx + ox;
    const inv = world.colInv(c), gnd = world.tileAt(c, 0) !== T.PIT;
    const floorHere = inv ? true : gnd, ceilHere = inv ? gnd : true;
    if (floorHere) {
      g.fillStyle = COL.ground; g.fillRect(sx, FLOOR + oy, TILE, H - FLOOR);
      g.fillStyle = lineCol; g.fillRect(sx, FLOOR + oy, TILE, kick > 0.3 ? 2 : 1);
      g.fillStyle = COL.groundHi; g.fillRect(sx, FLOOR + oy + 3, 1, 5);
    } else { g.fillStyle = COL.pit; g.fillRect(sx, FLOOR + oy, TILE, H - FLOOR); }
    if (ceil) {
      if (ceilHere) {
        g.fillStyle = COL.ground; g.fillRect(sx, Y0 - CEIL_H + oy, TILE, CEIL_H);
        g.fillStyle = lineCol; g.fillRect(sx, Y0 - (kick > 0.3 ? 2 : 1) + oy, TILE, kick > 0.3 ? 2 : 1);
        g.fillStyle = COL.groundHi; g.fillRect(sx, Y0 - 8 + oy, 1, 5);
      } else { g.fillStyle = COL.pit; g.fillRect(sx, Y0 - CEIL_H + oy, TILE, CEIL_H); }
    }
    for (let r = 0; r < ROWS; r++) {
      const t = world.tileAt(c, r); if (t === T.AIR || t === T.PIT) continue;
      if (t >= T.PORTAL_FLIP) { drawPortal(t, sx, (inv ? Y0 : FLOOR) + oy, inv); continue; }
      drawTile(t, sx, screenY(GY - (r + 1) * TILE, TILE, inv) + oy, inv, kick * 0.7);
    }
  }
}

function drawPlayer(ox, oy) {
  const [cx, cy] = playerScreen();
  if (P.ship) drawShip(cx + ox, cy + oy, (P.vy / SHIP_VMAX) * 28, P.inv, held() || (bot && P.vy < 0));
  else drawRabbit(cx + ox, cy + oy, P.inv ? -visAngle : visAngle, 1, P.inv);
}

function fmt(t) { return t.toFixed(1) + 's'; }

function drawHUD() {
  const y = FLOOR + 12;
  text(fmt(P.time), 8, y, 16, COL.text);
  text(`BEST ${data.best[data.diff].toFixed(1)}`, W - 8, y, 8, COL.gold, 'right');
  text(`${Math.floor(P.x / TILE)}m`, 8, y + 26, 8, COL.dim);
  text(DIFF[data.diff], W - 8, y + 26, 8, COL.dim, 'right');
  // speed meter
  const f = (P.speed - SPEED0) / 90;
  g.fillStyle = '#2a2266'; g.fillRect(8, y + 44, W - 16, 4);
  g.fillStyle = COL.accent; g.fillRect(8, y + 44, (W - 16) * f, 4);
}
function drawVolume() {
  if (volShow <= 0) return;
  const a = Math.min(1, volShow * 2);
  g.globalAlpha = a;
  g.fillStyle = 'rgba(5,3,20,0.9)'; g.fillRect(40, 36, 160, 26); g.strokeStyle = COL.accent; g.strokeRect(40.5, 36.5, 159, 25);
  text('VOL', 48, 45, 8);
  for (let i = 0; i < 10; i++) { g.fillStyle = i < Math.round(data.volume * 10) ? COL.accent : '#2a2266'; g.fillRect(80 + i * 11, 44, 8, 10); }
  g.globalAlpha = 1;
}

function drawDeath() {
  if (deathTimer < 0.45) return;
  const kx = P.dead.col * TILE - (Math.round(renderX) - PX);
  // killer tile flashes red
  if (((deathTimer * 6) | 0) % 2 === 0 && P.dead.what !== 'pit') {
    const inv = world.colInv(P.dead.col), ky = screenY(GY - (P.dead.row + 1) * TILE, TILE, inv);
    g.strokeStyle = COL.red; g.lineWidth = 2; g.strokeRect(kx - 2, ky - 2, TILE + 4, TILE + 4); g.lineWidth = 1;
  }
  g.fillStyle = 'rgba(5,3,20,0.92)'; g.fillRect(20, 58, 200, 154);
  g.strokeStyle = newBest ? COL.gold : '#fff'; g.lineWidth = 2; g.strokeRect(21, 59, 198, 152); g.lineWidth = 1;
  text(newBest ? 'NEW BEST!' : 'CRASHED', W / 2, 70, 8, newBest ? COL.gold : COL.red, 'center');
  text(fmt(P.time), W / 2, 88, 16, COL.text, 'center');
  text(`${P.dead.what.toUpperCase()} AT ${Math.floor(P.x / TILE)}m`, W / 2, 114, 8, COL.dim, 'center');
  text(`BEST ${data.best[data.diff].toFixed(1)}s`, W / 2, 130, 8, COL.gold, 'center');
  text(`ATTEMPT ${attempt}`, W / 2, 146, 8, COL.dim, 'center');
  const blink = ((deathTimer * 2.5) | 0) % 2 === 0;
  g.fillStyle = COL.accent; g.fillRect(28, 176, 96, 28);
  text('RETRY', 76, 186, 8, blink ? '#fff' : '#ffd8c4', 'center');
  g.strokeStyle = '#fff'; g.strokeRect(132.5, 176.5, 79, 27);
  text('MENU', 172, 186, 8, COL.text, 'center');
}

function drawMenu(vis) {
  renderX = menuT * 60;
  drawSky(0, vis, 0, 0);
  const beat = music.env(vis.beatT, 7), kick = music.env(vis.kickT, 9);
  // floor
  g.fillStyle = COL.ground; g.fillRect(0, FLOOR, W, H - FLOOR);
  g.fillStyle = kick > 0.3 ? '#ffb070' : '#fff'; g.fillRect(0, FLOOR, W, 1);
  for (let x = -(renderX % TILE); x < W; x += TILE) { g.fillStyle = COL.groundHi; g.fillRect(x, FLOOR + 3, 1, 5); }
  // title
  text('GEOMETRY', W / 2, 36, 16, COL.text, 'center');
  text('RABBIT', W / 2, 56, 16, COL.accent, 'center');
  // level picker (wheel), then BUTTON TEST
  for (let d = 0; d < MENU_ROWS; d++) {
    const y = MENU_Y + d * MENU_STEP, sel = d === menuSel;
    if (sel) { g.fillStyle = d === 3 ? '#4a3f99' : COL.accent; g.fillRect(24, y, 192, 22); }
    else { g.strokeStyle = '#4a3f99'; g.strokeRect(24.5, y + 0.5, 191, 21); }
    if (d === 3) { text('BUTTON TEST', W / 2, y + 7, 8, sel ? '#fff' : '#5a5090', 'center'); continue; }
    text(DIFF[d], 34, y + 3, 8, sel ? '#fff' : COL.dim);
    text(SONG_TITLES[SONG_FOR_DIFF[d]], 34, y + 12, 8, sel ? '#ffe2d4' : '#5a5090');
    text(data.best[d] ? data.best[d].toFixed(1) + 's' : '--', 208, y + 7, 8, sel ? '#fff' : COL.dim, 'right');
  }
  // the rabbit hops and flips on every beat
  const hop = music.playing && vis.beatT > 0 ? Math.min(1, (music.ctx.currentTime - vis.beatT) / 0.3) : 1;
  drawRabbit(PX, FLOOR - 8 - Math.sin(hop * Math.PI) * 12, hop < 1 ? hop * 360 : 0);
  if (data.diff === 2) drawShip(PX + 120, FLOOR - 30 - 4 * Math.sin(menuT * 3), 8 * Math.sin(menuT * 3), false, true);
  if (((menuT * 2) | 0) % 2 === 0) text(menuSel === 3 ? 'PRESS TO OPEN' : 'PRESS SIDE BUTTON', W / 2, FLOOR + 14, 8, COL.text, 'center');
  text('SIDE BUTTON = JUMP', W / 2, FLOOR + 32, 8, COL.dim, 'center');
  text('WHEEL = LEVEL', W / 2, FLOOR + 46, 8, COL.dim, 'center');
  text(`ATTEMPTS ${data.attempts[data.diff]}`, W / 2, FLOOR + 60, 8, '#5a5090', 'center');
}

function drawSplash() {
  renderX = menuT * 40;
  drawSky(0, music.vis, 0, 0);
  g.fillStyle = COL.ground; g.fillRect(0, FLOOR, W, H - FLOOR); g.fillStyle = '#fff'; g.fillRect(0, FLOOR, W, 1);
  text('GEOMETRY', W / 2, 60, 16, COL.text, 'center');
  text('RABBIT', W / 2, 84, 16, COL.accent, 'center');
  const spin = (menuT % 1.6) / 0.5, jump = spin < 1 ? Math.sin(spin * Math.PI) : 0;
  drawRabbit(W / 2, 176 - 24 - jump * 30, spin < 1 ? spin * 360 : 0, 3);
  if (((menuT * 2) | 0) % 2 === 0) text('TAP TO START', W / 2, FLOOR + 22, 8, COL.text, 'center');
  text('♪ tap the screen once', W / 2, FLOOR + 40, 8, COL.dim, 'center');
  text('for sound', W / 2, FLOOR + 52, 8, COL.dim, 'center');
}

function drawProbe() {
  g.fillStyle = '#070722'; g.fillRect(0, 0, W, H);
  text('BUTTON TEST', 8, 8, 8, COL.accent);
  text(`${probe.fps} FPS`, W - 8, 8, 8, probe.fps >= 55 ? '#5ee29a' : COL.gold, 'right');
  text('Press side button AND', 8, 24, 8, COL.dim);
  text('tap screen together:', 8, 36, 8, COL.dim);
  if (probe.lags.length) {
    const l = probe.lags, avg = l.reduce((a, b) => a + b, 0) / l.length;
    text(`lag ${Math.round(avg)}ms`, 8, 52, 8, COL.text);
    text(`n=${l.length} min ${Math.round(Math.min(...l))} max ${Math.round(Math.max(...l))}`, 8, 64, 8, COL.dim);
  } else text('side lag  --', 8, 52, 8, COL.text);
  text(`jump comp ${data.sideLag}ms`, W - 8, 52, 8, COL.gold, 'right');
  g.fillStyle = '#2c2570'; g.fillRect(8, 78, W - 16, 1);
  probe.log.forEach((e, i) => {
    const y = 86 + i * 14;
    text(e.name.slice(0, 18), 8, y, 8, e.name.startsWith('touch') ? '#14bee6' : e.name.startsWith('scroll') ? COL.dim : COL.gold);
    text(i ? `+${Math.round(e.gap)}` : '', W - 8, y, 8, COL.dim, 'right');
  });
  if (!probe.log.length) text('waiting for input...', 8, 90, 8, '#5a5090');
  g.strokeStyle = '#fff'; g.strokeRect(176.5, 254.5, 56, 20); text('BACK', 204, 261, 8, COL.text, 'center');
  text('back saves it', 8, 261, 8, '#5a5090');
}

function render() {
  const vis = music.update();
  if (state === 'SPLASH') { drawSplash(); return; }
  if (state === 'PROBE') { drawProbe(); return; }
  if (state === 'MENU') { drawMenu(vis); drawMusicStrip(vis); drawVolume(); return; }
  const lead = state === 'PLAY' ? acc : 0;
  renderX = P.x + P.speed * lead;
  renderY = (state === 'PLAY' && !P.grounded ? P.y + P.vy * lead : P.y) + (state === 'PLAY' ? visOffsetY : 0);
  let ox = 0, oy = 0;
  if (shake > 0) { ox = (Math.random() * 6 - 3) | 0; oy = (Math.random() * 4 - 2) | 0; shake--; }
  drawWorld(vis, ox, oy);
  if (state !== 'DEAD') drawPlayer(ox, oy);
  else for (const p of parts) if (p.life > 0) { g.fillStyle = COL.cube; g.fillRect(p.x + ox, p.y + oy, 3, 3); }
  drawHUD();
  drawMusicStrip(vis);
  if (flash > 0) { g.globalAlpha = Math.min(0.6, flash * 6); g.fillStyle = flashColor; g.fillRect(0, 28, W, FLOOR - 28); g.globalAlpha = 1; }
  if (state === 'DEAD') drawDeath();
  if (state === 'PAUSE') {
    g.fillStyle = 'rgba(5,3,20,0.8)'; g.fillRect(0, 28, W, H - 28);
    text('PAUSED', W / 2, 110, 16, COL.text, 'center'); text('TAP TO RESUME', W / 2, 140, 8, COL.dim, 'center');
  }
  drawVolume();
}

// ---------- loop ----------
let last = performance.now();
const perf = { frames: 0, sum: 0, max: 0, updMax: 0 };
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  perf.frames++; perf.sum += dt; perf.max = Math.max(perf.max, dt);
  probe.frames++; if (now - probe.fpsT >= 1000) { probe.fps = probe.frames; probe.frames = 0; probe.fpsT = now; }
  if (dt > 0.05) dt = 0.05;
  const t0 = performance.now();
  update(dt);
  render();
  perf.updMax = Math.max(perf.updMax, performance.now() - t0);
  requestAnimationFrame(frame);
}

async function boot() {
  data = await load();
  menuSel = data.diff;
  data.volume = 0.5;               // every launch starts at 50%; the wheel changes it for the session
  music.volume = data.volume;
  try { await document.fonts.load(`8px ${FONT}`); await document.fonts.load(`16px ${FONT}`); } catch { /* fallback font */ }
  requestAnimationFrame((t) => { last = t; frame(t); });
}
boot();

// test hooks (headless harness)
window.__game = {
  get state() { return state; }, get P() { return P; }, get data() { return data; }, music, perf,
  press, wheel, startRun, toMenu,
  setHeld(v) { keyHeld = v; },
  resetPerf() { perf.frames = 0; perf.sum = 0; perf.max = 0; perf.updMax = 0; },
};
