import { ABILITIES } from '../game/content';
import type { AbilityDef, School } from '../game/types';
import type { ScheduledSound, Sound } from './cues';
import { makeNoise, music } from './synth';

// ---------------------------------------------------------------------------
// Sound effects, synthesised at runtime with Web Audio (see docs/adr/0002).
// Each school has a base timbre and each Ability varies it (pitch from its id,
// length and weight from its damage and shape); Techniques are physical.
// Recipes only schedule nodes, so they also run on an OfflineAudioContext.
// ---------------------------------------------------------------------------

const MAX_VOICES = 10;

interface Env {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  out: AudioNode;
  /** When the sound starts. */
  t: number;
  /** When the last of its nodes stops. */
  end: number;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** Frequency to glide to over the sound. */
  to?: number;
  dur: number;
  peak: number;
  /** Start delay in seconds. */
  at?: number;
  attack?: number;
  detune?: number;
}

/** A pitched blip with a fast attack and an exponential fade. */
function tone(e: Env, o: ToneOpts) {
  const t = e.t + (o.at ?? 0);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.peak, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  g.connect(e.out);
  const osc = e.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  osc.connect(g);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
  e.end = Math.max(e.end, t + o.dur + 0.02);
}

interface HissOpts {
  filter?: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  dur: number;
  peak: number;
  at?: number;
  attack?: number;
  /** Where in the noise buffer to start, so repeated hisses differ. */
  offset?: number;
}

/** Filtered noise: whooshes, crackles, scuffs. */
function hiss(e: Env, o: HissOpts) {
  const t = e.t + (o.at ?? 0);
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const filt = e.ctx.createBiquadFilter();
  filt.type = o.filter ?? 'bandpass';
  filt.frequency.setValueAtTime(o.f, t);
  if (o.to) filt.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  filt.Q.value = o.q ?? 0.8;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.peak, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(e.out);
  src.start(t, o.offset ?? 0);
  src.stop(t + o.dur + 0.02);
  e.end = Math.max(e.end, t + o.dur + 0.02);
}

/** A struck-metal ring: inharmonic partials that fade at different rates. */
function ring(e: Env, f: number, dur: number, peak: number, at = 0) {
  [1, 2.76, 5.4].forEach((r, i) => tone(e, { f: f * r, dur: dur / (1 + i * 0.7), peak: peak / (1 + i), at }));
}

// --- Attacks ---------------------------------------------------------------

/** Base pitch of each school, used for launch cues. */
const SCHOOL_PITCH: Record<School, number> = {
  fire: 300,
  frost: 900,
  arcane: 520,
  nature: 340,
  tide: 240,
  death: 180,
  earth: 130,
  time: 800,
  steel: 600,
};

const pitchOf = (def: AbilityDef) => 2 ** (((hash(def.id) % 13) - 6) / 24); // ±3 semitones
const attackOf = (def: AbilityDef) => (def.effect.type === 'attack' ? def.effect : null);

/** The full sound of an Attack landing. Bigger damage means longer and heavier. */
function resolveAttack(e: Env, def: AbilityDef) {
  const fx = attackOf(def)!;
  const pitch = pitchOf(def);
  const h = hash(def.id);
  const power = Math.min(1, 0.35 + fx.hit.damage / 12);
  if (def.kind === 'technique') return technique(e, def, pitch, power);
  const dur = 0.28 + 0.4 * power;

  switch (def.school) {
    case 'fire':
      hiss(e, { f: 500 * pitch, to: 2200 * pitch, q: 0.9, dur, peak: 0.3, attack: 0.03 });
      for (let i = 0; i < 4; i++)
        hiss(e, { filter: 'highpass', f: 3500, dur: 0.025, peak: 0.22, at: 0.04 + i * 0.07 + ((h >> i) & 3) * 0.01, offset: 0.1 * i });
      tone(e, { type: 'triangle', f: 140 * pitch, to: 70, dur, peak: 0.22 });
      break;
    case 'frost':
      tone(e, { f: 2300 * pitch, to: 1800 * pitch, dur: 0.35 + 0.2 * power, peak: 0.18 });
      tone(e, { f: 3450 * pitch, dur: 0.3, peak: 0.12 });
      tone(e, { f: 600 * pitch, to: 300, dur: 0.2, peak: 0.1 });
      hiss(e, { filter: 'highpass', f: 6000, dur: 0.06, peak: 0.12 });
      break;
    case 'arcane':
      tone(e, { type: 'sawtooth', f: 320 * pitch, to: 960 * pitch, dur: dur * 0.8, peak: 0.13 });
      tone(e, { f: 640 * pitch, to: 1900 * pitch, dur: dur * 0.8, peak: 0.12 });
      hiss(e, { f: 2500, dur: 0.08, peak: 0.08 });
      break;
    case 'nature':
      hiss(e, { f: 1100 * pitch, to: 600, q: 2.2, dur, peak: 0.22, attack: 0.08 });
      tone(e, { type: 'triangle', f: 220 * pitch, to: 330 * pitch, dur: 0.35, peak: 0.12 });
      break;
    case 'tide':
      hiss(e, { filter: 'lowpass', f: 300, to: 1400, dur: dur * 0.5, peak: 0.26, attack: dur * 0.4 });
      hiss(e, { filter: 'lowpass', f: 1400, to: 250, dur: dur * 0.6, peak: 0.2, at: dur * 0.45 });
      tone(e, { f: 160 * pitch, to: 90, dur, peak: 0.14 });
      break;
    case 'death':
      for (const detune of [-14, 14]) tone(e, { type: 'sawtooth', f: 95 * pitch, to: 55, dur, peak: 0.16, detune });
      hiss(e, { f: 420, q: 3, dur, peak: 0.12 });
      tone(e, { f: 880 * pitch, to: 440, dur: 0.3, peak: 0.05 });
      break;
    case 'earth':
      tone(e, { f: 95 * pitch, to: 36, dur: 0.4, peak: 0.45 });
      hiss(e, { filter: 'lowpass', f: 220, dur: dur * 1.3, peak: 0.3, attack: 0.02 });
      break;
    case 'time':
      [1320, 990, 660].forEach((f, i) => tone(e, { f: f * pitch, dur: 0.07, peak: 0.12, at: i * 0.09 }));
      tone(e, { f: 1800, to: 200, dur: 0.45, peak: 0.08 });
      break;
    case 'steel':
      ring(e, 560 * pitch, 0.5, 0.16);
      hiss(e, { filter: 'highpass', f: 3000, dur: 0.06, peak: 0.15 });
      break;
  }

  // What the shape adds: a zip down a Line, a crack on one hex, a boom for blasts.
  const shape = fx.shape.kind;
  if (shape === 'line') hiss(e, { f: 3500, to: 700, q: 1.2, dur: 0.16, peak: 0.2 });
  else if (shape === 'single') {
    hiss(e, { filter: 'highpass', f: 4000, dur: 0.04, peak: 0.22 });
    tone(e, { f: 300, to: 120, dur: 0.1, peak: 0.2 });
  } else if (shape === 'burst' || shape === 'explosiveLine' || shape === 'selfBurst') {
    const big = shape === 'selfBurst' ? 1.3 : 1;
    tone(e, { f: 110 * pitch, to: 40, dur: (0.28 + 0.2 * power) * big, peak: (0.25 + 0.2 * power) * big });
    hiss(e, { filter: 'lowpass', f: 600, dur: 0.3 * big, peak: 0.15 * power });
  } else if (shape === 'cone' || shape === 'fan') hiss(e, { f: 900, to: 300, q: 0.5, dur: 0.3, peak: 0.18 });
  else if (shape === 'wall') {
    hiss(e, { filter: 'lowpass', f: 180, dur: 0.6, peak: 0.25 });
    tone(e, { f: 60, to: 35, dur: 0.5, peak: 0.3 });
  } else if (shape === 'meleeArc') hiss(e, { f: 1600, to: 500, dur: 0.1, peak: 0.2 });
}

/** Techniques are physical: a swish, a thud, a ring. */
function technique(e: Env, def: AbilityDef, pitch: number, power: number) {
  if (def.id === 'spear-thrust') {
    hiss(e, { f: 2600, to: 1200, dur: 0.09, peak: 0.2 });
    ring(e, 900, 0.25, 0.1, 0.08);
    tone(e, { f: 140, to: 90, dur: 0.1, peak: 0.2, at: 0.08 });
  } else if (def.id === 'shield-bash') {
    tone(e, { f: 85, to: 40, dur: 0.3, peak: 0.5, at: 0.02 });
    ring(e, 420, 0.45, 0.18, 0.02);
    hiss(e, { filter: 'lowpass', f: 700, dur: 0.1, peak: 0.3 });
  } else {
    hiss(e, { f: 1800, to: 700, dur: 0.08, peak: 0.18 });
    tone(e, { type: 'triangle', f: 210 * pitch, to: 110, dur: 0.12 + 0.05 * power, peak: 0.35, at: 0.06 });
    hiss(e, { filter: 'lowpass', f: 900, dur: 0.05, peak: 0.2, at: 0.06 });
  }
}

/** A quiet cue when an Attack is launched; the full sound waits for Resolution. */
function launchAttack(e: Env, def: AbilityDef) {
  if (def.kind === 'technique') return hiss(e, { f: 1500, to: 900, dur: 0.05, peak: 0.08 });
  const f = SCHOOL_PITCH[def.school] * pitchOf(def);
  tone(e, { type: 'triangle', f, to: f * 1.5, dur: 0.09, peak: 0.12 });
  hiss(e, { filter: 'highpass', f: 4000, dur: 0.02, peak: 0.05 });
}

// --- Instant Spells and Reactions -----------------------------------------

function castAbility(e: Env, def: AbilityDef) {
  switch (def.effect.type) {
    case 'heal':
      tone(e, { f: 660, dur: 0.35, peak: 0.2 });
      tone(e, { f: 990, dur: 0.45, peak: 0.18, at: 0.08 });
      tone(e, { f: 1980, dur: 0.3, peak: 0.05, at: 0.08 });
      hiss(e, { filter: 'highpass', f: 7000, dur: 0.08, peak: 0.05, at: 0.08 });
      break;
    case 'shield':
      tone(e, { type: 'triangle', f: 330, dur: 0.55, attack: 0.08, peak: 0.16 });
      tone(e, { type: 'triangle', f: 331.5, dur: 0.55, attack: 0.08, peak: 0.16 });
      tone(e, { f: 660, dur: 0.5, attack: 0.1, peak: 0.1 });
      hiss(e, { filter: 'highpass', f: 6000, dur: 0.3, attack: 0.1, peak: 0.06 });
      break;
    case 'blink':
      hiss(e, { f: 500, to: 4000, q: 1.5, dur: 0.09, peak: 0.22 });
      tone(e, { f: 1100, to: 180, dur: 0.12, peak: 0.3, at: 0.09 });
      hiss(e, { filter: 'highpass', f: 5000, dur: 0.04, peak: 0.12, at: 0.09 });
      break;
    case 'step':
      hiss(e, { filter: 'lowpass', f: 1400, dur: 0.05, peak: 0.25 });
      if (def.id === 'dodge-roll') {
        hiss(e, { filter: 'lowpass', f: 1400, dur: 0.05, peak: 0.22, at: 0.09, offset: 0.2 });
        hiss(e, { f: 600, to: 1500, dur: 0.18, peak: 0.12, at: 0.04 });
      }
      break;
    case 'block':
      tone(e, { f: 90, to: 50, dur: 0.15, peak: 0.35 });
      ring(e, 700, 0.3, 0.15, 0.01);
      break;
    case 'empower':
      tone(e, { type: 'sawtooth', f: 180, to: 540, dur: 0.3, attack: 0.1, peak: 0.1 });
      tone(e, { f: 360, to: 1080, dur: 0.3, peak: 0.1 });
      tone(e, { f: 1760, dur: 0.12, peak: 0.1, at: 0.25 });
      tone(e, { f: 2640, dur: 0.12, peak: 0.08, at: 0.3 });
      break;
    case 'pillar':
      tone(e, { f: 75, to: 32, dur: 0.35, peak: 0.5 });
      hiss(e, { f: 450, q: 1.5, dur: 0.3, peak: 0.22, at: 0.03 });
      hiss(e, { filter: 'lowpass', f: 300, dur: 0.25, peak: 0.2 });
      break;
    case 'counter':
      tone(e, { type: 'square', f: 1000, to: 180, dur: 0.16, peak: 0.12 });
      hiss(e, { filter: 'highpass', f: 3500, dur: 0.03, peak: 0.2, at: 0.15 });
      break;
    case 'deflect':
      ring(e, 760, 0.35, 0.17);
      hiss(e, { f: 3000, to: 900, dur: 0.12, peak: 0.15, at: 0.02 });
      tone(e, { f: 1400, to: 700, dur: 0.15, peak: 0.08, at: 0.1 });
      break;
    case 'haste':
      [523, 659, 784].forEach((f, i) => tone(e, { type: 'triangle', f, dur: 0.09, peak: 0.16, at: i * 0.055 }));
      hiss(e, { filter: 'highpass', f: 6000, dur: 0.12, peak: 0.06 });
      break;
    default:
      launchAttack(e, def);
  }
}

// --- Everything else --------------------------------------------------------

let stepFlip = false;

function gameSound(e: Env, s: Exclude<Sound, { abilityId: string }>) {
  switch (s.id) {
    case 'damage': {
      const k = Math.min(1, s.amount / 10);
      tone(e, { f: 170 - 60 * k, to: 60, dur: 0.12 + 0.1 * k, peak: 0.35 + 0.25 * k });
      hiss(e, { f: 1800, to: 600, dur: 0.07, peak: 0.25 + 0.15 * k });
      hiss(e, { filter: 'lowpass', f: 500, dur: 0.1, peak: 0.2 });
      if (k > 0.6) tone(e, { type: 'sawtooth', f: 90, to: 45, dur: 0.2, peak: 0.15 });
      break;
    }
    case 'absorbed':
      tone(e, { f: 520, to: 480, dur: 0.12, peak: 0.16 });
      tone(e, { f: 1040, dur: 0.09, peak: 0.06 });
      hiss(e, { filter: 'highpass', f: 3500, dur: 0.03, peak: 0.08 });
      break;
    case 'step':
      stepFlip = !stepFlip;
      hiss(e, { filter: 'lowpass', f: stepFlip ? 800 : 950, q: 0.7, dur: 0.04, peak: 0.16, offset: stepFlip ? 0.1 : 0.3 });
      break;
    case 'crystalAbsorb': {
      const big = s.size === 'large';
      const f = big ? 360 : 520;
      tone(e, { f, to: f * 2, dur: big ? 0.55 : 0.35, attack: 0.02, peak: 0.2 });
      tone(e, { f: f * 1.5, to: f * 3, dur: big ? 0.55 : 0.35, peak: 0.1 });
      hiss(e, { filter: 'highpass', f: 8000, dur: 0.25, attack: 0.1, peak: 0.05 });
      if (big) tone(e, { f: 130, to: 260, dur: 0.5, peak: 0.2 });
      break;
    }
    case 'crystalReady':
      tone(e, { f: 880, dur: 0.6, peak: 0.14 });
      tone(e, { f: 1318, dur: 0.5, peak: 0.08 });
      tone(e, { f: 2217, dur: 0.35, peak: 0.03 });
      break;
    case 'actionStart':
      tone(e, { f: 660, dur: 0.09, peak: 0.1 });
      break;
    case 'reactionStart':
      tone(e, { type: 'triangle', f: 784, dur: 0.09, peak: 0.2 });
      tone(e, { f: 1568, dur: 0.09, peak: 0.06 });
      tone(e, { type: 'triangle', f: 988, dur: 0.14, peak: 0.22, at: 0.11 });
      tone(e, { f: 1976, dur: 0.14, peak: 0.06, at: 0.11 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => {
        const dur = i === 3 ? 0.8 : 0.25;
        tone(e, { type: 'triangle', f, dur, peak: 0.2, at: i * 0.13 });
        tone(e, { f: f * 2, dur, peak: 0.06, at: i * 0.13 });
      });
      break;
    case 'lose':
      [440, 349, 294].forEach((f, i) => {
        tone(e, { type: 'triangle', f, dur: 0.5, peak: 0.18, at: i * 0.22 });
        tone(e, { f: f / 2, dur: 0.5, peak: 0.08, at: i * 0.22 });
      });
      tone(e, { f: 147, dur: 0.8, peak: 0.16, at: 0.66 });
      break;
    case 'fanfare':
      [523, 784, 1047].forEach((f, i) => {
        const dur = i === 2 ? 0.7 : 0.3;
        tone(e, { type: 'triangle', f, dur, peak: 0.2, at: i * 0.18 });
        tone(e, { f: f * 2, dur, peak: 0.06, at: i * 0.18 });
      });
      break;
    case 'click':
      hiss(e, { filter: 'highpass', f: 3000, dur: 0.018, peak: 0.12 });
      tone(e, { f: 1400, to: 900, dur: 0.02, peak: 0.06 });
      break;
    case 'confirm':
      tone(e, { f: 880, dur: 0.05, peak: 0.12 });
      tone(e, { f: 1320, dur: 0.08, peak: 0.12, at: 0.045 });
      break;
    case 'select':
      tone(e, { f: 1000, dur: 0.045, peak: 0.1 });
      hiss(e, { filter: 'highpass', f: 5000, dur: 0.015, peak: 0.04 });
      break;
  }
}

/**
 * Schedules one sound to start at time `t` on any audio context, and returns when it ends.
 * An Ability with no recipe of its own falls back to a quiet school cue, so nothing is ever silent.
 */
export function renderSound(ctx: BaseAudioContext, noise: AudioBuffer, out: AudioNode, t: number, sound: Sound): number {
  const e: Env = { ctx, noise, out, t, end: t };
  if ('abilityId' in sound) {
    const def = ABILITIES[sound.abilityId];
    if (!def) return t;
    if (sound.id === 'cast') castAbility(e, def);
    else if (sound.id === 'launch') launchAttack(e, def);
    else if (attackOf(def)) resolveAttack(e, def);
    else castAbility(e, def);
  } else gameSound(e, sound);
  return e.end;
}

// --- Playback ----------------------------------------------------------------

interface Voice {
  start: number;
  end: number;
  gain: GainNode;
}

/** Plays sound effects through the music player's audio context (so one user gesture unlocks both). */
export class SfxPlayer {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private volume = 0.7;
  private muted = false;

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyLevel();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevel();
  }

  private applyLevel() {
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }

  /** Builds the effects chain once the music player's context exists (after a user gesture). */
  private ensure(): AudioContext | null {
    const ctx = music.context();
    if (!ctx) return null;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.connect(ctx.destination);
      this.bus = ctx.createGain();
      this.bus.connect(comp);
      this.noise = makeNoise(ctx);
      this.voices = [];
      this.applyLevel();
    }
    return ctx;
  }

  /** Plays one sound `delay` seconds from now, panned from -1 (left) to 1 (right). */
  play(sound: Sound, delay = 0, pan = 0) {
    if (this.muted || this.volume === 0) return;
    const ctx = this.ensure();
    if (!ctx || !this.bus || !this.noise) return;
    const now = ctx.currentTime;
    const t = now + 0.005 + delay;

    // At most MAX_VOICES at once: the oldest one still sounding is cut off.
    this.voices = this.voices.filter((v) => v.end > now);
    const sounding = this.voices.filter((v) => v.start <= t && v.end > t);
    if (sounding.length >= MAX_VOICES) {
      const oldest = sounding.reduce((a, b) => (a.start <= b.start ? a : b));
      oldest.gain.gain.setTargetAtTime(0, t, 0.01);
      oldest.end = t;
    }

    const gain = ctx.createGain();
    if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(p);
      p.connect(this.bus);
    } else gain.connect(this.bus);

    const end = renderSound(ctx, this.noise, gain, t, sound);
    this.voices.push({ start: t, end, gain });
    // The result stings sit on top of the music, which dips under them.
    if (sound.id === 'win' || sound.id === 'lose' || sound.id === 'fanfare') music.duck(0.25, 2.2);
  }

  playAll(plan: ScheduledSound[]) {
    for (const s of plan) this.play(s.sound, s.delay, s.pan);
  }
}

export const sfx = new SfxPlayer();
