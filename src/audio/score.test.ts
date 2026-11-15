import { describe, expect, it } from 'vitest';
import { COMBAT, frequency, melody, MENU, midi } from './score';

describe('note helpers', () => {
  it('converts note names to MIDI numbers and frequencies', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C4')).toBe(60);
    expect(midi('C#5')).toBe(73);
    expect(midi('Bb2')).toBe(46);
    expect(frequency(69)).toBeCloseTo(440);
    expect(frequency(81)).toBeCloseTo(880);
  });

  it('parses melodies with rests and rejects bad tokens', () => {
    const m = melody('E5:2 r:2 A5:4');
    expect(m.length).toBe(8);
    expect(m.notes.map((n) => [n.step, n.midi])).toEqual([
      [0, 76],
      [4, 81],
    ]);
    expect(() => melody('H5:2')).toThrow();
    expect(() => melody('A5:0')).toThrow();
  });
});

describe('tracks', () => {
  for (const track of [COMBAT, MENU]) {
    it(`${track.title}: every note sits inside the loop`, () => {
      for (const part of track.parts)
        for (const n of part.notes) {
          expect(n.step).toBeGreaterThanOrEqual(0);
          expect(n.step + n.length, part.instrument).toBeLessThanOrEqual(track.length);
        }
    });
  }

  it('combat is fast and driving; menu is slow', () => {
    expect(COMBAT.bpm).toBeGreaterThanOrEqual(150);
    expect(MENU.bpm).toBeLessThanOrEqual(90);
    expect(COMBAT.parts.some((p) => p.instrument === 'kick')).toBe(true);
    expect(MENU.parts.some((p) => p.instrument === 'kick')).toBe(false);
  });
});
