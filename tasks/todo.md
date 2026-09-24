# Geometry Rabbit — todo

Port of Geometry Stick (M5StickC PLUS, /Users/joe/geometry-stick) to the Rabbit R1 as a
hand-coded Creation (240x282 portrait WebView), plus an original Mega Man-style chiptune
soundtrack. Joe asked for end-to-end: build, test, deploy, then show him.

## Build
- [x] engine.mjs: pure physics + endless generator ported 1:1 from main.cpp (cube, pads, gravity portals, ship)
- [x] chunks.mjs: 33 cube chunks + 11 ship chunks from chunks.h
- [x] tools/verify.mjs: fairness solver that runs the REAL engine step (no mirror drift)
- [x] music.mjs: Web Audio chiptune engine (pulse 12.5/25/50% duty, triangle bass, noise drums, vibrato, echo)
- [x] 4 original songs: title/menu + one per difficulty, 150+ BPM, tempo rises with run speed
- [x] game.mjs: canvas renderer, beat-reactive visuals, HUD in the floor band, attempt counter, death card
- [x] Input: touch (tap/hold), side button (click = jump, long-press = hold), wheel (menu = difficulty, in-run = volume)
- [x] Storage: creationStorage.plain (base64) with localStorage fallback; best + attempts per difficulty, volume
- [x] Pause on visibility change (leaving the Creation)

## Test
- [x] Solver: every chunk and chunk pair beatable at 180 and 270 px/s
- [x] Headless Chrome at 240x282: screenshots of splash / menu / run / ship / death
- [x] Bot run through live generated levels on all 3 difficulties with no unfair deaths
- [x] R1 emulation: simulated sideClick/longPress/scroll events, creationStorage stub, 4x CPU throttle frame timing
- [x] Offline-render each song to WAV: non-silent, no clipping

## Ship
- [x] GitHub repo + Pages deploy
- [x] Install QR (creations-sdk payload {title,url,description,iconUrl,themeColor})
- [x] Showcase page for Joe (screens, songs, QR)
- [ ] Joe: scan QR on the R1 and playtest (only step Claude can't do)

## Round 2 — Joe feedback 2026-09-24 ("jumping should be more responsive", "side button as jump", "rabbit avatar that flips")
- [x] Side button = jump (sideClick), hold = longPressStart..End; any raw key also jumps
- [x] Jump buffer 67 -> 125 ms, coyote time 50 ms; solver + bot re-pass
- [x] 16x16 pixel rabbit replaces the cube, one full flip per jump, eases upright; pilots the ship
- [x] BUTTON TEST screen: event log + side-button lag vs touch + FPS
- [x] e2e 38/38 on the live URL; showcase v2
- [ ] Joe: run BUTTON TEST on the R1, report side lag + FPS -> decide on lag compensation (rewind the jump by the measured lag)

## Review
- Built and deployed 2026-09-24. Live: https://joefts.github.io/geometry-r1/src/index.html ; QR docs/install-qr.png ; showcase https://claude.ai/artifact/MVEq25nuUR9yYWoMuC4r9y
- Tests: solver 33/33 chunks, 1056/1056 pairs, 11/11 ship (now at 180 AND 270 px/s); bot 150 s x 4 seeds x 3 levels; R1 emulation 34/34 against the live URL (60 fps at 4x CPU throttle).
- Found: ship chunk 10 (4-col wall slalom) impossible above ~245 px/s. Widened to 5 cols here. Geometry Stick still has the old chunk and its solver only checks ship chunks at 180.
- Mixes clipped at first (peak 1.1-1.4); bus gain 0.55 + limiter-style compressor, peaks now ~0.65.
- Not verified: real R1 hardware. Unknowns: whether sideClick counts as a user gesture for audio unlock (tap the screen first), and whether long-press also emits sideClick.
