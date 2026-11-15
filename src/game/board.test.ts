import { describe, expect, it } from 'vitest';
import { generateBoard, spawnFor } from './board';
import { key, neighbors } from './hex';

describe('rock-only arena', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i * 101 + 3);

  it('only has open ground and rock', () => {
    for (const s of seeds)
      for (const t of Object.values(generateBoard(s, 6))) expect(['plain', 'rock']).toContain(t.terrain);
  });

  it('averages roughly a third rock', () => {
    const tiles = seeds.flatMap((s) => Object.values(generateBoard(s, 6)));
    const rock = tiles.filter((t) => t.terrain === 'rock').length / tiles.length;
    expect(rock).toBeGreaterThan(0.27);
    expect(rock).toBeLessThan(0.4);
  });

  it('leaves all open ground as one connected area, with no sealed-off rooms', () => {
    for (const radius of [4, 5, 6, 7])
      for (const s of seeds) {
        const b = generateBoard(s, radius);
        const open = Object.values(b).filter((t) => t.terrain === 'plain');
        const seen = new Set([key(spawnFor('p1', radius))]);
        const queue = [spawnFor('p1', radius)];
        while (queue.length) {
          const cur = queue.shift()!;
          for (const n of neighbors(cur)) if (b[key(n)]?.terrain === 'plain' && !seen.has(key(n))) (seen.add(key(n)), queue.push(n));
        }
        expect(seen.size, `seed ${s} radius ${radius}`).toBe(open.length);
      }
  });

  it('is laid out as walls: most rock hexes touch another rock hex', () => {
    const tiles = Object.values(generateBoard(3, 6));
    const isRock = (q: number, r: number) => tiles.some((t) => t.q === q && t.r === r && t.terrain === 'rock');
    const rocks = tiles.filter((t) => t.terrain === 'rock');
    const joined = rocks.filter((t) => neighbors(t).some((n) => isRock(n.q, n.r)));
    expect(joined.length / rocks.length).toBeGreaterThan(0.8);
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
