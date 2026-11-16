import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../game/content';
import type { Sound } from './cues';
import { renderSound } from './sfx';

// A stand-in for Web Audio that records what a recipe schedules and rejects anything the real
// thing would throw on (non-positive exponential ramps, stops before starts, bad numbers).
function fakeContext() {
  const log = { nodes: 0, maxStop: 0, hasSound: false };
  const finite = (...xs: number[]) => xs.forEach((x) => expect(Number.isFinite(x)).toBe(true));
  const param = () => ({
    value: 0,
    setValueAtTime: (v: number, t: number) => (finite(v, t), undefined),
    linearRampToValueAtTime: (v: number, t: number) => (finite(v, t), undefined),
    exponentialRampToValueAtTime: (v: number, t: number) => {
      finite(v, t);
      expect(v, 'exponential ramps need a positive target').toBeGreaterThan(0);
    },
    setTargetAtTime: () => undefined,
  });
  const node = (extra: object = {}) => {
    log.nodes++;
    const n: Record<string, unknown> = { connect: (x: unknown) => x, disconnect: () => undefined, ...extra };
    return n;
  };
  const starts = new WeakMap<object, number>();
  const source = (extra: object) =>
    node({
      start(t: number) {
        finite(t);
        starts.set(this as object, t);
        log.hasSound = true;
      },
      stop(t: number) {
        finite(t);
        expect(t).toBeGreaterThan(starts.get(this as object) ?? Infinity);
        log.maxStop = Math.max(log.maxStop, t);
      },
      ...extra,
    });
  const ctx = {
    sampleRate: 8000,
    createGain: () => node({ gain: param() }),
    createOscillator: () => source({ type: 'sine', frequency: param(), detune: param() }),
    createBufferSource: () => source({ buffer: null, loop: false }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(), Q: param(), gain: param() }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, noise: {} as AudioBuffer, out: node() as unknown as AudioNode, log };
}

const render = (sound: Sound, t = 1) => {
  const { ctx, noise, out, log } = fakeContext();
  const end = renderSound(ctx, noise, out, t, sound);
  return { end, ...log };
};

const GAME_SOUNDS: Sound[] = [
  { id: 'damage', amount: 1 },
  { id: 'damage', amount: 12 },
  { id: 'absorbed' },
  { id: 'step' },
  { id: 'crystalAbsorb', size: 'small' },
  { id: 'crystalAbsorb', size: 'large' },
  { id: 'crystalReady' },
  { id: 'actionStart' },
  { id: 'reactionStart' },
  { id: 'win' },
  { id: 'lose' },
  { id: 'fanfare' },
  { id: 'click' },
  { id: 'confirm' },
  { id: 'select' },
];

describe('sound recipes', () => {
  it('every Ability makes a sound when cast, launched and resolved, and none runs long', () => {
    for (const def of Object.values(ABILITIES))
      for (const id of ['cast', 'launch', 'resolve'] as const) {
        const r = render({ id, abilityId: def.id });
        expect(r.hasSound, `${def.id} ${id}`).toBe(true);
        expect(r.end - 1, `${def.id} ${id}`).toBeLessThan(1.6);
        expect(r.maxStop).toBeLessThanOrEqual(r.end + 1e-9);
      }
  });

  it('every game sound makes a sound that ends in reasonable time', () => {
    for (const s of GAME_SOUNDS) {
      const r = render(s);
      expect(r.hasSound, s.id).toBe(true);
      expect(r.end - 1, s.id).toBeLessThan(2);
    }
  });

  it('an unknown Ability is silent rather than an error', () => {
    expect(render({ id: 'cast', abilityId: 'nope' }).hasSound).toBe(false);
  });

  it('bigger damage sounds bigger, and a Counterspell is not an Attack', () => {
    const small = render({ id: 'damage', amount: 1 });
    const big = render({ id: 'damage', amount: 12 });
    expect(big.nodes).toBeGreaterThan(small.nodes);
    expect(ABILITIES.counterspell.effect.type).toBe('counter');
  });

  it('Techniques differ from Spells: Attack Techniques resolve with physical, not school, sounds', () => {
    const strike = render({ id: 'resolve', abilityId: 'staff-strike' });
    const bolt = render({ id: 'resolve', abilityId: 'firebolt' });
    expect(strike.nodes).not.toBe(bolt.nodes);
  });
});
