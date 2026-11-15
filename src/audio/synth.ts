import { frequency, TRACKS, type Instrument, type NoteEvent, type Part, type Track, type TrackId } from './score';

// ---------------------------------------------------------------------------
// A tiny Web Audio synth + step sequencer. Plays the note data in score.ts
// with simple oscillator instruments (a General-MIDI-ish palette), loops it,
// and crossfades between tracks.
// ---------------------------------------------------------------------------

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const FADE_S = 0.9;

interface Playing {
  track: Track;
  bus: GainNode;
  byStep: Map<number, Array<{ part: Part; note: NoteEvent }>>;
  nextStep: number;
  nextTime: number;
  timer: ReturnType<typeof setInterval>;
}

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private playing: Playing | null = null;
  private wanted: TrackId | null = null;
  private muted = false;
  private volume = 0.55;

  /** Must be called from a user gesture (browser autoplay rules). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(comp);
      this.noise = makeNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wanted && this.playing?.track.id !== this.wanted) this.start(this.wanted);
  }

  /** Switch to a track (crossfading). Before unlock, remembers the request for later. */
  play(id: TrackId) {
    this.wanted = id;
    if (!this.ctx || this.playing?.track.id === id) return;
    this.start(id);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyLevel();
  }

  /** Music volume, 0–1. */
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyLevel();
  }

  private applyLevel() {
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private start(id: TrackId) {
    const ctx = this.ctx!;
    if (this.playing) {
      const old = this.playing;
      clearInterval(old.timer);
      old.bus.gain.setTargetAtTime(0, ctx.currentTime, FADE_S / 4);
      setTimeout(() => old.bus.disconnect(), FADE_S * 2000);
    }
    const track = TRACKS[id];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_S);
    bus.connect(this.master!);
    const byStep = new Map<number, Array<{ part: Part; note: NoteEvent }>>();
    for (const part of track.parts)
      for (const note of part.notes) byStep.set(note.step, [...(byStep.get(note.step) ?? []), { part, note }]);
    const p: Playing = { track, bus, byStep, nextStep: 0, nextTime: ctx.currentTime + 0.1, timer: 0 as never };
    p.timer = setInterval(() => this.schedule(p), TICK_MS);
    this.playing = p;
    this.schedule(p);
  }

  private schedule(p: Playing) {
    const ctx = this.ctx!;
    const stepDur = 60 / p.track.bpm / p.track.stepsPerBeat;
    while (p.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      for (const { part, note } of p.byStep.get(p.nextStep) ?? [])
        playVoice(ctx, this.noise!, part.instrument, note, p.nextTime, note.length * stepDur, note.velocity * part.gain, p.bus);
      p.nextStep = (p.nextStep + 1) % p.track.length;
      p.nextTime += stepDur;
    }
  }
}

/** One note on one instrument, scheduled at time `t` on any (real-time or offline) audio context. */
export function playVoice(
ctx: BaseAudioContext,
noise: AudioBuffer,
inst: Instrument,
note: NoteEvent,
t: number,
dur: number,
peak: number,
out: AudioNode,
) {
  const f = frequency(note.midi);
  const amp = ctx.createGain();
  amp.connect(out);
  const env = (attack: number, sustain: number, release: number) => {
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    amp.gain.setTargetAtTime(peak * sustain, t + attack, Math.max(0.01, dur / 3));
    amp.gain.setTargetAtTime(0, t + dur, release / 3);
    return t + dur + release;
  };
  const osc = (type: OscillatorType, freq: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    return o;
  };

  switch (inst) {
    case 'lead': {
      const end = env(0.005, 0.55, 0.08);
      const lp = filter(ctx, 'lowpass', 3200, 1);
      lp.connect(amp);
      for (const o of [osc('square', f), osc('sawtooth', f, 7)]) {
        const g = ctx.createGain();
        g.gain.value = 0.5;
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(end);
      }
      break;
    }
    case 'flute': {
      const end = env(0.07, 0.8, 0.25);
      const o = osc('sine', f);
      const vib = osc('sine', 5.2);
      const depth = ctx.createGain();
      depth.gain.value = 6; // cents
      vib.connect(depth).connect(o.detune);
      const breath = osc('triangle', f * 2);
      const bg = ctx.createGain();
      bg.gain.value = 0.12;
      o.connect(amp);
      breath.connect(bg).connect(amp);
      for (const x of [o, vib, breath]) {
        x.start(t);
        x.stop(end);
      }
      break;
    }
    case 'pluck': {
      amp.gain.setValueAtTime(peak, t);
      amp.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
      const o = osc('triangle', f);
      o.connect(amp);
      o.start(t);
      o.stop(t + 0.5);
      break;
    }
    case 'bass': {
      const end = env(0.008, 0.7, 0.06);
      const lp = filter(ctx, 'lowpass', 650, 5);
      lp.connect(amp);
      const o = osc('sawtooth', f);
      o.connect(lp);
      o.start(t);
      o.stop(end);
      break;
    }
    case 'pad': {
      const end = env(Math.min(0.8, dur / 2), 0.9, 1.0);
      for (const o of [osc('triangle', f, -6), osc('sine', f, 6)]) {
        o.connect(amp);
        o.start(t);
        o.stop(end);
      }
      break;
    }
    case 'kick': {
      amp.gain.setValueAtTime(peak, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      const o = osc('sine', 150);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      o.connect(amp);
      o.start(t);
      o.stop(t + 0.32);
      break;
    }
    case 'snare':
    case 'hat': {
      const hat = inst === 'hat';
      const len = hat ? 0.045 : 0.16;
      amp.gain.setValueAtTime(peak, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + len);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.connect(hat ? filter(ctx, 'highpass', 7000, 0.7) : filter(ctx, 'bandpass', 1900, 0.8)).connect(amp);
      src.start(t);
      src.stop(t + len + 0.02);
      if (!hat) {
        const body = osc('triangle', 185);
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(peak * 0.6, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        body.connect(bg).connect(out);
        body.start(t);
        body.stop(t + 0.1);
      }
      break;
    }
  }
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

export function makeNoise(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic noise (no Math.random needed; it just has to sound like hiss).
  let x = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

/** Schedule one full loop of `track` from time 0 (for offline rendering / previews). */
export function scheduleLoop(ctx: BaseAudioContext, track: Track, out: AudioNode, startAt = 0) {
  const noise = makeNoise(ctx);
  const stepDur = 60 / track.bpm / track.stepsPerBeat;
  for (const part of track.parts)
    for (const note of part.notes)
      playVoice(ctx, noise, part.instrument, note, startAt + note.step * stepDur, note.length * stepDur, note.velocity * part.gain, out);
  return track.length * stepDur;
}

/** One shared player for the whole app. */
export const music = new MusicPlayer();
