import { UNLIMITED, type WeaponDef, type WeaponId, type AbilityDef, type AbilityEffect, type Hit, type Loadout, type PassiveDef, type School, type Shape, type Targeting } from './types';

// ---------------------------------------------------------------------------
// Content tables. Add Abilities and Passives here; the builder, engine and AI
// pick them up automatically.
//
// Balance is estimated, not playtested. Rules of thumb used:
// - Mana buys damage at roughly 1 damage per Mana for cheap spells, with
//   bigger, harder-to-dodge Threat Areas paying more per point of damage.
// - Defensive Spells prevent less damage per Mana than offence deals, so
//   attacking is the better default.
// - Loadout Points: 1–2 basics, 3–5 strong Abilities, 8–12 game-enders.
// ---------------------------------------------------------------------------

export const STAFF_STRIKE = 'staff-strike';

/** The weapons. Every mage carries exactly one; Unarmed is the default and costs nothing. */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  unarmed: {
    id: 'unarmed', name: 'Unarmed', icon: '✊', points: 0, disarmable: false,
    description: 'Bare hands. Costs nothing and can never be disarmed. Can learn Strike.',
  },
  staff: {
    id: 'staff', name: 'Staff', icon: '🪄', points: 3, manaRegen: 1, disarmable: true,
    description: '+1 Mana Regen. Can learn Staff Strike.',
  },
  wand: {
    id: 'wand', name: 'Wand', icon: '✨', points: 2, manaRegen: 1, spellsNeedWeapon: true, disarmable: true,
    description: '+1 Mana Regen. A disarmed wand mage cannot cast Spells at all.',
  },
  sword: {
    id: 'sword', name: 'Sword', icon: '⚔️', points: 3, defaultTechnique: 'slash', disarmable: true,
    description: 'Comes with Slash.',
  },
  spear: {
    id: 'spear', name: 'Spear', icon: '🔱', points: 3, defaultTechnique: 'thrust', disarmable: true,
    description: 'Comes with Thrust.',
  },
  bow: {
    id: 'bow', name: 'Bow', icon: '🏹', points: 4, defaultTechnique: 'shoot', disarmable: true,
    description: 'Comes with Shoot.',
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

type Common = Pick<AbilityDef, 'id' | 'name' | 'icon' | 'school' | 'description' | 'points'> &
  Partial<Pick<AbilityDef, 'fast' | 'cooldown' | 'multi' | 'timing' | 'perTurn' | 'weapon'>>;

const technique = (a: Common & { shape: Shape; hit: Hit }): AbilityDef => ({
  ...a,
  kind: 'technique',
  mana: 0,
  effect: { type: 'attack', shape: a.shape, hit: a.hit },
});

/** A Technique usable only in the Reaction Phase: costs AP but no Mana. */
const reactionTechnique = (a: Common & { effect: AbilityEffect; targeting: Targeting; range?: number }): AbilityDef => ({
  ...a,
  kind: 'technique',
  mana: 0,
  timing: 'reaction',
});

const attack = (a: Common & { mana: number; shape: Shape; hit: Hit }): AbilityDef => ({
  ...a,
  kind: 'spell',
  effect: { type: 'attack', shape: a.shape, hit: a.hit },
});

const spell = (a: Common & Pick<AbilityDef, 'mana' | 'effect' | 'targeting' | 'range'>): AbilityDef => ({
  ...a,
  kind: 'spell',
});

const LIST: AbilityDef[] = [
  // --- Techniques: physical, AP only -----------------------------------------
  // Weapon techniques. A weapon's default technique (0 points) comes free with it; the rest are bought.
  technique({
    id: 'strike', name: 'Strike', icon: '👊', school: 'steel', points: 2, fast: true, weapon: 'unarmed',
    description: 'A quick jab at an adjacent mage.',
    shape: { kind: 'single', range: 1 }, hit: { damage: 1 },
  }),
  technique({
    id: STAFF_STRIKE, name: 'Staff Strike', icon: '🪄', school: 'steel', points: 1, weapon: 'staff',
    description: 'A whack with your staff that reaches two hexes.',
    shape: { kind: 'line', range: 2 }, hit: { damage: 2 },
  }),
  technique({
    id: 'slash', name: 'Slash', icon: '⚔️', school: 'steel', points: 0, weapon: 'sword',
    description: 'A wide sweep across three hexes.',
    shape: { kind: 'meleeArc' }, hit: { damage: 5 },
  }),
  technique({
    id: 'thrust', name: 'Thrust', icon: '🔱', school: 'steel', points: 0, weapon: 'spear',
    description: 'A long thrust that reaches two hexes and hits everyone in them.',
    shape: { kind: 'line', range: 2, pierce: true }, hit: { damage: 4 },
  }),
  technique({
    id: 'shoot', name: 'Shoot', icon: '🏹', school: 'steel', points: 0, weapon: 'bow',
    description: 'An arrow down a long line.',
    shape: { kind: 'line', range: 7 }, hit: { damage: 4 },
  }),
  technique({
    id: 'shield-bash', name: 'Shield Bash', icon: '🥊', school: 'steel', points: 2,
    description: 'Slam the enemy back a hex. Into rock, it hurts more.',
    shape: { kind: 'meleeArc' }, hit: { damage: 2, knockback: 1 },
  }),

  // --- Reaction Techniques: AP only -----------------------------------
  reactionTechnique({
    id: 'block', name: 'Block', icon: '✋', school: 'steel', points: 3,
    description: 'Reaction: reduce the damage of the first incoming Attack by 4.',
    targeting: 'self', effect: { type: 'block', amount: 4 },
  }),

  // --- Offensive Spells -------------------------------------------------------
  attack({
    id: 'spark', name: 'Spark', icon: '⚡', school: 'arcane', points: 2, mana: 2, fast: true,
    description: 'Fast: a cheap zap that costs no AP.',
    shape: { kind: 'line', range: 4 }, hit: { damage: 1 },
  }),
  attack({
    id: 'firebolt', name: 'Firebolt', icon: '🔥', school: 'fire', points: 2, mana: 3,
    description: 'A bolt of flame down a Line, to any distance. Sets the target burning.',
    shape: { kind: 'line', range: UNLIMITED }, hit: { damage: 4, status: { kind: 'burn', turns: 2, power: 1 } },
  }),
  attack({
    id: 'frost-lance', name: 'Frost Lance', icon: '❄️', school: 'frost', points: 2, mana: 3,
    description: 'An icy Line, to any distance, that slows.',
    shape: { kind: 'line', range: UNLIMITED }, hit: { damage: 4, status: { kind: 'slow', turns: 1, power: 1 } },
  }),
  attack({
    id: 'icicle', name: 'Icicle', icon: '🧊', school: 'frost', points: 2, mana: 3,
    description: 'Drops on one hex in your line of sight.',
    shape: { kind: 'single', range: 7, los: true }, hit: { damage: 5 },
  }),
  attack({
    id: 'fireball', name: 'Fireball', icon: '💥', school: 'fire', points: 3, mana: 5,
    description: 'Flies toward a hex and explodes there, or sooner on rock or your foe. Aim past your foe in case they dodge.',
    shape: { kind: 'explosiveLine', range: UNLIMITED, radius: 1 }, hit: { damage: 8 },
  }),
  attack({
    id: 'dragons-breath', name: "Dragon's Breath", icon: '🐉', school: 'fire', points: 2, mana: 3,
    description: 'A 60° cone of fire that leaves everything burning.',
    shape: { kind: 'cone', range: 4 }, hit: { damage: 4, status: { kind: 'burn', turns: 2, power: 1 } },
  }),
  attack({
    id: 'ice-shards', name: 'Ice Shards', icon: '💠', school: 'frost', points: 3, mana: 6,
    description: 'Three icy Lines fanned 30° apart. Slows.',
    shape: { kind: 'fan', range: 4 }, hit: { damage: 2, status: { kind: 'slow', turns: 1, power: 1 } },
  }),
  attack({
    id: 'nova', name: 'Arcane Nova', icon: '🌟', school: 'arcane', points: 3, mana: 7,
    description: 'Detonates everything within 2 of you, but not your own hex.',
    shape: { kind: 'selfBurst', radius: 2 }, hit: { damage: 10 },
  }),
  attack({
    id: 'wall-of-fire', name: 'Wall of Fire', icon: '♨️', school: 'fire', points: 4, mana: 8,
    description: 'Draw a 5-hex wall of flame. Burns whoever is caught in it.',
    shape: { kind: 'wall', range: 4, length: 5 }, hit: { damage: 3, status: { kind: 'burn', turns: 2, power: 1 } },
  }),
  attack({
    id: 'plague', name: 'Plague', icon: '🦠', school: 'death', points: 3, mana: 5,
    description: 'A miasma that poisons everyone in it for 3 turns.',
    shape: { kind: 'burst', range: 4, radius: 1 }, hit: { damage: 1, status: { kind: 'poison', turns: 3, power: 1 } },
  }),
  attack({
    id: 'riptide', name: 'Riptide', icon: '🪝', school: 'tide', points: 2, mana: 4,
    description: 'A current down a Line that drags the target 2 hexes toward you.',
    shape: { kind: 'line', range: 4 }, hit: { damage: 1, knockback: -2 },
  }),
  attack({
    id: 'tidal-wave', name: 'Tidal Wave', icon: '🌊', school: 'tide', points: 4, mana: 10,
    description: 'A crashing wave (radius 2) that shoves everyone 2 hexes away from you.',
    shape: { kind: 'burst', range: 3, radius: 2 }, hit: { damage: 2, knockback: 2 },
  }),
  attack({
    id: 'soul-drain', name: 'Soul Drain', icon: '👻', school: 'death', points: 3, mana: 6,
    description: 'Siphon a soul from one hex. All damage dealt heals you.',
    shape: { kind: 'single', range: 3 }, hit: { damage: 2, lifesteal: 1 },
  }),
  attack({
    id: 'doom', name: 'Doom', icon: '⚰️', school: 'death', points: 2, mana: 5,
    description: 'A curse on one hex: whoever is there takes +2 from every hit for 2 turns.',
    shape: { kind: 'single', range: 6 }, hit: { damage: 0, status: { kind: 'vulnerable', turns: 2, power: 2 } },
  }),
  spell({
    id: 'stasis', name: 'Stasis', icon: '🕰️', school: 'time', points: 2, mana: 2, fast: true, cooldown: 2,
    description:
      'Fast, cooldown 2 (not on consecutive turns). Freeze the enemy (8 range, line of sight): you both secretly bid Mana. If your bid is at least theirs, they can’t Move on their next turn. Both bids are spent.',
    targeting: 'enemy', range: 8, effect: { type: 'contest', severity: 6, status: { kind: 'root', turns: 1, power: 0 } },
  }),
  attack({
    id: 'meteor', name: 'Meteor', icon: '☄️', school: 'fire', points: 5, mana: 18,
    description: 'A meteor (radius 2) anywhere within 6. Hard to outrun.',
    shape: { kind: 'burst', range: 6, radius: 2 }, hit: { damage: 7 },
  }),
  attack({
    id: 'cataclysm', name: 'Cataclysm', icon: '🌋', school: 'earth', points: 10, mana: 50,
    description: 'Game-ender: a radius-4 eruption (61 hexes). Needs Max Mana 50 to ever afford.',
    shape: { kind: 'burst', range: 6, radius: 4 }, hit: { damage: 20 },
  }),

  // --- Utility Spells ---------------------------------------------------------
  spell({
    id: 'mend', name: 'Mend', icon: '🌿', school: 'nature', points: 2, mana: 5,
    description: 'Restore 4 HP.',
    targeting: 'self', effect: { type: 'heal', amount: 4 },
  }),
  spell({
    id: 'haste', name: 'Haste', icon: '⏩', school: 'time', points: 2, mana: 3, fast: true,
    description: 'Fast: +3 Movement Points this turn.',
    targeting: 'self', effect: { type: 'haste', move: 3 },
  }),
  spell({
    id: 'empower', name: 'Empower', icon: '💪', school: 'arcane', points: 2, mana: 3, fast: true,
    description: 'Fast: your Techniques deal +3 damage for the rest of this turn.',
    targeting: 'self', effect: { type: 'empower', bonus: 3 },
  }),
  spell({
    id: 'stone-pillar', name: 'Stone Pillar', icon: '🗿', school: 'earth', points: 2, mana: 3, fast: true,
    description: 'Fast: raise a rock on an empty hex within 5 and in line of sight. It blocks walking and Lines.',
    targeting: 'tile', range: 5, effect: { type: 'pillar' },
  }),

  // --- Reaction Spells (defensive: less Mana-efficient than offence) ---------
  spell({
    id: 'ward', name: 'Ward', icon: '🛡️', school: 'arcane', points: 2, mana: 6, fast: true, multi: true, timing: 'reaction',
    description: 'Fast Reaction: a 4-point shield over every Attack in this resolution.',
    targeting: 'self', effect: { type: 'shield', amount: 4 },
  }),
  spell({
    id: 'counterspell', name: 'Counterspell', icon: '🚫', school: 'arcane', points: 3, mana: 7, timing: 'reaction',
    description: 'Reaction: cancel one incoming Spell. Useless against Techniques.',
    targeting: 'self', effect: { type: 'counter' },
  }),
  spell({
    id: 'deflect', name: 'Deflect', icon: '🪞', school: 'arcane', points: 3, mana: 6, timing: 'reaction',
    description: 'Reaction: turn one incoming Line around and send it back at the attacker.',
    targeting: 'self', effect: { type: 'deflect' },
  }),
  spell({
    id: 'blink', name: 'Blink', icon: '✨', school: 'arcane', points: 2, mana: 4, timing: 'both',
    description: 'Teleport up to 3 hexes. Works as a Reaction too, to dodge incoming Attacks.',
    targeting: 'tile', range: 3, effect: { type: 'blink' },
  }),
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(LIST.map((a) => [a.id, a]));

export const PASSIVES: Record<string, PassiveDef> = Object.fromEntries(
  (
    [
      { id: 'mana-well', name: 'Mana Well', icon: '🏺', points: 3, description: 'Absorb Mana gives +50%.', mods: { absorbBonus: 0.5 } },
      { id: 'iron-skin', name: 'Iron Skin', icon: '🪨', points: 3, description: 'Every hit you take is 1 lower (but at least 1).', mods: { armor: 1 } },
      { id: 'regeneration', name: 'Regeneration', icon: '✚', points: 3, description: '+1 HP at the start of your turn.', mods: { regen: 1 } },
      { id: 'wellspring', name: 'Wellspring', icon: '⛲', points: 4, description: '+1 Mana per turn on top of your Mana Regen.', mods: { manaRegen: 1 } },
    ] satisfies PassiveDef[]
  ).map((p) => [p.id, p]),
);

export const SCHOOLS: Record<School, { name: string; icon: string }> = {
  fire: { name: 'Fire', icon: '🔥' },
  frost: { name: 'Frost', icon: '❄️' },
  steel: { name: 'Steel', icon: '⚔️' },
  arcane: { name: 'Arcane', icon: '✨' },
  nature: { name: 'Nature', icon: '🌿' },
  tide: { name: 'Tide', icon: '🌊' },
  death: { name: 'Death', icon: '💀' },
  earth: { name: 'Earth', icon: '⛰️' },
  time: { name: 'Time', icon: '⏳' },
};

const loadout = (l: Omit<Loadout, 'abilityIds'> & { abilities: string[] }): Loadout => ({
  id: l.id,
  name: l.name,
  circle: l.circle,
  weapon: l.weapon,
  stats: l.stats,
  abilityIds: l.abilities,
  passiveIds: l.passiveIds,
});

export const DEFAULT_LOADOUTS: Loadout[] = [
  loadout({
    id: 'c1-archmage', name: 'Archmage', circle: 1, weapon: 'staff',
    stats: { hp: 0, maxMana: 4, manaRegen: 1, movespeed: 0 },
    abilities: ['firebolt', 'fireball', 'ward', 'cataclysm'],
    passiveIds: ['wellspring'],
  }),
  loadout({
    id: 'c1-spellblade', name: 'Spellblade', circle: 1, weapon: 'sword',
    stats: { hp: 3, maxMana: 2, manaRegen: 0, movespeed: 1 },
    abilities: ['shield-bash', 'firebolt', 'ice-shards', 'blink', 'ward'],
    passiveIds: ['iron-skin', 'regeneration'],
  }),
  loadout({
    id: 'c2-pyromancer', name: 'Pyromancer', circle: 2, weapon: 'wand',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['firebolt', 'dragons-breath', 'wall-of-fire', 'ward'],
    passiveIds: ['mana-well'],
  }),
  loadout({
    id: 'c2-tidecaller', name: 'Tidecaller', circle: 2, weapon: 'unarmed',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['riptide', 'tidal-wave', 'frost-lance', 'deflect', 'blink'],
    passiveIds: ['regeneration'],
  }),
  loadout({
    id: 'c3-adept', name: 'Adept', circle: 3, weapon: 'unarmed',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['firebolt', 'icicle', 'ward'],
    passiveIds: [],
  }),
  loadout({
    id: 'c3-brawler', name: 'Brawler', circle: 3, weapon: 'spear',
    stats: { hp: 1, maxMana: 1, manaRegen: 0, movespeed: 0 },
    abilities: ['shield-bash', 'haste'],
    passiveIds: [],
  }),
];
