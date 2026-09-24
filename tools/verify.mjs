// verify.mjs — fairness solver. Port of geometry-stick/tools/verify_chunks.py, but it
// drives the REAL engine step() from src/engine.mjs, so there is no physics mirror to
// drift out of sync.
//
// Fairness rule: a jump only counts if it still works when the press lands anywhere in
// a WINDOW-substep span (~42 ms), because a human cannot hit one exact substep. Holding
// through a landing jumps on the landing step with no jitter (the game does exactly
// that), so hold-to-bounce combos stay legal. Ship steering is quantized to SHIP_Q
// substeps. Every chunk is checked at start and max speed, and every ordered pair of
// cube chunks is checked joined by the smallest breather the generator emits (1 col).
import { CHUNKS, SHIP_CHUNKS } from '../src/chunks.mjs';
import { GridWorld, newPlayer, clonePlayer, setSpeed, step, charTile,
         TILE, GY, TOP, ROWS, SPEED0, SPEED_MAX } from '../src/engine.mjs';

const LEAD = 6, TAIL = 8, WINDOW = 5, SHIP_Q = 6, MIN_BREATHER = 1;

function build(rows, rows2 = null, gap = MIN_BREATHER) {
  const w = rows[0].length, w2 = rows2 ? rows2[0].length : 0;
  const cols = Array.from({ length: LEAD + w + (rows2 ? gap + w2 : 0) + TAIL }, () => new Uint8Array(ROWS));
  const put = (off, rs) => {
    for (let c = 0; c < rs[0].length; c++)
      for (let r = 0; r < ROWS; r++) cols[off + c][r] = charTile(rs[ROWS - 1 - r][c]);
  };
  put(LEAD, rows);
  if (rows2) put(LEAD + w + gap, rows2);
  return new GridWorld(cols);
}

function start(speed, y = GY - TILE, ship = false) {
  const s = newPlayer(false); setSpeed(s, speed); s.y = y; s.ship = ship; s.grounded = !ship;
  return s;
}
// one substep; null on death
function adv(w, s, held) { const n = step(clonePlayer(s), w, held); return n.dead ? null : n; }

// AND-OR search: the player picks when to jump, an adversary delays the press by
// 0..WINDOW substeps, and every delay must still lead to the goal.
function solvable(w, s0) {
  const goal = (w.genCol - 2) * TILE, memo = new Map();
  const key = (s) => `${s.x.toFixed(2)}|${s.y.toFixed(1)}|${Math.round(s.vy)}|${s.lastPadCol}|${s.grounded ? 1 : 0}`;
  function ok(s) {
    if (s.x >= goal) return true;
    const k = key(s);
    if (memo.has(k)) return memo.get(k);
    memo.set(k, false);                                  // guard (x only grows)
    let res = false;
    if (!s.grounded) {
      for (const j of [true, false]) { const n = adv(w, s, j); if (n && ok(n)) { res = true; break; } }
    } else {
      const n = adv(w, s, false);
      if (n && ok(n)) res = true;
      else {
        let good = true, cur = s; const branches = [];
        for (let d = 0; d <= WINDOW; d++) {
          if (!cur) { good = false; break; }
          const b = adv(w, cur, true);                   // press now: jumps if grounded
          if (!b) { good = false; break; }
          branches.push(b);
          cur = adv(w, cur, false);                      // press later
        }
        res = good && branches.every(ok);
      }
    }
    memo.set(k, res);
    return res;
  }
  return ok(s0);
}

// A pad must be survivable when you simply run into it along the ground.
function padGroundEntryOk(w, speed) {
  const goal = (w.genCol - 2) * TILE;
  let s = start(speed);
  while (s && s.x < goal) {
    const n = adv(w, s, false);
    if (!n) return true;                                 // can't reach a pad on the ground
    if (n.lastPadCol !== s.lastPadCol) return solvable(w, n);
    s = n;
  }
  return true;
}

function shipSolvable(w, starts, speed) {
  const goal = (w.genCol - 2) * TILE;
  for (const y0 of starts) {
    const seen = new Set(), stack = [start(speed, y0, true)];
    let ok = false;
    while (stack.length) {
      const s = stack.pop();
      if (s.x >= goal) { ok = true; break; }
      const k = `${s.x.toFixed(1)}|${Math.round(s.y / 2)}|${Math.round(s.vy / 12)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const h of [true, false]) {
        let n = s;
        for (let i = 0; i < SHIP_Q && n && n.x < goal; i++) n = adv(w, n, h);
        if (n) stack.push(n);
      }
    }
    if (!ok) return false;
  }
  return true;
}

function check(rows, rows2) {
  for (const v of [SPEED0, SPEED_MAX]) {
    const w = build(rows, rows2);
    if (!solvable(w, start(v))) return `IMPOSSIBLE @${v}`;
    if (!padGroundEntryOk(w, v)) return `PAD-TRAP @${v}`;
  }
  return 'OK';
}

const t0 = Date.now();
let bad = 0; const singles = [];
CHUNKS.forEach((ch, i) => {
  const res = check(ch.rows); bad += res !== 'OK'; singles.push(res);
  console.log(`chunk ${String(i).padStart(2)} tier ${ch.tier} width ${String(ch.rows[0].length).padStart(2)} ${res.padEnd(15)} ${ch.rows[ROWS - 1]}`);
});
console.log(`\n${CHUNKS.length} cube chunks, ${bad} impossible`);
const pbad = [];
for (let i = 0; i < CHUNKS.length; i++) for (let j = 0; j < CHUNKS.length; j++)
  if (i !== j && singles[i] === 'OK' && singles[j] === 'OK' && check(CHUNKS[i].rows, CHUNKS[j].rows) !== 'OK') pbad.push([i, j]);
console.log(`${CHUNKS.length * (CHUNKS.length - 1)} cube pairs with a ${MIN_BREATHER}-column breather, ${pbad.length} impossible ${JSON.stringify(pbad)}`);
let sbad = 0;
SHIP_CHUNKS.forEach((ch, i) => {
  // passable from the floor, mid-air and the ceiling: the ship arrives at any height
  // and at max speed too: fixed vertical thrust vs faster scroll made a 4-col wall slalom impossible past ~245 px/s
  const starts = [GY - TILE, Math.floor((TOP + GY - TILE) / 2), TOP];
  const ok = shipSolvable(build(ch.rows), starts, SPEED0) && shipSolvable(build(ch.rows), starts, SPEED_MAX); sbad += !ok;
  console.log(`ship  ${String(i).padStart(2)} tier ${ch.tier} width ${String(ch.rows[0].length).padStart(2)} ${ok ? 'OK ' : 'IMPOSSIBLE'}  ${ch.rows[ROWS - 1]}`);
});
console.log(`${SHIP_CHUNKS.length} ship chunks, ${sbad} impossible   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(bad || pbad.length || sbad ? 1 : 0);
