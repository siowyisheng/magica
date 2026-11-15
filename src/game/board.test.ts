import { describe, expect, it } from 'vitest';
import { generateBoard, spawnFor } from './board';
import { key } from './hex';

describe('rock-only arena', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i * 101 + 3);

  it('only has open ground and rock', () => {
    for (const s of seeds)
      for (const t of Object.values(generateBoard(s, 6))) expect(['plain', 'rock']).toContain(t.terrain);
  });

  it('averages roughly 18% rock', () => {
    const tiles = seeds.flatMap((s) => Object.values(generateBoard(s, 6)));
    const rock = tiles.filter((t) => t.terrain === 'rock').length / tiles.length;
    expect(rock).toBeGreaterThan(0.14);
    expect(rock).toBeLessThan(0.22);
  });

  it('is symmetric and keeps spawns and the centre open', () => {
    for (const s of seeds) {
      const b = generateBoard(s, 6);
      for (const t of Object.values(b)) expect(b[key({ q: -t.q + 0, r: -t.r + 0 })].terrain).toBe(t.terrain);
      expect(b[key(spawnFor('p1', 6))].terrain).toBe('plain');
      expect(b['0,0'].terrain).toBe('plain');
    }
  });
});
