# Geometry Rabbit — todo

Port of Geometry Stick (M5StickC PLUS, /Users/joe/geometry-stick) to the Rabbit R1 as a
hand-coded Creation (240x282 portrait WebView), plus an original Mega Man-style chiptune
soundtrack. Joe asked for end-to-end: build, test, deploy, then show him.

## Build
- [ ] engine.mjs: pure physics + endless generator ported 1:1 from main.cpp (cube, pads, gravity portals, ship)
- [ ] chunks.mjs: 33 cube chunks + 11 ship chunks from chunks.h
- [ ] tools/verify.mjs: fairness solver that runs the REAL engine step (no mirror drift)
- [ ] music.mjs: Web Audio chiptune engine (pulse 12.5/25/50% duty, triangle bass, noise drums, vibrato, echo)
- [ ] 4 original songs: title/menu + one per difficulty, 150+ BPM, tempo rises with run speed
- [ ] game.mjs: canvas renderer, beat-reactive visuals, HUD in the floor band, attempt counter, death card
- [ ] Input: touch (tap/hold), side button (click = jump, long-press = hold), wheel (menu = difficulty, in-run = volume)
- [ ] Storage: creationStorage.plain (base64) with localStorage fallback; best + attempts per difficulty, volume
- [ ] Pause on visibility change (leaving the Creation)

## Test
- [ ] Solver: every chunk and chunk pair beatable at 180 and 270 px/s
- [ ] Headless Chrome at 240x282: screenshots of splash / menu / run / ship / death
- [ ] Bot run through live generated levels on all 3 difficulties with no unfair deaths
- [ ] R1 emulation: simulated sideClick/longPress/scroll events, creationStorage stub, 4x CPU throttle frame timing
- [ ] Offline-render each song to WAV: non-silent, no clipping

## Ship
- [ ] GitHub repo + Pages deploy
- [ ] Install QR (creations-sdk payload {title,url,description,iconUrl,themeColor})
- [ ] Showcase page for Joe (screens, songs, QR)
- [ ] Joe: scan QR on the R1 and playtest (only step Claude can't do)

## Review
