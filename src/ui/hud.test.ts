import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUTS, DEFAULT_MAGE_ICON, MAGE_ICONS } from '../game/content';
import { buildMage } from '../game/loadout';
import { hpTone, roundsTone } from './Hud';

describe('HUD', () => {
  it('HP is green, then yellow under 67%, then orange under 33%', () => {
    expect(hpTone(25, 25)).toBe('healthy');
    expect(hpTone(17, 25)).toBe('healthy'); // 68%
    expect(hpTone(16, 25)).toBe('injured'); // 64%
    expect(hpTone(9, 25)).toBe('injured'); // 36%
    expect(hpTone(8, 25)).toBe('critical'); // 32%
    expect(hpTone(0, 25)).toBe('critical');
  });

  it('rounds left turn yellow at 3 and 2, and red at 1', () => {
    expect([12, 4].map(roundsTone)).toEqual(['calm', 'calm']);
    expect([3, 2].map(roundsTone)).toEqual(['warning', 'warning']);
    expect(roundsTone(1)).toBe('danger');
  });
});

describe('mage icons', () => {
  it('cover several archetypes, each only once', () => {
    expect(new Set(MAGE_ICONS.map((m) => m.icon)).size).toBe(MAGE_ICONS.length);
    const names = MAGE_ICONS.map((m) => m.name).join(' ');
    for (const archetype of [/ninja/i, /warrior/i, /archer/i]) expect(names).toMatch(archetype);
  });

  it('every default loadout has one of them, and the mage carries it into the match', () => {
    const icons = new Set(MAGE_ICONS.map((m) => m.icon));
    for (const l of DEFAULT_LOADOUTS) {
      expect(icons.has(l.icon!), l.name).toBe(true);
      expect(buildMage('p1', l.name, l, { q: 0, r: 0 }).icon).toBe(l.icon);
    }
  });

  it('falls back to the standard wizard when a loadout has none', () => {
    const { icon: _drop, ...bare } = DEFAULT_LOADOUTS[0];
    expect(buildMage('p1', 'x', bare, { q: 0, r: 0 }).icon).toBe(DEFAULT_MAGE_ICON);
  });
});
