// engine.mjs — pure game engine: physics + endless level generator.
// Ported 1:1 from geometry-stick/firmware/src/main.cpp so every fairness fix made on
// the M5Stick carries over. No DOM, no audio: the game, the fairness solver
// (tools/verify.mjs) and the test bot all run this exact code.
//
// Coordinates are "local": y grows downward, the floor line is GY, the ceiling line
// is TOP. After a gravity portal the player's local frame is mirrored and the
// renderer draws those columns hanging from the ceiling; physics never changes.
import { CHUNKS, SHIP_CHUNKS } from './chunks.mjs';

export const TILE = 16, ROWS = 6;
export const TOP = 0, GY = ROWS * TILE;           // play band is 96 px tall
export const RING = 64;                           // generated columns kept
export const DT = 1 / 120;                        // physics substep

// scaled from GD: ~2.17 tiles high, ~4.2 tiles long at any speed
export const SPEED0 = 180, SPEED_RAMP = 0.9, SPEED_MAX = 270;
export const JUMP_H = 2.17 * TILE, PAD_MUL = 1.3;
export const SHIP_ACC = 1500, SHIP_VMAX = 240;
export const JUMP_BUFFER = 15;                     // a press up to 125 ms before landing still jumps
export const COYOTE = 6;                           // ...and up to 50 ms after running off a ledge

export const T = { AIR: 0, BLOCK: 1, SPIKE: 2, SPIKE_DOWN: 3, PIT: 4, PAD: 5,
                   PORTAL_FLIP: 6, PORTAL_UNFLIP: 7, PORTAL_SHIP: 8 };
export const DIFF = ['NORMAL', 'HARD', 'EXPERT'];

const CHAR_TILE = { '#': T.BLOCK, '^': T.SPIKE, 'v': T.SPIKE_DOWN, '_': T.PIT, 'P': T.PAD };
export const charTile = (c) => CHAR_TILE[c] || T.AIR;

// ---------- speed ----------
// Jump length is held at 4.2 tiles at any speed, so every chunk stays exactly as
// beatable while the run gets faster. VJUMP/GRAV are solved for the semi-implicit
// Euler integrator below, not the continuous parabola: the naive formulas land the
// apex VJUMP*DT/2 short, which left a 2-high block clearable by under half a pixel.
export function setSpeed(s, v) {
  s.speed = v;
  s.airtime = 4.2 * TILE / v;
  s.vjump = 4 * JUMP_H / (s.airtime - DT);
  s.grav = 2 * s.vjump / (s.airtime + DT);
  s.rotRate = 360 / s.airtime;                   // one full flip per jump (lands upright)
}

// ---------- level stream ----------
function xorshift(seed) {
  let r = (seed >>> 0) || 1;
  const next = () => { r ^= r << 13; r >>>= 0; r ^= r >>> 17; r ^= r << 5; r >>>= 0; return r; };
  return next;
}
const tierForCol = (col) => col < 40 ? 0 : col < 110 ? 1 : col < 220 ? 2 : 3;
// chance (%) of easing back a tier: 40% right after a tier unlocks, fading to 0 at 600 m
const easeChance = (col) => Math.max(0, 40 - Math.floor(col / 15));

export class World {
  constructor(diff = 0, seed = 1) {
    this.diff = diff;
    this.rnd = xorshift(seed);
    this.ring = Array.from({ length: RING }, () => new Uint8Array(ROWS));
    this.invRing = new Uint8Array(RING);
    this.genCol = 0; this.chunkIdx = -1; this.chunkCol = 0; this.chunkSrc = CHUNKS;
    this.lastChunk = -1; this.genInv = false; this.genShip = false;
    this.restCols = 14;                                  // flat runway at start
    this.nextPortalCol = diff === 2 ? 16 : 56;           // ship portal ~1.5 s in; first flip ~5 s in
    this.portalKind = T.PORTAL_FLIP;
    this.ensure(RING - 1);
  }
  rndRange(lo, hi) { return lo + (this.rnd() % (hi - lo + 1)); }
  tierForCol(col) { return tierForCol(col); }
  pickChunk(tier, col) {
    const lib = this.genShip ? SHIP_CHUNKS : CHUNKS;
    for (let tries = 0; tries < 48; tries++) {
      const want = (tier > 0 && (this.rnd() % 100) < easeChance(col)) ? tier - 1 : tier;
      const i = this.rnd() % lib.length;
      if (lib[i].tier === want && i !== this.lastChunk) return i;
    }
    return 0;
  }
  genColumn() {
    const col = this.ring[this.genCol & (RING - 1)];
    col.fill(T.AIR);
    this.invRing[this.genCol & (RING - 1)] = this.genInv ? 1 : 0;
    if (this.chunkIdx === -2) {                        // portal sequence: 3 flat, portal, 3 flat
      if (this.chunkCol === 3) {
        col[0] = this.portalKind;
        if (this.portalKind === T.PORTAL_SHIP) this.genShip = true;
        else this.genInv = !this.genInv;               // columns after the portal are mirrored
      }
      if (++this.chunkCol >= 7) this.chunkIdx = -1;
    } else if (this.chunkIdx >= 0) {
      const ch = this.chunkSrc[this.chunkIdx];
      for (let r = 0; r < ROWS; r++) col[r] = charTile(ch.rows[ROWS - 1 - r][this.chunkCol]);
      if (++this.chunkCol >= ch.rows[0].length) this.chunkIdx = -1;
    } else if (this.restCols > 0) {
      this.restCols--;
    } else if (this.diff !== 0 && this.genCol >= this.nextPortalCol) {
      this.chunkIdx = -2; this.chunkCol = 0;
      if (this.diff === 2 && !this.genShip) { this.portalKind = T.PORTAL_SHIP; this.nextPortalCol = this.genCol + 40; }
      else { this.portalKind = this.genInv ? T.PORTAL_UNFLIP : T.PORTAL_FLIP; this.nextPortalCol = this.genCol + this.rndRange(60, 110); }
      this.restCols = 0;
      this.genColumn(); return;                       // emit this column as the first of the sequence
    } else {
      const t = tierForCol(this.genCol);
      this.chunkSrc = this.genShip ? SHIP_CHUNKS : CHUNKS;
      this.chunkIdx = this.pickChunk(t, this.genCol); this.lastChunk = this.chunkIdx; this.chunkCol = 0;
      const base = Math.max(1, 6 - t - Math.floor(this.genCol / 250));   // breather shrinks with tier and distance
      this.restCols = this.rndRange(base, base + 2);
      const ch = this.chunkSrc[this.chunkIdx];
      for (let r = 0; r < ROWS; r++) col[r] = charTile(ch.rows[ROWS - 1 - r][0]);
      if (++this.chunkCol >= ch.rows[0].length) this.chunkIdx = -1;
    }
    this.genCol++;
  }
  ensure(upto) { while (this.genCol <= upto) this.genColumn(); }
  tileAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= this.genCol || col < this.genCol - RING) return T.AIR;
    return this.ring[col & (RING - 1)][row];
  }
  colInv(col) { return col >= 0 && col < this.genCol && col >= this.genCol - RING && this.invRing[col & (RING - 1)] === 1; }
}

// A fixed grid (solver / tests). cols[c][r], r = 0 on the floor.
export class GridWorld {
  constructor(cols) { this.cols = cols; this.genCol = cols.length; }
  ensure() {}
  tileAt(c, r) { return (c >= 0 && c < this.cols.length && r >= 0 && r < ROWS) ? this.cols[c][r] : T.AIR; }
  colInv() { return false; }
}

// ---------- player ----------
export function newPlayer(ramp = true) {
  const s = { x: 0, y: GY - TILE, vy: 0, angle: 0, grounded: true, inv: false, ship: false,
              lastPadCol: -1, lastPortalCol: -1, time: 0, jumpBuffer: 0, coyote: 0, ramp, dead: null };
  setSpeed(s, SPEED0);
  return s;
}
export const clonePlayer = (s) => ({ ...s });

// Portals: local coordinates are mirrored so the screen position is unchanged, and
// from then on gravity pulls toward the other surface.
function enterPortal(s, col, kind, ev) {
  s.lastPortalCol = col; s.coyote = 0;
  if (kind === T.PORTAL_SHIP) { s.ship = true; s.angle = 0; ev && ev.push({ type: 'portal', kind }); return; }
  s.y = (TOP + GY) - (s.y + TILE); s.vy = -s.vy; s.inv = !s.inv; s.grounded = false;
  ev && ev.push({ type: 'portal', kind });
}
function die(s, col, row, what) { s.dead = { col, row, what }; }

const hasGround = (w, c) => w.tileAt(c, 0) !== T.PIT;

// One 120 Hz substep. `held` = button currently down. `ev` (optional) collects
// jump / pad / portal events for sound and effects. Sets s.dead on death.
export function step(s, w, held, ev) {
  let prevTop = s.y, prevBottom = s.y + TILE;
  s.x += s.speed * DT;
  w.ensure(Math.floor((s.x + 240) / TILE) + 2);
  const c0 = Math.floor((s.x + 1) / TILE), c1 = Math.floor((s.x + TILE - 1) / TILE);

  // portals trigger on crossing their column, at any height
  for (let c = c0; c <= c1; c++) {
    const t = w.tileAt(c, 0);
    if (t >= T.PORTAL_FLIP && c !== s.lastPortalCol) { enterPortal(s, c, t, ev); prevTop = s.y; prevBottom = s.y + TILE; }
  }

  // side hit: a block overlapping the body (not just under the feet / above the head) kills
  for (let c = c0; c <= c1; c++)
    for (let r = 0; r < ROWS; r++) if (w.tileAt(c, r) === T.BLOCK) {
      const top = GY - (r + 1) * TILE;
      if (s.y + TILE - 1.5 > top && s.y + 1.5 < top + TILE) { die(s, c, r, 'block'); return s; }
    }

  // vertical motion
  if (s.ship) {
    s.vy += (held ? -SHIP_ACC : SHIP_ACC) * DT;
    if (s.vy > SHIP_VMAX) s.vy = SHIP_VMAX;
    if (s.vy < -SHIP_VMAX) s.vy = -SHIP_VMAX;
  } else {
    s.vy += s.grav * DT;
  }
  s.y += s.vy * DT;
  s.grounded = false;
  if (s.vy >= 0) {
    const bottom = s.y + TILE; let landY = 1e9;
    for (let c = c0; c <= c1; c++) {
      if (hasGround(w, c) && bottom >= GY && prevBottom <= GY + 0.01) landY = Math.min(landY, GY);
      for (let r = 0; r < ROWS; r++) if (w.tileAt(c, r) === T.BLOCK) {
        const top = GY - (r + 1) * TILE;
        if (bottom >= top && prevBottom <= top + 0.01) landY = Math.min(landY, top);
      }
    }
    if (landY < 1e8) { s.y = landY - TILE; s.vy = 0; s.grounded = true; if (!s.ship) s.angle = 0; }
  } else {
    const top = s.y; let ceilY = -1e9;
    for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) if (w.tileAt(c, r) === T.BLOCK) {
      const bTop = GY - (r + 1) * TILE, bBot = bTop + TILE;
      if (top < bBot && top + TILE > bTop) {
        if (s.ship && prevTop >= bBot - 0.01) ceilY = Math.max(ceilY, bBot);   // ship slides under blocks
        else { die(s, c, r, 'block'); return s; }                               // cube head-bump kills
      }
    }
    if (s.ship) {
      if (ceilY > -1e8) { s.y = ceilY; s.vy = 0; }
      if (s.y < TOP) { s.y = TOP; s.vy = 0; }                                   // ceiling is safe for the ship
    }
  }
  if (s.y + TILE > GY + 10) { die(s, c0, 0, 'pit'); return s; }

  // hazards use the small inner hitbox, like GD
  const hx0 = s.x + 4, hx1 = s.x + 12, hy0 = s.y + 4, hy1 = s.y + 12;
  for (let c = c0; c <= c1; c++) for (let r = 0; r < ROWS; r++) {
    const t = w.tileAt(c, r);
    if (t === T.AIR || t === T.BLOCK || t === T.PIT || t >= T.PORTAL_FLIP) continue;
    const tx = c * TILE, top = GY - (r + 1) * TILE;
    if (t === T.SPIKE || t === T.SPIKE_DOWN) {
      const sy0 = t === T.SPIKE ? top + 6 : top, sy1 = t === T.SPIKE ? top + TILE : top + 10;
      if (hx1 > tx + 5 && hx0 < tx + 11 && hy1 > sy0 && hy0 < sy1) { die(s, c, r, 'spike'); return s; }
    } else if (t === T.PAD && c !== s.lastPadCol && !s.ship) {
      if (hx1 > tx + 2 && hx0 < tx + 14 && s.y + TILE > top + 8) {
        s.vy = -s.vjump * PAD_MUL; s.grounded = false; s.lastPadCol = c; s.coyote = 0;
        ev && ev.push({ type: 'pad' });
      }
    }
  }

  if (!s.ship) {
    if (s.grounded) s.coyote = COYOTE; else if (s.coyote > 0) s.coyote--;
    const canJump = s.grounded || (s.coyote > 0 && s.vy >= 0);
    if (canJump && (held || s.jumpBuffer > 0)) {
      s.vy = -s.vjump; s.grounded = false; s.jumpBuffer = 0; s.coyote = 0;
      ev && ev.push({ type: 'jump' });
    }
    if (!s.grounded) s.angle += s.rotRate * DT;
  }
  if (s.jumpBuffer > 0) s.jumpBuffer--;
  s.time += DT;
  if (s.ramp && (s.grounded || s.ship)) setSpeed(s, Math.min(SPEED_MAX, SPEED0 + SPEED_RAMP * s.time));
  return s;
}
