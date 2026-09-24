// music.mjs — tiny NES-flavoured synth + step sequencer on Web Audio.
// Channels: pulse lead (25% duty, vibrato, echo), pulse arpeggio (12.5% duty),
// triangle bass, noise + pitched kick drums. A lookahead scheduler queues notes
// ~120 ms ahead on the audio clock, so game-loop hiccups never make it stutter.
// Tempo follows the run speed (setSpeedFactor), so the track speeds up with you.
import { SONGS, DRUMS, compile, freq } from './songs.mjs';

const LOOKAHEAD = 0.12, TICK_MS = 25;
const COMPILED = Object.fromEntries(Object.entries(SONGS).map(([k, s]) => [k, compile(s)]));

function pulseWave(ctx, duty) {
  const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const a = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    re[i] = a * Math.cos(i * Math.PI * duty);
    im[i] = a * Math.sin(i * Math.PI * duty);
  }
  return ctx.createPeriodicWave(re, im);
}

export class Music {
  constructor() {
    this.ctx = null; this.volume = 0.7; this.song = null; this.playing = false;
    this.speedFactor = 1; this.events = []; this.timer = null;
    this.vis = { beatT: -1, barT: -1, kickT: -1, snareT: -1, leadT: -1, leadMidi: 0, bassT: -1, beat: 0 };
  }

  // Must be called from a user gesture the first time (autoplay policy).
  unlock(ctx) {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC && !ctx) return false;
      this.build(ctx || new AC({ latencyHint: 'interactive' }));
    }
    if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
    return true;
  }
  build(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 0; comp.ratio.value = 12; comp.attack.value = 0.001; comp.release.value = 0.1;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.waves = { p12: pulseWave(ctx, 0.125), p25: pulseWave(ctx, 0.25), p50: pulseWave(ctx, 0.5) };
    const len = ctx.sampleRate;                          // 1 s of white noise
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let r = 0x1234567;
    for (let i = 0; i < len; i++) { r ^= r << 13; r ^= r >> 17; r ^= r << 5; d[i] = ((r >>> 0) / 4294967296) * 2 - 1; }
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }
  setSpeedFactor(f) { this.speedFactor = f; }
  get bpm() { return this.song ? this.song.bpm * (1 + 0.3 * (this.speedFactor - 1)) : 120; }
  get stepDur() { return 60 / this.bpm / 4; }

  // ---------- transport ----------
  play(key) {
    if (!this.ctx) return;
    this.stop(0.03);
    this.song = COMPILED[key]; this.songKey = key;
    this.bus = this.ctx.createGain(); this.bus.gain.value = 0.55;
    this.filter = this.ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 18000;
    this.bus.connect(this.filter).connect(this.master);
    this.echo = this.ctx.createDelay(1); this.echo.delayTime.value = 0.14;
    const fb = this.ctx.createGain(); fb.gain.value = 0.28;
    const wet = this.ctx.createGain(); wet.gain.value = 0.32;
    this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.bus);
    this.orderIdx = 0; this.secStep = 0; this.nextT = this.ctx.currentTime + 0.06; this.events.length = 0;
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }
  // Power-down: sweep the low-pass shut and fade, like the tape stopping.
  stop(fade = 0.35) {
    clearInterval(this.timer); this.timer = null;
    if (!this.playing || !this.bus) { this.playing = false; return; }
    this.playing = false;
    const t = this.ctx.currentTime, bus = this.bus, filter = this.filter;
    bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.linearRampToValueAtTime(0, t + fade);
    filter.frequency.cancelScheduledValues(t); filter.frequency.setValueAtTime(filter.frequency.value, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + fade);
    setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, (fade + 0.4) * 1000);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  schedule() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    if (this.nextT < now - 0.25) this.nextT = now + 0.02;   // woke from a stall: don't machine-gun the backlog
    this.advanceUntil(now + LOOKAHEAD);
  }
  // Offline render (tests / showcase WAVs): queue a whole stretch of song at once.
  prerender(key, seconds) {
    this.play(key); clearInterval(this.timer); this.timer = null;
    this.advanceUntil(seconds); this.events.length = 0;
  }
  advanceUntil(tEnd) {
    while (this.nextT < tEnd) {
      this.playStep(this.nextT);
      this.nextT += this.stepDur;
      this.secStep++;
      const sec = this.song.compiled[this.song.order[this.orderIdx]];
      if (this.secStep >= sec.bars.length * 16) {
        this.secStep = 0;
        this.orderIdx++;
        if (this.orderIdx >= this.song.order.length) this.orderIdx = this.song.loop;
      }
    }
  }

  playStep(t) {
    const song = this.song, secKey = song.order[this.orderIdx], sec = song.compiled[secKey];
    const bar = Math.floor(this.secStep / 16), s = this.secStep % 16, B = sec.bars[bar];
    const lastBar = bar === sec.bars.length - 1, dur = this.stepDur;
    const [root] = B.chord;

    // drums
    const pat = DRUMS[sec.intro ? 'intro' : song.drums];
    const fill = lastBar && s >= 12 && !sec.intro && secKey !== song.order[(this.orderIdx + 1) % song.order.length];
    if (pat.k[s] === 'x' && !fill) this.kick(t);
    if (fill) this.snare(t, 0.5 + (s - 12) * 0.14);
    else if (pat.s[s] === 'x') this.snare(t, 1);
    if (sec.intro && lastBar && s >= 8 && s % 2 === 0) this.snare(t, 0.35 + (s - 8) * 0.08);
    if (pat.h[s] === 'x') this.hat(t, s % 4 === 2 ? 1 : 0.55);
    if (this.secStep === 0 && !sec.intro) this.crash(t);

    // triangle bass
    let bn = null, blen = 1.6;
    switch (song.bass) {
      case 'octave': if (s % 2 === 0) bn = root + ((s / 2) % 2 ? 12 : 0); break;          // 8ths, bouncing octaves
      case 'gallop': if ([0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15].includes(s)) { bn = root + (s % 4 === 0 ? 0 : 12); blen = 0.8; } break;
      case 'drive':  bn = root + [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 10, 12][s]; blen = 0.8; break;  // 16ths
    }
    if (bn !== null) this.tri(t, freq(bn), dur * blen, 0.5);

    // pulse arpeggio (12.5%): chord tones up two octaves, 16ths
    if (song.arp && !sec.intro) {
      const ch = B.chord, tone = ch[[0, 1, 2, 1][s % 4]] + 24 + (s >= 8 && secKey === 'B' ? 12 : 0);
      this.pulse(t, this.waves.p12, freq(tone), dur * 0.7, 0.035 * song.arp, false, false, null);
    }
    // pulse lead (25%) with echo send
    const n = B.lead.get(s);
    if (n && n.midi !== null) {
      const d = n.len * dur;
      this.pulse(t, this.waves.p25, freq(n.midi), d * 0.92, 0.13, n.vib || d > 0.35, n.scoop, this.echo);
      this.events.push({ t, kind: 'lead', midi: n.midi });
    }
    if (s % 4 === 0) this.events.push({ t, kind: 'beat', beat: this.secStep / 4, bar: s === 0 });
  }

  // ---------- voices ----------
  pulse(t, wave, f, d, vol, vib, scoop, send, dest = this.bus) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(wave);
    if (scoop) { o.frequency.setValueAtTime(f * 0.84, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
    else o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.linearRampToValueAtTime(vol * 0.72, t + Math.min(d, 0.15));
    g.gain.setValueAtTime(vol * 0.72, t + Math.max(0.005, d - 0.012));
    g.gain.linearRampToValueAtTime(0, t + d + 0.01);
    o.connect(g).connect(dest);
    if (send) g.connect(send);
    let lfo = null;
    if (vib) {
      lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 6.5;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.12);
      lg.gain.linearRampToValueAtTime(f * 0.014, t + 0.3);
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + d + 0.05);
    }
    o.start(t); o.stop(t + d + 0.05);
  }
  tri(t, f, d, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + d - 0.01); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + d + 0.02);
  }
  noiseHit(t, hp, d, vol, dest = this.bus, lp = 0) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    let node = src.connect(f);
    if (lp) { const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; node = node.connect(l); }
    node.connect(g).connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
  }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.85, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.16);
    this.events.push({ t, kind: 'kick' });
  }
  snare(t, v) {
    this.noiseHit(t, 1400, 0.13, 0.32 * v);
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.06);
    g.gain.setValueAtTime(0.3 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.08);
    this.events.push({ t, kind: 'snare' });
  }
  hat(t, v) { this.noiseHit(t, 7500, 0.035, 0.11 * v); }
  crash(t) { this.noiseHit(t, 3500, 0.7, 0.13); }

  // ---------- sound effects (on their own bus: survive the music stopping) ----------
  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005, p = (tt, f, d, v, w = this.waves.p50) => this.pulse(tt, w, f, d, v, false, false, null, this.sfxBus);
    switch (name) {
      case 'blip': p(t, 1320, 0.04, 0.08, this.waves.p25); break;
      case 'start': p(t, 988, 0.06, 0.1); p(t + 0.07, 1976, 0.1, 0.1); break;
      case 'pad': { const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.setPeriodicWave(this.waves.p25); o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
        g.gain.setValueAtTime(0.09, t); g.gain.linearRampToValueAtTime(0, t + 0.14);
        o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.15); break; }
      case 'portalUp': [523, 659, 784, 1047, 1319].forEach((f, i) => p(t + i * 0.035, f, 0.04, 0.07, this.waves.p12)); break;
      case 'portalDown': [1319, 1047, 784, 659, 523].forEach((f, i) => p(t + i * 0.035, f, 0.04, 0.07, this.waves.p12)); break;
      case 'ship': [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => p(t + i * 0.03, f, 0.035, 0.07, this.waves.p12)); break;
      case 'death': {
        this.noiseHit(t, 200, 0.45, 0.5, this.sfxBus, 3000);
        [880, 740, 587, 440, 330, 220].forEach((f, i) => p(t + 0.02 + i * 0.045, f, 0.05, 0.09, this.waves.p25));
        break;
      }
      case 'best': [784, 988, 1175, 1568].forEach((f, i) => p(t + i * 0.09, f, i === 3 ? 0.3 : 0.08, 0.1, this.waves.p25)); break;
    }
  }

  // Call once per frame: moves due events into `vis` for beat-reactive visuals.
  update() {
    if (!this.ctx) return this.vis;
    const now = this.ctx.currentTime, v = this.vis;
    while (this.events.length && this.events[0].t <= now) {
      const e = this.events.shift();
      if (e.kind === 'beat') { v.beatT = e.t; v.beat = e.beat; if (e.bar) v.barT = e.t; }
      else if (e.kind === 'kick') v.kickT = e.t;
      else if (e.kind === 'snare') v.snareT = e.t;
      else if (e.kind === 'lead') { v.leadT = e.t; v.leadMidi = e.midi; }
    }
    v.now = now;
    return v;
  }
  // 1 on the hit, decaying to 0 (rate per second)
  env(t, rate = 8) { if (!this.ctx || t < 0) return 0; return Math.exp(-(this.ctx.currentTime - t) * rate); }
}

export const SONG_TITLES = Object.fromEntries(Object.entries(SONGS).map(([k, s]) => [k, s.title]));
