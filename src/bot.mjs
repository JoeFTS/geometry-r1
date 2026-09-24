// bot.mjs — look-ahead autopilot for tests and the ?bot=1 demo. It searches the real
// engine a short way ahead and presses only when coasting would die. It proves the
// live generator (portal sequences, chunk joins, speed ramp) never deals an
// impossible stretch, which the per-chunk solver can't see.
import { step, clonePlayer } from './engine.mjs';

const HORIZON = 1.3;          // seconds of look-ahead
const SHIP_Q = 6;

function adv(w, s, held) { const n = step(clonePlayer(s), w, held); return n.dead ? null : n; }

function cubeSafe(w, s, stepsLeft, memo) {
  if (stepsLeft <= 0) return true;
  const k = `${Math.round(s.x * 4)}|${Math.round(s.y)}|${Math.round(s.vy / 4)}|${s.grounded ? 1 : 0}|${s.inv ? 1 : 0}|${s.ship ? 1 : 0}`;
  if (memo.has(k)) return memo.get(k);
  memo.set(k, false);
  let ok = false;
  if (s.ship) ok = shipSafe(w, s, stepsLeft, memo);
  else for (const h of [false, true]) {
    const n = adv(w, s, h);
    if (n && cubeSafe(w, n, stepsLeft - 1, memo)) { ok = true; break; }
  }
  memo.set(k, ok);
  return ok;
}
function shipSafe(w, s, stepsLeft, memo) {
  if (stepsLeft <= 0) return true;
  for (const h of [s.vy > 0, s.vy <= 0]) {
    let n = s;
    for (let i = 0; i < SHIP_Q && n; i++) n = adv(w, n, h);
    if (n && cubeSafe(w, n, stepsLeft - SHIP_Q, memo)) return true;
  }
  return false;
}

// Returns whether to hold the button for the next substep (ship: next SHIP_Q substeps).
export function createBot() {
  let shipHold = false, shipLeft = 0;
  return function decide(w, s) {
    const steps = Math.round(HORIZON * 120);
    const memo = new Map();
    if (s.ship) {
      if (shipLeft > 0) { shipLeft--; return shipHold; }
      for (const h of [s.vy > 0, s.vy <= 0]) {
        let n = s;
        for (let i = 0; i < SHIP_Q && n; i++) n = adv(w, n, h);
        if (n && cubeSafe(w, n, steps, memo)) { shipHold = h; shipLeft = SHIP_Q - 1; return h; }
      }
      return s.vy > 0;
    }
    const coast = adv(w, s, false);
    if (coast && cubeSafe(w, coast, steps, memo)) return false;
    return true;
  };
}
