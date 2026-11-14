import { ABILITIES, ARCHETYPES, RELICS } from './content';
import type { Hex } from './hex';
import type { Loadout, PlayerId, StatMods, Unit } from './types';

export function validateLoadout(l: Loadout): string[] {
  const errors: string[] = [];
  const arch = ARCHETYPES[l.archetypeId];
  if (!arch) return [`Unknown archetype "${l.archetypeId}"`];
  if (!l.name.trim()) errors.push('Give your loadout a name.');
  if (l.abilityIds.length === 0) errors.push('Pick at least one ability.');
  if (l.abilityIds.length > arch.abilitySlots) errors.push(`${arch.name} can only carry ${arch.abilitySlots} abilities.`);
  if (l.relicIds.length > arch.relicSlots) errors.push(`${arch.name} can only carry ${arch.relicSlots} relics.`);
  if (new Set(l.abilityIds).size !== l.abilityIds.length) errors.push('Duplicate abilities.');
  if (new Set(l.relicIds).size !== l.relicIds.length) errors.push('Duplicate relics.');
  for (const id of l.abilityIds) if (!ABILITIES[id]) errors.push(`Unknown ability "${id}"`);
  for (const id of l.relicIds) if (!RELICS[id]) errors.push(`Unknown relic "${id}"`);
  return errors;
}

export function totalMods(l: Loadout): Required<StatMods> {
  const out = { hp: 0, ap: 0, move: 0, power: 0, range: 0 };
  for (const id of l.relicIds) {
    const m = RELICS[id]?.mods ?? {};
    out.hp += m.hp ?? 0;
    out.ap += m.ap ?? 0;
    out.move += m.move ?? 0;
    out.power += m.power ?? 0;
    out.range += m.range ?? 0;
  }
  return out;
}

export function buildUnit(owner: PlayerId, name: string, l: Loadout, pos: Hex): Unit {
  const arch = ARCHETYPES[l.archetypeId];
  const m = totalMods(l);
  const maxHp = Math.max(1, arch.hp + m.hp);
  const maxAp = Math.max(1, arch.ap + m.ap);
  const move = Math.max(0, arch.move + m.move);
  return {
    owner,
    name,
    archetypeId: arch.id,
    pos,
    hp: maxHp,
    maxHp,
    shield: 0,
    ap: maxAp,
    maxAp,
    move,
    moveLeft: move,
    power: m.power,
    rangeBonus: m.range,
    abilities: l.abilityIds.map((id) => ({ id, cooldown: 0 })),
    statuses: [],
  };
}
