// ---------------------------------------------------------------------------
// Original music for Magica, written as note data (MIDI-style) and played by
// the tiny Web Audio synth in synth.ts. Pure data + helpers, no audio here.
// ---------------------------------------------------------------------------

export type Instrument = 'lead' | 'flute' | 'pluck' | 'bass' | 'pad' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  /** Start, in steps from the beginning of the loop. */
  step: number;
  /** Length in steps. */
  length: number;
  /** MIDI note number (drums ignore it). */
  midi: number;
  velocity: number;
}

export interface Part {
  instrument: Instrument;
  notes: NoteEvent[];
  /** Mix level, 0–1. */
  gain: number;
}

export interface Track {
  id: 'combat' | 'menu';
  title: string;
  bpm: number;
  /** Steps per beat: 4 = sixteenth notes, 2 = eighths. */
  stepsPerBeat: number;
  /** Loop length in steps. */
  length: number;
  parts: Part[];
}

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' → 69, 'C#5' → 73, 'Bb3' → 58. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name "${name}"`);
  const [, letter, accidental, octave] = m;
  return 12 * (Number(octave) + 1) + NOTE_INDEX[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

export const frequency = (midiNote: number) => 440 * 2 ** ((midiNote - 69) / 12);

/**
 * Parse a melody written as space-separated `NOTE:steps` tokens, e.g.
 * "E5:2 A5:2 r:4". `r` is a rest. Returns events laid end to end from `start`.
 */
export function melody(text: string, start = 0, velocity = 0.8): { notes: NoteEvent[]; length: number } {
  const notes: NoteEvent[] = [];
  let step = start;
  for (const token of text.trim().split(/\s+/)) {
    const [name, len] = token.split(':');
    const length = Number(len);
    if (!Number.isInteger(length) || length <= 0) throw new Error(`Bad duration in "${token}"`);
    if (name !== 'r') notes.push({ step, length, midi: midi(name), velocity });
    step += length;
  }
  return { notes, length: step - start };
}

type Chord = string[]; // note names, root first, e.g. ['A3', 'C4', 'E4']

/** Repeat an index pattern over each bar's chord tones (plus the octave above the root). */
function arpeggio(chords: Chord[], pattern: number[], stepLength: number, octaveShift: number, velocity: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  chords.forEach((chord, bar) => {
    const tones = [...chord.map(midi), midi(chord[0]) + 12].map((n) => n + 12 * octaveShift);
    pattern.forEach((idx, i) => {
      out.push({ step: (bar * pattern.length + i) * stepLength, length: stepLength, midi: tones[idx], velocity });
    });
  });
  return out;
}

/** One drum hit per listed step, repeated every `barSteps` for `bars` bars. */
function drum(steps: number[], barSteps: number, bars: number, velocity: number, accent: number[] = []): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let b = 0; b < bars; b++)
    for (const s of steps) out.push({ step: b * barSteps + s, length: 1, midi: 0, velocity: accent.includes(s) ? 1 : velocity });
  return out;
}

// --- Combat: "Clash of Circles" ---------------------------------------------
// A minor, 168 BPM, sixteenth-note grid, 8 bars: Am F G Em | Am F G E.

const COMBAT_CHORDS: Chord[] = [
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
  ['G3', 'B3', 'D4'],
  ['E3', 'G3', 'B3'],
  ['A3', 'C4', 'E4'],
  ['F3', 'A3', 'C4'],
  ['G3', 'B3', 'D4'],
  ['E3', 'G#3', 'B3'],
];

const COMBAT_LEAD = melody(
  [
    'E5:2 A5:2 B5:2 C6:4 B5:2 A5:2 E5:2', // Am
    'F5:4 A5:2 C6:2 A5:4 F5:4', // F
    'G5:2 B5:2 D6:4 C6:2 B5:2 A5:2 G5:2', // G
    'E5:6 G5:2 B5:4 E6:4', // Em
    'A5:2 C6:2 E6:4 D6:2 C6:2 B5:2 A5:2', // Am
    'C6:4 A5:2 F5:2 A5:4 C6:4', // F
    'D6:2 C6:2 B5:2 G5:2 B5:2 C6:2 D6:4', // G
    'E6:4 D6:2 C6:2 B5:4 G#5:4', // E
  ].join(' '),
  0,
  0.75,
);

const combatBass: NoteEvent[] = COMBAT_CHORDS.flatMap((chord, bar) => {
  const root = midi(chord[0]) - 12;
  // Driving eighths with octave jumps: R R R' R  R R' R 5
  const pattern = [0, 0, 12, 0, 0, 12, 0, 7];
  return pattern.map((offset, i) => ({ step: bar * 16 + i * 2, length: 2, midi: root + offset, velocity: i % 2 ? 0.7 : 0.95 }));
});

export const COMBAT: Track = {
  id: 'combat',
  title: 'Clash of Circles',
  bpm: 168,
  stepsPerBeat: 4,
  length: 8 * 16,
  parts: [
    { instrument: 'lead', notes: COMBAT_LEAD.notes, gain: 0.32 },
    { instrument: 'pluck', notes: arpeggio(COMBAT_CHORDS, [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 2, 1], 1, 1, 0.55), gain: 0.22 },
    { instrument: 'bass', notes: combatBass, gain: 0.42 },
    { instrument: 'kick', notes: drum([0, 4, 8, 12, 14], 16, 8, 0.9), gain: 0.7 },
    { instrument: 'snare', notes: drum([4, 12], 16, 8, 0.8), gain: 0.35 },
    { instrument: 'hat', notes: drum([0, 2, 4, 6, 8, 10, 12, 14, 15], 16, 8, 0.45, [2, 6, 10, 14]), gain: 0.18 },
  ],
};

// --- Menu: "The Quiet Tower" ------------------------------------------------
// D Dorian, 76 BPM, eighth-note grid, 8 bars: Dm C Bb C | Dm C Bb A.

const MENU_CHORDS: Chord[] = [
  ['D3', 'F3', 'A3'],
  ['C3', 'E3', 'G3'],
  ['Bb2', 'D3', 'F3'],
  ['C3', 'E3', 'G3'],
  ['D3', 'F3', 'A3'],
  ['C3', 'E3', 'G3'],
  ['Bb2', 'D3', 'F3'],
  ['A2', 'C#3', 'E3'],
];

const MENU_FLUTE = melody(
  [
    'A4:3 D5:1 E5:2 F5:2', // Dm
    'E5:4 G5:2 E5:2', // C
    'D5:3 F5:1 D5:2 C5:2', // Bb
    'D5:6 r:2', // C
    'A5:3 G5:1 F5:2 E5:2', // Dm
    'G5:4 E5:2 C5:2', // C
    'D5:2 F5:2 E5:2 D5:2', // Bb
    'C#5:6 r:2', // A
  ].join(' '),
  0,
  0.7,
);

export const MENU: Track = {
  id: 'menu',
  title: 'The Quiet Tower',
  bpm: 76,
  stepsPerBeat: 2,
  length: 8 * 8,
  parts: [
    { instrument: 'flute', notes: MENU_FLUTE.notes, gain: 0.3 },
    { instrument: 'pluck', notes: arpeggio(MENU_CHORDS, [0, 1, 2, 3, 2, 1, 2, 1], 1, 1, 0.5), gain: 0.2 },
    {
      instrument: 'pad',
      notes: MENU_CHORDS.flatMap((chord, bar) =>
        chord.map((n) => ({ step: bar * 8, length: 8, midi: midi(n) + 12, velocity: 0.5 })),
      ),
      gain: 0.12,
    },
    {
      instrument: 'bass',
      notes: MENU_CHORDS.map((chord, bar) => ({ step: bar * 8, length: 8, midi: midi(chord[0]) - 12, velocity: 0.6 })),
      gain: 0.25,
    },
  ],
};

export const TRACKS = { combat: COMBAT, menu: MENU } as const;
export type TrackId = keyof typeof TRACKS;
