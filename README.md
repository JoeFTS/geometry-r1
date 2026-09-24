# Geometry Rabbit

A Geometry Dash-style one-button runner for the **Rabbit R1**, with an original
Mega Man-inspired chiptune soundtrack. Port of Geometry Stick (M5StickC PLUS): the same
physics, chunk library and fairness rules, rebuilt as an R1 Creation (240x282 WebView).

**Play / install:** https://joefts.github.io/geometry-r1/src/index.html. On the R1, scan `docs/install-qr.png`.

## Controls
| | R1 | Desktop |
|---|---|---|
| Jump (cube) / thrust (ship) | tap or hold the screen, side button click / long-press | Space |
| Pick level (menu) | scroll wheel | ↑ / ↓ |
| Volume (in a run) | scroll wheel | ↑ / ↓ |
| Retry / menu | tap RETRY / MENU on the death card | Space / Esc |

Levels: **NORMAL** (cube) · **HARD** (cube + gravity portals) · **EXPERT** (ship + gravity portals).
Endless: the world speeds up from 180 to 270 px/s and the music tempo rises with it.

## Soundtrack
All original, synthesized live with Web Audio (no audio files): a 25% pulse lead with vibrato
and echo, a 12.5% pulse arpeggio, a triangle bass, and noise drums.
- STAGE SELECT (menu, 140 BPM, C minor)
- NEON SPRINT (Normal, 156 BPM, E minor)
- SPIKE FACTORY (Hard, 168 BPM, A minor, galloping bass, four-on-the-floor)
- GRAVITY MAN (Expert, 176 BPM, D minor, 16th-note drive bass, breakbeat)

Previews: `docs/audio/*.mp3` (offline renders of the same synth code).

## Layout
```
src/engine.mjs   pure physics + endless generator (port of geometry-stick main.cpp)
src/chunks.mjs   33 cube + 11 ship chunks
src/music.mjs    chiptune synth + lookahead sequencer;  src/songs.mjs  the songs
src/game.mjs     screens, input (touch + R1 side button / wheel), canvas renderer
src/bot.mjs      look-ahead autopilot (tests, ?bot=1 demo)
src/storage.mjs  creationStorage.plain (Base64) with localStorage fallback
tools/verify.mjs fairness solver running the real engine: every chunk + chunk pair, 180 & 270 px/s
test/botrun.mjs  bot plays the live generator on all difficulties to max speed
test/r1-emulation.mjs  Chromium at 240x282 + R1 hardware events + creationStorage stub + 4x CPU throttle
```
`npm test` (solver + bot), `npm run dev` then `npm run e2e` (browser suite, screenshots to docs/screens).

Any chunk edit: `npm run verify` must print 0 impossible.
