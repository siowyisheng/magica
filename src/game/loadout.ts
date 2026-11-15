import { ABILITIES, PASSIVES, STAFF_STRIKE } from './content';
import type { Hex } from './hex';
import type { Circle, Loadout, Mage, PlayerId, StatKey } from './types';

export const CIRCLE_POINTS: Record<Circle, number> = { 1: 30, 2: 20, 3: 10 };
export const CIRCLE_NAME: Record<Circle, string> = { 1: 'First Circle', 2: 'Second Circle', 3: 'Third Circle' };

export const BASE_STATS: Record<StatKey, number> = { hp: 10, magic: 3, movespeed: 3 };
/** How much one step raises each stat. */
export const STAT_STEP_GAIN: Record<StatKey, number> = { hp: 3, magic: 1, movespeed: 1 };
export const STAT_NAME: Record<StatKey, string> = { hp: 'HP', magic: 'Magic', movespeed: 'Movespeed' };
export const STAT_KEYS = Object.keys(BASE_STATS) as StatKey[];

export const MAX_ABILITIES = 8;

/** Loadout Points for the k-th step (1-based) of a stat. Each step costs more than the last. */
export function statStepCost(stat: StatKey, k: number): number {
  switch (stat) {
    case 'hp':
      return k;
    case 'magic':
      return k + 1;
    case 'movespeed':
      return 2 * k + 1;
  }
}

export function statCost(stat: StatKey, steps: number): number {
  let total = 0;
  for (let k = 1; k <= steps; k++) total += statStepCost(stat, k);
  return total;
}

export const statValue = (stat: StatKey, steps: number) => BASE_STATS[stat] + STAT_STEP_GAIN[stat] * steps;

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
  return {
    owner,
    name,
    circle: l.circle,
    pos,
    hp: maxHp,
    maxHp,
    shield: 0,
    ap: 2,
    magic: statValue('magic', l.stats.magic),
    mana: statValue('magic', l.stats.magic),
    movespeed,
    mp: 0,
    ...passiveStats(l.passiveIds),
    passiveIds: [...l.passiveIds],
    abilities: l.abilityIds.map((id) => ({ id, cooldown: 0 })),
    statuses: [],
  };
}
