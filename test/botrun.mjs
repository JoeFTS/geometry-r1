// Bot plays the live generator headless. Usage: node test/botrun.mjs [seconds] [seeds]
import { World, newPlayer, step, DIFF, TILE } from '../src/engine.mjs';
import { createBot } from '../src/bot.mjs';
const SECS = Number(process.argv[2] || 60), SEEDS = Number(process.argv[3] || 3);
let fails = 0;
for (let d = 0; d < 3; d++) for (let seed = 1; seed <= SEEDS; seed++) {
  const w = new World(d, seed * 7919), s = newPlayer(), bot = createBot();
  const t0 = Date.now(); let portals = 0, ship = false;
  while (s.time < SECS && !s.dead) { const ev = []; step(s, w, bot(w, s), ev); portals += ev.filter(e => e.type === 'portal').length; ship ||= s.ship; }
  const ms = (Date.now() - t0) / (s.time * 120);
  console.log(`${DIFF[d].padEnd(6)} seed ${seed}: ${s.dead ? `DIED (${s.dead.what}) at ${Math.floor(s.x / TILE)}m ${s.time.toFixed(1)}s` : `survived ${SECS}s, ${Math.floor(s.x / TILE)}m`}  portals=${portals} ship=${ship} speed=${s.speed.toFixed(0)}  bot ${ms.toFixed(2)} ms/step`);
  if (s.dead) fails++;
}
process.exit(fails ? 1 : 0);
