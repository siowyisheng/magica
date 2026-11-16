import { ABILITIES, PASSIVES, STAFF_STRIKE } from './content';
import type { Hex } from './hex';
import type { Circle, Loadout, Mage, PlayerId, StatKey } from './types';

export const CIRCLE_POINTS: Record<Circle, number> = { 1: 30, 2: 20, 3: 10 };
export const CIRCLE_NAME: Record<Circle, string> = { 1: 'First Circle', 2: 'Second Circle', 3: 'Third Circle' };

export const BASE_STATS: Record<StatKey, number> = { hp: 10, maxMana: 10, manaRegen: 2, movespeed: 3 };
export const STAT_NAME: Record<StatKey, string> = { hp: 'HP', maxMana: 'Max Mana', manaRegen: 'Mana Regen', movespeed: 'Movespeed' };
export const STAT_KEYS = Object.keys(BASE_STATS) as StatKey[];

export const MAX_ABILITIES = 8;

/** How much the k-th step (1-based) of a stat raises it. HP pays less and less: +3, +3, +2, +2, +2, then +1. */
export function statStepGain(stat: StatKey, k: number): number {
  if (stat === 'maxMana') return 10;
  if (stat !== 'hp') return 1;
  return k <= 2 ? 3 : k <= 5 ? 2 : 1;
}

/** Loadout Points for the k-th step (1-based) of a stat. HP and Max Mana cost 1 a step; Mana Regen 2, 3, 4, then 4 each; Movespeed costs more each step. */
export function statStepCost(stat: StatKey, k: number): number {
  switch (stat) {
    case 'hp':
      return 1;
    case 'maxMana':
      return 1;
    case 'manaRegen':
      return Math.min(k + 1, 4);
    case 'movespeed':
      return 2 * k + 1;
  }
}

export function statCost(stat: StatKey, steps: number): number {
  let total = 0;
  for (let k = 1; k <= steps; k++) total += statStepCost(stat, k);
  return total;
}

export function statValue(stat: StatKey, steps: number): number {
  let value = BASE_STATS[stat];
  for (let k = 1; k <= steps; k++) value += statStepGain(stat, k);
  return value;
}

export function loadoutCost(l: Loadout): number {
  const stats = STAT_KEYS.reduce((n, k) => n + statCost(k, l.stats[k] ?? 0), 0);
  const abilities = l.abilityIds.reduce((n, id) => n + (ABILITIES[id]?.points ?? 0), 0);
  const passives = l.passiveIds.reduce((n, id) => n + (PASSIVES[id]?.points ?? 0), 0);
  return stats + abilities + passives;
}

export const pointsLeft = (l: Loadout) => CIRCLE_POINTS[l.circle] - loadoutCost(l);

export function validateLoadout(l: Loadout): string[] {
  const errors: string[] = [];
  if (!CIRCLE_POINTS[l.circle]) return [`Unknown Circle "${l.circle}"`];
  if (!l.name.trim()) errors.push('Give your loadout a name.');
  for (const k of STAT_KEYS) {
    const steps = l.stats[k] ?? 0;
    if (!Number.isInteger(steps) || steps < 0) errors.push(`${STAT_NAME[k]} can't go below base.`);
  }
  if (l.abilityIds[0] !== STAFF_STRIKE) errors.push('Staff Strike must be in slot 1.');
  if (l.abilityIds.length > MAX_ABILITIES) errors.push(`At most ${MAX_ABILITIES} Abilities, Staff Strike included.`);
  if (new Set(l.abilityIds).size !== l.abilityIds.length) errors.push('Duplicate Abilities.');
  if (new Set(l.passiveIds).size !== l.passiveIds.length) errors.push('Duplicate Passives.');
  for (const id of l.abilityIds) if (!ABILITIES[id]) errors.push(`Unknown Ability "${id}"`);
  for (const id of l.passiveIds) if (!PASSIVES[id]) errors.push(`Unknown Passive "${id}"`);
  const left = pointsLeft(l);
  if (left < 0) errors.push(`Over budget by ${-left} Loadout Points.`);
  return errors;
}

function passiveStats(ids: string[]) {
  const out = { armor: 0, regen: 0, manaRegen: 0, absorbBonus: 0 };
  for (const id of ids) {
    const m = PASSIVES[id]?.mods ?? {};
    out.armor += m.armor ?? 0;
    out.regen += m.regen ?? 0;
    out.manaRegen += m.manaRegen ?? 0;
    out.absorbBonus += m.absorbBonus ?? 0;
  }
  return out;
}

export function buildMage(owner: PlayerId, name: string, l: Loadout, pos: Hex): Mage {
  const maxHp = statValue('hp', l.stats.hp);
  const movespeed = statValue('movespeed', l.stats.movespeed);
  const passives = passiveStats(l.passiveIds);
  return {
    owner,
    name,
    circle: l.circle,
    pos,
    hp: maxHp,
    maxHp,
    shield: 0,
    ap: 2,
    maxMana: statValue('maxMana', l.stats.maxMana),
    // Starts with one turn of regen (the stat alone, not passives).
    mana: Math.min(statValue('maxMana', l.stats.maxMana), statValue('manaRegen', l.stats.manaRegen)),
    movespeed,
    mp: 0,
    empower: 0,
    ...passives,
    manaRegen: statValue('manaRegen', l.stats.manaRegen) + passives.manaRegen,
    passiveIds: [...l.passiveIds],
    abilities: l.abilityIds.map((id) => ({ id, uses: 0 })),
    statuses: [],
  };
}
