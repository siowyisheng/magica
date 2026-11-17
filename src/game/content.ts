import { PERMANENT, UNLIMITED, type WeaponDef, type WeaponId, type AbilityDef, type AbilityEffect, type Hit, type Loadout, type PassiveDef, type School, type Shape, type Targeting } from './types';

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

/** Portraits a mage can pick, across the archetypes. The first is the default. */
export const MAGE_ICONS: Array<{ icon: string; name: string }> = [
  { icon: '🧙', name: 'Wizard' },
  { icon: '🥷', name: 'Ninja (fast)' },
  { icon: '🤺', name: 'Duelist (warrior mage)' },
  { icon: '🧝', name: 'Ranger (archer)' },
  { icon: '🦸', name: 'Champion (brawler)' },
  { icon: '🧛', name: 'Necromancer' },
  { icon: '🧞', name: 'Genie (arcane)' },
  { icon: '🧜', name: 'Tidecaller' },
  { icon: '🧚', name: 'Fae (nature)' },
  { icon: '🦹', name: 'Rogue (trickster)' },
  { icon: '🤴', name: 'Prince (battle mage)' },
  { icon: '🧟', name: 'Revenant (tank)' },
  { icon: '👺', name: 'Oni (berserker)' },
  { icon: '🐲', name: 'Dragon (fire)' },
];
export const DEFAULT_MAGE_ICON = MAGE_ICONS[0].icon;

type Common = Pick<AbilityDef, 'id' | 'name' | 'icon' | 'school' | 'description' | 'points'> &
  Partial<Pick<AbilityDef, 'fast' | 'cooldown' | 'multi' | 'timing' | 'perTurn' | 'weapon' | 'noLos'>>;

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

const attack = (a: Common & { mana: number; shape: Shape; hit: Hit; instant?: boolean; homing?: boolean }): AbilityDef => {
  const { shape, hit, instant, homing, ...rest } = a;
  return {
    ...rest,
    kind: 'spell',
    effect: { type: 'attack', shape, hit, ...(instant ? { instant } : {}), ...(homing ? { homing } : {}) },
  };
};

/** A Technique that isn't an Attack: costs AP but no Mana. */
const utilityTechnique = (a: Common & { effect: AbilityEffect; targeting: Targeting }): AbilityDef => ({
  ...a,
  kind: 'technique',
  mana: 0,
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
  utilityTechnique({
    id: 'channel-mana', name: 'Channel Mana', icon: '🔮', school: 'arcane', points: 1, cooldown: 2,
    description: 'Gain 2 Mana.',
    targeting: 'self', effect: { type: 'mana', amount: 2 },
  }),

  // --- Reaction Techniques: AP only -----------------------------------
  reactionTechnique({
    id: 'block', name: 'Block', icon: '✋', school: 'steel', points: 3, cooldown: 1,
    description: 'Cooldown 1. Reaction: reduce the damage of the first incoming Attack by 4.',
    targeting: 'self', effect: { type: 'block', amount: 4 },
  }),

  // --- Offensive Spells -------------------------------------------------------
  attack({
    id: 'spark', name: 'Spark', icon: '⚡', school: 'arcane', points: 1, mana: 1, fast: true,
    description: 'Fast: a cheap zap that costs no AP.',
    shape: { kind: 'line', range: 8 }, hit: { damage: 1 },
  }),
  attack({
    id: 'magic-missile', name: 'Magic Missile', icon: '🎯', school: 'arcane', points: 2, mana: 7,
    description: 'Never misses: seeks the enemy within 8, no line of sight needed, and lands in the resolution wherever they have moved.',
    shape: { kind: 'single', range: 8 }, hit: { damage: 6 }, homing: true,
  }),
  attack({
    id: 'firebolt', name: 'Firebolt', icon: '🔥', school: 'fire', points: 2, mana: 2,
    description: 'A bolt of flame down a Line, to any distance. Sets the target burning.',
    shape: { kind: 'line', range: UNLIMITED }, hit: { damage: 4, status: { kind: 'burn', turns: 2, power: 1 } },
  }),
  attack({
    id: 'frost-lance', name: 'Frost Lance', icon: '❄️', school: 'frost', points: 2, mana: 2,
    description: 'An icy Line, to any distance, that slows.',
    shape: { kind: 'line', range: UNLIMITED }, hit: { damage: 4, status: { kind: 'slow', turns: 1, power: 1 } },
  }),
  attack({
    id: 'icicle', name: 'Icicle', icon: '🧊', school: 'frost', points: 2, mana: 2,
    description: 'Drops on any one hex within 7, over rock and all.',
    shape: { kind: 'single', range: 7 }, hit: { damage: 5 },
  }),
  attack({
    id: 'fireball', name: 'Fireball', icon: '💥', school: 'fire', points: 2, mana: 5,
    description: 'Flies toward a hex and explodes there, or sooner on rock or your foe. Aim past your foe in case they dodge.',
    shape: { kind: 'explosiveLine', range: UNLIMITED, radius: 1 }, hit: { damage: 8 },
  }),
  attack({
    id: 'dragons-breath', name: "Dragon's Breath", icon: '🐉', school: 'fire', points: 2, mana: 3,
    description: 'A 60° cone of fire that rock blocks, and leaves everything burning.',
    shape: { kind: 'cone', range: 4 }, hit: { damage: 5, status: { kind: 'burn', turns: 2, power: 1 } },
  }),
  attack({
    id: 'ice-shards', name: 'Ice Shards', icon: '💠', school: 'frost', points: 3, mana: 6,
    description: 'Three icy Lines fanned 30° apart. Slows.',
    shape: { kind: 'fan', range: 4 }, hit: { damage: 2, status: { kind: 'slow', turns: 1, power: 1 } },
  }),
  attack({
    id: 'nova', name: 'Arcane Nova', icon: '🌟', school: 'arcane', points: 2, mana: 7, cooldown: 1,
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
    id: 'soul-drain', name: 'Soul Drain', icon: '👻', school: 'death', points: 2, mana: 10, cooldown: 1,
    description: 'Siphon a soul from one hex within 4, instantly. All damage dealt heals you.',
    shape: { kind: 'single', range: 4 }, hit: { damage: 5, lifesteal: 1 }, instant: true,
  }),
  spell({
    id: 'doom', name: 'Doom', icon: '⚰️', school: 'death', points: 2, mana: 5, noLos: true,
    description:
      'A permanent curse on the enemy within 8, no line of sight needed: you both secretly bid Mana (up to 5). If your bid is at least theirs, they take +4 from every hit for the rest of the match. Both bids are spent.',
    targeting: 'enemy', range: 8, effect: { type: 'contest', maxBid: 5, status: { kind: 'vulnerable', turns: PERMANENT, power: 4 } },
  }),
  spell({
    id: 'stasis', name: 'Stasis', icon: '🕰️', school: 'time', points: 2, mana: 4, fast: true, cooldown: 2,
    description:
      'Fast, cooldown 2 (not on consecutive turns). Freeze the enemy (8 range, line of sight): you both secretly bid Mana (up to 4). If your bid is at least theirs, they can’t Move on their next turn. Both bids are spent.',
    targeting: 'enemy', range: 8, effect: { type: 'contest', maxBid: 4, status: { kind: 'root', turns: 1, power: 0 } },
  }),
  spell({
    id: 'entangle', name: 'Entangle', icon: '🌱', school: 'nature', points: 2, mana: 7, cooldown: 3,
    description: 'Roots erupt around the enemy (5 range, line of sight): they can’t Move for their next 2 turns.',
    targeting: 'enemy', range: 5, effect: { type: 'status', status: { kind: 'root', turns: 2, power: 0 } },
  }),
  spell({
    id: 'hold-person', name: 'Hold Person', icon: '🪢', school: 'arcane', points: 2, mana: 7, cooldown: 4,
    description:
      'Seize the enemy (5 range, line of sight). You both secretly bid Mana (up to 7). If your bid is at least theirs, they can’t Move for their next 3 turns. Both bids are spent.',
    targeting: 'enemy', range: 5, effect: { type: 'contest', maxBid: 7, status: { kind: 'root', turns: 3, power: 0 } },
  }),
  spell({
    id: 'slow', name: 'Slow', icon: '🐢', school: 'time', points: 2, mana: 5, cooldown: 4,
    description:
      'Drain the enemy’s energy (5 range, line of sight). You both secretly bid Mana (up to 5). If your bid is at least theirs, they have 1 fewer AP for their next 3 turns. Both bids are spent.',
    targeting: 'enemy', range: 5, effect: { type: 'contest', maxBid: 5, status: { kind: 'fatigue', turns: 3, power: 1 } },
  }),
  spell({
    id: 'charm', name: 'Charm', icon: '💘', school: 'arcane', points: 2, mana: 5, cooldown: 3,
    description:
      'Enthrall the enemy (6 range, line of sight). You both secretly bid Mana (up to 5). If your bid is at least theirs, on their next turn they skip their Reaction Phase, can’t use Abilities, and spend all their AP and movement walking toward you. Both bids are spent.',
    targeting: 'enemy', range: 6, effect: { type: 'contest', maxBid: 5, status: { kind: 'charm', turns: 1, power: 0 } },
  }),
  spell({
    id: 'fear', name: 'Fear', icon: '😱', school: 'death', points: 2, mana: 5, cooldown: 3,
    description:
      'Terrify the enemy (4 range, line of sight). You both secretly bid Mana (up to 5). If your bid is at least theirs, on their next turn they skip their Reaction Phase, can’t use Abilities, and spend all their AP and movement running directly away from you. Both bids are spent.',
    targeting: 'enemy', range: 4, effect: { type: 'contest', maxBid: 5, status: { kind: 'fear', turns: 1, power: 0 } },
  }),
  spell({
    id: 'sleep', name: 'Sleep', icon: '💤', school: 'arcane', points: 2, mana: 5, cooldown: 4,
    description:
      'Lull the enemy (6 range, line of sight). You both secretly bid Mana (up to 5). If your bid is at least theirs, for their next 2 turns they skip their Reaction Phase and have no AP. Damage wakes them at once, so a hit in the resolution leaves them their normal AP. Both bids are spent.',
    targeting: 'enemy', range: 6, effect: { type: 'contest', maxBid: 5, status: { kind: 'asleep', turns: 2, power: 0 } },
  }),
  spell({
    id: 'magic-armor', name: 'Magic Armor', icon: '🔰', school: 'arcane', points: 2, mana: 4, cooldown: 4,
    description: 'For this turn, your next turn and the one after, every hit deals 4 less damage (but never below 1).',
    targeting: 'self', effect: { type: 'status', status: { kind: 'armored', turns: 3, power: 4 } },
  }),
  attack({
    id: 'lightning-bolt', name: 'Lightning Bolt', icon: '🌩️', school: 'arcane', points: 2, mana: 2, cooldown: 1,
    description: 'A bolt along a Line of 8 that hits everything in it. Anyone it damages loses 1 AP.',
    shape: { kind: 'line', range: 8, pierce: true }, hit: { damage: 4, apLoss: 1 },
  }),
  attack({
    id: 'cold-touch', name: 'Cold Touch', icon: '🥶', school: 'frost', points: 1, mana: 2,
    description: 'A chilling touch on an adjacent hex: whoever is there is slowed (−1 Movespeed) for 3 turns.',
    shape: { kind: 'single', range: 1 }, hit: { damage: 0, status: { kind: 'slow', turns: 3, power: 1 } },
  }),
  attack({
    id: 'meteor', name: 'Meteor', icon: '☄️', school: 'fire', points: 2, mana: 10,
    description: 'A meteor (radius 2) anywhere within 10. Hard to outrun.',
    shape: { kind: 'burst', range: 10, radius: 2 }, hit: { damage: 12 },
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
  icon: l.icon,
  circle: l.circle,
  weapon: l.weapon,
  stats: l.stats,
  abilityIds: l.abilities,
  passiveIds: l.passiveIds,
});

export const DEFAULT_LOADOUTS: Loadout[] = [
  loadout({
    id: 'c1-archmage', name: 'Archmage', icon: '🧙', circle: 1, weapon: 'staff',
    stats: { hp: 0, maxMana: 4, manaRegen: 1, movespeed: 0 },
    abilities: ['firebolt', 'fireball', 'ward', 'magic-missile'],
    passiveIds: ['wellspring'],
  }),
  loadout({
    id: 'c1-spellblade', name: 'Spellblade', icon: '🤺', circle: 1, weapon: 'sword',
    stats: { hp: 3, maxMana: 2, manaRegen: 0, movespeed: 1 },
    abilities: ['firebolt', 'ice-shards', 'blink', 'ward'],
    passiveIds: ['iron-skin', 'regeneration'],
  }),
  loadout({
    id: 'c2-pyromancer', name: 'Pyromancer', icon: '🐲', circle: 2, weapon: 'wand',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['firebolt', 'dragons-breath', 'wall-of-fire', 'ward'],
    passiveIds: ['mana-well'],
  }),
  loadout({
    id: 'c2-tidecaller', name: 'Tidecaller', icon: '🧜', circle: 2, weapon: 'unarmed',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['riptide', 'tidal-wave', 'frost-lance', 'deflect', 'blink'],
    passiveIds: ['regeneration'],
  }),
  loadout({
    id: 'c3-adept', name: 'Adept', icon: '🥷', circle: 3, weapon: 'unarmed',
    stats: { hp: 2, maxMana: 2, manaRegen: 0, movespeed: 0 },
    abilities: ['firebolt', 'icicle', 'ward'],
    passiveIds: [],
  }),
  loadout({
    id: 'c3-brawler', name: 'Brawler', icon: '🦸', circle: 3, weapon: 'spear',
    stats: { hp: 1, maxMana: 1, manaRegen: 0, movespeed: 0 },
    abilities: ['haste', 'channel-mana'],
    passiveIds: [],
  }),
];
