// songs.mjs — original chiptune soundtrack, written in the spirit of 8-bit Capcom stage
// themes: minor-key hooks on a pulse lead, octave-bouncing triangle bass, 16th-note
// pulse arpeggios, noise-channel drums. All melodies are original.
//
// Lead lines are tokens "NOTE:steps" (16th-note steps, 16 per bar). "r" = rest.
// A trailing "~" forces vibrato; a leading "/" scoops up into the note.
// Chords are one per bar; the bass and arpeggio channels are generated from them.
// test/music.test.mjs checks every bar sums to exactly 16 steps.

export const SONGS = {
  menu: {
    title: 'STAGE SELECT', bpm: 140, bass: 'octave', drums: 'rock', arp: 0.7,
    sections: {
      A: {
        chords: ['C3 Eb3 G3', 'Ab2 C3 Eb3', 'Bb2 D3 F3', 'G2 B2 D3'],
        lead: [
          'G5:4 Eb5:2 G5:2 C6:6 Bb5:2',
          'Ab5:4 C6:4 Eb6:6 D6:2',
          'D6:4 Bb5:2 F5:2 Bb5:4 C6:2 D6:2',
          'B5:8~ G5:4 D5:4',
        ],
      },
      B: {
        chords: ['F2 Ab2 C3', 'G2 B2 D3', 'Ab2 C3 Eb3', 'G2 B2 D3'],
        lead: [
          'C6:2 Ab5:2 F5:2 Ab5:2 C6:4 F6:4',
          'D6:2 B5:2 G5:2 B5:2 D6:4 G6:4',
          'Eb6:3 D6:3 C6:2 Ab5:4 C6:4',
          'B5:2 C6:2 D6:2 F6:2 G6:8~',
        ],
      },
    },
    order: ['A', 'A', 'B'], loop: 0,
  },

  normal: {
    title: 'NEON SPRINT', bpm: 156, bass: 'octave', drums: 'rock', arp: 1,
    sections: {
      I: { chords: ['E2 G2 B2', 'C3 E3 G3'], lead: null, intro: true },
      A: {
        chords: ['E2 G2 B2', 'C3 E3 G3', 'D3 F#3 A3', 'B2 D#3 F#3'],
        lead: [
          'E5:2 G5:2 B5:3 A5:1 G5:2 F#5:2 G5:2 E5:2',
          'C6:3 B5:1 A5:2 G5:2 E5:4 G5:2 A5:2',
          'D5:2 F#5:2 A5:2 D6:2 C6:2 B5:2 A5:2 F#5:2',
          'B5:6~ A5:2 G5:2 F#5:2 D#5:4',
        ],
      },
      B: {
        chords: ['C3 E3 G3', 'D3 F#3 A3', 'E2 G2 B2', 'B2 D#3 F#3'],
        lead: [
          'G5:2 G5:1 G5:1 E5:2 G5:2 /C6:4 B5:2 A5:2',
          'A5:2 A5:1 A5:1 F#5:2 A5:2 /D6:4 C6:2 B5:2',
          'B5:3 G5:3 E5:2 B5:3 C6:3 D6:2',
          'E6:2 D#6:6~ B5:4 F#5:4',
        ],
      },
      C: {
        chords: ['A2 C3 E3', 'B2 D#3 F#3', 'C3 E3 G3', 'D3 F#3 A3'],
        lead: [
          'A5:1 r:1 A5:1 r:1 C6:1 r:1 E6:2 D6:2 C6:2 A5:4',
          'B5:1 r:1 B5:1 r:1 D#6:1 r:1 F#6:2 E6:2 D#6:2 B5:4',
          'C6:1 r:1 C6:1 r:1 E6:1 r:1 G6:2 F#6:2 E6:2 C6:4',
          'D6:4 F#6:4 A6:4 B6:4',
        ],
      },
    },
    order: ['I', 'A', 'A', 'B', 'C', 'A', 'B'], loop: 1,
  },

  hard: {
    title: 'SPIKE FACTORY', bpm: 168, bass: 'gallop', drums: 'four', arp: 1,
    sections: {
      I: { chords: ['A2 C3 E3', 'A2 C3 E3'], lead: null, intro: true },
      A: {
        chords: ['A2 C3 E3', 'F2 A2 C3', 'G2 B2 D3', 'E2 G#2 B2'],
        lead: [
          'A5:1 r:1 A5:1 r:1 C6:2 A5:2 E6:3 D6:1 C6:2 B5:2',
          'C6:2 A5:2 F5:2 A5:2 C6:3 D6:3 C6:2',
          'B5:2 G5:2 D5:2 G5:2 B5:3 D6:3 B5:2',
          'G#5:4 B5:4 E6:6~ D6:1 C6:1',
        ],
      },
      B: {
        chords: ['F2 A2 C3', 'G2 B2 D3', 'A2 C3 E3', 'E2 G#2 B2'],
        lead: [
          'A5:3 C6:3 F6:2 E6:2 C6:2 A5:4',
          'B5:3 D6:3 G6:2 F6:2 D6:2 B5:4',
          'C6:2 E6:2 /A6:4 G6:2 E6:2 C6:2 E6:2',
          'B5:2 G#5:2 E5:2 G#5:2 B5:2 E6:2 G#6:4~',
        ],
      },
      C: {
        chords: ['D3 F3 A3', 'D3 F3 A3', 'E2 G#2 B2', 'E2 G#2 B2'],
        lead: [
          'D6:2 A5:2 F5:2 A5:2 D6:2 E6:2 F6:4',
          'E6:2 D6:2 A5:2 F5:2 D5:4 F5:2 A5:2',
          'G#5:2 B5:2 E6:2 G#6:2 B6:4~ A6:2 G#6:2',
          'E6:1 F6:1 E6:1 D#6:1 E6:4 B5:4 G#5:4',
        ],
      },
    },
    order: ['I', 'A', 'A', 'B', 'C', 'A', 'B'], loop: 1,
  },

  expert: {
    title: 'GRAVITY MAN', bpm: 176, bass: 'drive', drums: 'break', arp: 1,
    sections: {
      I: { chords: ['D3 F3 A3', 'D3 F3 A3'], lead: null, intro: true },
      A: {
        chords: ['D3 F3 A3', 'Bb2 D3 F3', 'C3 E3 G3', 'A2 C#3 E3'],
        lead: [
          'D5:2 F5:2 A5:2 /D6:4 C6:2 A5:2 F5:2',
          'Bb5:3 A5:3 F5:2 D5:2 F5:2 Bb5:2 D6:2',
          'E6:3 C6:3 G5:2 C6:2 E6:2 G6:4',
          'E6:2 C#6:2 A5:2 E5:2 C#6:6~ r:2',
        ],
      },
      B: {
        chords: ['Bb2 D3 F3', 'C3 E3 G3', 'D3 F3 A3', 'A2 C#3 E3'],
        lead: [
          'D6:1 D6:1 r:2 D6:2 C6:2 Bb5:2 C6:2 D6:4',
          'E6:1 E6:1 r:2 E6:2 D6:2 C6:2 D6:2 E6:4',
          'F6:4 E6:2 D6:2 A5:4 D6:4',
          'C#6:4 E6:4 /A6:6~ G6:1 E6:1',
        ],
      },
      C: {
        chords: ['G2 Bb2 D3', 'A2 C#3 E3', 'G2 Bb2 D3', 'A2 C#3 E3'],
        lead: [
          'G5:1 Bb5:1 D6:1 G6:1 D6:1 Bb5:1 G5:2 A5:2 Bb5:2 D6:4',
          'A5:1 C#6:1 E6:1 A6:1 E6:1 C#6:1 A5:2 B5:2 C#6:2 E6:4',
          'G5:1 Bb5:1 D6:1 G6:1 D6:1 Bb5:1 G5:2 A5:2 Bb5:2 G6:4',
          'A6:4 G6:2 F6:2 E6:2 C#6:2 A5:4',
        ],
      },
    },
    order: ['I', 'A', 'A', 'B', 'C', 'A', 'B'], loop: 1,
  },
};

export const SONG_FOR_DIFF = ['normal', 'hard', 'expert'];

// 16-step drum grids: k = kick, s = snare, h = closed hat
export const DRUMS = {
  rock:  { k: 'x.......x.x.....', s: '....x.......x...', h: '..x...x...x...x.' },
  four:  { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
  break: { k: 'x..x..x...x..x..', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
  intro: { k: 'x.......x.......', s: '................', h: '..x...x...x...x.' },
};

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
               G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function midi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[2]) + 1) + NOTE[m[1]];
}
export const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// "E5:2 r:1 /C6:4~" -> [{step, len, midi|null, vib, scoop}]
export function parseBar(line) {
  const out = []; let step = 0;
  for (const tok of line.trim().split(/\s+/)) {
    const m = /^(\/?)([A-Gr][#b]?-?\d?)(?::(\d+))(~?)$/.exec(tok);
    if (!m) throw new Error(`bad token ${tok}`);
    const len = Number(m[3]);
    out.push({ step, len, midi: m[2] === 'r' ? null : midi(m[2]), vib: m[4] === '~', scoop: m[1] === '/' });
    step += len;
  }
  return { notes: out, steps: step };
}

// Flatten a song into a lookup: for each section, per-bar parsed lead + chord midi.
export function compile(song) {
  const sections = {};
  for (const [key, sec] of Object.entries(song.sections)) {
    const bars = sec.chords.map((ch, i) => {
      const chord = ch.split(' ').map(midi);
      const lead = sec.lead ? parseBar(sec.lead[i]) : null;
      if (lead && lead.steps !== 16) throw new Error(`${song.title} ${key} bar ${i + 1}: ${lead.steps} steps`);
      const byStep = new Map();
      if (lead) for (const n of lead.notes) byStep.set(n.step, n);
      return { chord, lead: byStep };
    });
    sections[key] = { bars, intro: !!sec.intro };
  }
  return { ...song, compiled: sections };
}
