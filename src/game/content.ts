import type { AbilityDef, Loadout, PassiveDef, School, Shape, Status } from './types';

// ---------------------------------------------------------------------------
// Content tables. Add new abilities / archetypes / relics here; the loadout
// builder, engine and AI pick them up automatically.
// ---------------------------------------------------------------------------

export const STAFF_STRIKE = 'staff-strike';

/** Techniques from the original ability set (physical, no Mana once Mana exists). */
const INTERIM_TECHNIQUES = new Set(['cleave', 'quick-stab', 'backstab', 'boulder-toss']);

/** The original set's damage effect, converted into an Attack by `priced`. */
type LegacyDamage = { type: 'damage'; amount: number; status?: Status; lifesteal?: number; knockback?: number };

/** `apCost` is the original set's cost, now only used as a weight for interim prices. */
type RawAbility = Omit<AbilityDef, 'kind' | 'points' | 'mana' | 'effect'> &
  Partial<Pick<AbilityDef, 'kind' | 'points' | 'mana'>> & {
    apCost: number;
    effect: AbilityDef['effect'] | LegacyDamage;
  };

/** Interim: re-express an original damage ability as an Attack with a Threat Area shape. */
function legacyShape(a: RawAbility): Shape {
  if (a.targeting === 'self') return { kind: 'burst', range: 0, radius: Math.max(1, a.aoe) };
  if (a.targeting === 'tile') return { kind: 'burst', range: a.range, radius: Math.max(1, a.aoe) };
  if (a.range <= 1) return { kind: 'meleeArc' };
  return a.needsLOS ? { kind: 'line', range: a.range } : { kind: 'single', range: a.range };
}

/**
 * Interim pricing for the original ability set until the new catalogue lands.
 * Points: AP cost, +1 for area effects. Mana: 2 per AP, +2 per AoE radius.
 */
const priced = (a: RawAbility): AbilityDef => {
  const kind = a.kind ?? (INTERIM_TECHNIQUES.has(a.id) ? 'technique' : 'spell');
  const { apCost, effect, ...rest } = a;
  return {
    ...rest,
    effect:
      effect.type === 'damage'
        ? {
            type: 'attack',
            shape: legacyShape(a),
            hit: { damage: effect.amount, status: effect.status, lifesteal: effect.lifesteal, knockback: effect.knockback },
          }
        : effect,
    kind,
    fast: a.fast ?? apCost === 0,
    points: a.points ?? Math.max(1, apCost) + (a.aoe > 0 ? 1 : 0),
    mana: kind === 'technique' ? 0 : (a.mana ?? Math.max(1, 2 * apCost + 2 * a.aoe)),
  };
};

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  (
    [
      {
        id: STAFF_STRIKE, name: 'Staff Strike', icon: '🪄', school: 'steel', kind: 'technique', points: 0, mana: 0,
        description: 'A plain whack with your staff. Every mage has it.',
        apCost: 1, cooldown: 0, range: 1, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 2 },
      },
      {
        id: 'firebolt', name: 'Firebolt', icon: '🔥', school: 'fire',
        description: 'Hurl a bolt of flame. Sets the target burning.',
        apCost: 2, cooldown: 1, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3, status: { kind: 'burn', turns: 2, power: 1 } },
      },
      {
        id: 'meteor', name: 'Meteor', icon: '☄️', school: 'fire',
        description: 'Call down a meteor on any hex. Splashes everyone nearby — including you.',
        apCost: 3, cooldown: 3, range: 5, targeting: 'tile', needsLOS: false, aoe: 1,
        effect: { type: 'damage', amount: 4 },
      },
      {
        id: 'frost-lance', name: 'Frost Lance', icon: '❄️', school: 'frost',
        description: 'A long-range shard that slows the target.',
        apCost: 2, cooldown: 1, range: 5, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 2, status: { kind: 'slow', turns: 1, power: 2 } },
      },
      {
        id: 'glacial-snare', name: 'Glacial Snare', icon: '🧊', school: 'frost',
        description: 'Freeze the ground under your enemy. Roots them for a turn.',
        apCost: 2, cooldown: 3, range: 3, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 1, status: { kind: 'root', turns: 1, power: 0 } },
      },
      {
        id: 'cleave', name: 'Cleave', icon: '🪓', school: 'steel',
        description: 'A brutal melee strike.',
        apCost: 2, cooldown: 0, range: 1, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 4 },
      },
      {
        id: 'quick-stab', name: 'Quick Stab', icon: '🗡️', school: 'steel',
        description: 'A cheap jab. Spam it.',
        apCost: 1, cooldown: 0, range: 1, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 2 },
      },
      {
        id: 'blink', name: 'Blink', icon: '✨', school: 'arcane', timing: 'both',
        description: 'Teleport to an empty hex. Ignores terrain. Works as a reaction, too.',
        apCost: 1, cooldown: 2, range: 3, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'blink' },
      },
      {
        id: 'ward', name: 'Ward', icon: '🛡️', school: 'arcane', timing: 'both', points: 2, mana: 4,
        description: 'A shield that absorbs damage from every attack in your next resolution. Cast it as a reaction, or ahead of time for 1 AP.',
        apCost: 1, cooldown: 0, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'shield', amount: 4 },
      },
      {
        id: 'counterspell', name: 'Counterspell', icon: '🚫', school: 'arcane', timing: 'reaction', points: 3, mana: 6,
        description: 'Reaction: cancel one incoming Spell. Useless against Techniques.',
        apCost: 1, cooldown: 0, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'counter' },
      },
      {
        id: 'deflect', name: 'Deflect', icon: '🪞', school: 'arcane', timing: 'reaction', points: 3, mana: 5,
        description: 'Reaction: turn one incoming Line around and send it back at the attacker.',
        apCost: 1, cooldown: 0, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'deflect' },
      },
      {
        id: 'mend', name: 'Mend', icon: '🌿', school: 'nature',
        description: 'Restore health.',
        apCost: 2, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'heal', amount: 4 },
      },
      {
        id: 'thorn-volley', name: 'Thorn Volley', icon: '🌵', school: 'nature',
        description: 'Spray thorns over an area. No line of sight needed.',
        apCost: 2, cooldown: 1, range: 4, targeting: 'tile', needsLOS: false, aoe: 1,
        effect: { type: 'damage', amount: 3 },
      },
      // --- Shapes showcase -----------------------------------------------
      {
        id: 'fireball', name: 'Fireball', icon: '💥', school: 'fire', points: 4, mana: 9,
        description: 'A bolt that flies in a Line and explodes where it stops.',
        apCost: 1, cooldown: 0, range: 5, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'attack', shape: { kind: 'explosiveLine', range: 5, radius: 1 }, hit: { damage: 4 } },
      },
      {
        id: 'dragons-breath', name: "Dragon's Breath", icon: '🐉', school: 'fire', points: 4, mana: 8,
        description: 'A 60° cone of fire that sets everything in it burning.',
        apCost: 1, cooldown: 0, range: 3, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'attack', shape: { kind: 'cone', range: 3 }, hit: { damage: 3, status: { kind: 'burn', turns: 2, power: 1 } } },
      },
      {
        id: 'ice-shards', name: 'Ice Shards', icon: '💠', school: 'frost', points: 3, mana: 5,
        description: 'Three icy Lines fanned 30° apart. Hard to stand between.',
        apCost: 1, cooldown: 0, range: 4, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'attack', shape: { kind: 'fan', range: 4 }, hit: { damage: 2, status: { kind: 'slow', turns: 1, power: 1 } } },
      },
      {
        id: 'nova', name: 'Arcane Nova', icon: '🌟', school: 'arcane', points: 3, mana: 7,
        description: 'Detonate everything within 2 of you. Step out before it lands!',
        apCost: 1, cooldown: 0, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'attack', shape: { kind: 'selfBurst', radius: 2 }, hit: { damage: 4 } },
      },
      {
        id: 'wall-of-fire', name: 'Wall of Fire', icon: '♨️', school: 'fire', points: 4, mana: 8,
        description: 'Draw a 5-hex wall of flame anywhere you like. Burns whoever is caught in it.',
        apCost: 1, cooldown: 0, range: 4, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'attack', shape: { kind: 'wall', range: 4, length: 5 }, hit: { damage: 3, status: { kind: 'burn', turns: 2, power: 1 } } },
      },

      // --- Blood · Bloodreaver -------------------------------------------
      {
        id: 'blood-lash', name: 'Blood Lash', icon: '🩸', school: 'blood',
        description: 'A whip of blood. Half the damage dealt heals you.',
        apCost: 2, cooldown: 1, range: 2, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3, lifesteal: 0.5 },
      },
      {
        id: 'crimson-pact', name: 'Crimson Pact', icon: '💉', school: 'blood',
        description: 'Pay 3 HP to gain 2 AP this turn. Free to cast.',
        apCost: 0, cooldown: 3, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'sacrifice', hp: 3, ap: 2 },
      },
      {
        id: 'exsanguinate', name: 'Exsanguinate', icon: '🫀', school: 'blood',
        description: 'Tear the life out of an adjacent foe. All damage dealt heals you.',
        apCost: 3, cooldown: 2, range: 1, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 4, lifesteal: 1 },
      },

      // --- Tide · Tidecaller ---------------------------------------------
      {
        id: 'riptide', name: 'Riptide', icon: '🪝', school: 'tide',
        description: 'A current that drags the enemy 2 hexes toward you.',
        apCost: 2, cooldown: 1, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 2, knockback: -2 },
      },
      {
        id: 'tidal-wave', name: 'Tidal Wave', icon: '🌊', school: 'tide',
        description: 'A crashing wave that shoves enemies 2 hexes away. Slamming into rock or the arena edge hurts.',
        apCost: 3, cooldown: 2, range: 3, targeting: 'tile', needsLOS: false, aoe: 1,
        effect: { type: 'damage', amount: 3, knockback: 2 },
      },
      {
        id: 'cleansing-rain', name: 'Cleansing Rain', icon: '🌧️', school: 'tide',
        description: 'Wash away every status on you and heal.',
        apCost: 2, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'cleanse', heal: 3 },
      },

      // --- Death · Gravebinder -------------------------------------------
      {
        id: 'soul-drain', name: 'Soul Drain', icon: '👻', school: 'death',
        description: 'Siphon a soul. All damage dealt heals you.',
        apCost: 2, cooldown: 1, range: 3, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3, lifesteal: 1 },
      },
      {
        id: 'plague', name: 'Plague', icon: '🦠', school: 'death',
        description: 'A miasma that poisons everyone in the area for 3 turns, you included. No line of sight needed.',
        apCost: 2, cooldown: 2, range: 4, targeting: 'tile', needsLOS: false, aoe: 1,
        effect: { type: 'damage', amount: 1, status: { kind: 'poison', turns: 3, power: 1 } },
      },
      {
        id: 'doom', name: 'Doom', icon: '⚰️', school: 'death',
        description: 'Curse the enemy from anywhere. For 2 turns they take +2 damage from every hit.',
        apCost: 2, cooldown: 3, range: 6, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 0, status: { kind: 'vulnerable', turns: 2, power: 2 } },
      },

      // --- Earth · Geomancer ---------------------------------------------
      {
        id: 'raise-earth', name: 'Raise Earth', icon: '🧱', school: 'earth',
        description: 'Raise a permanent rock pillar on an empty hex. Blocks movement and line of sight.',
        apCost: 1, cooldown: 2, range: 3, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'terraform', terrain: 'rock' },
      },
      {
        id: 'boulder-toss', name: 'Boulder Toss', icon: '🥌', school: 'earth',
        description: 'Hurl a boulder that knocks the enemy back 1 hex.',
        apCost: 2, cooldown: 1, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3, knockback: 1 },
      },
      {
        id: 'tremor', name: 'Tremor', icon: '🌋', school: 'earth',
        description: 'Shake the ground around you (radius 2). Damages and slows.',
        apCost: 3, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 2,
        effect: { type: 'damage', amount: 3, status: { kind: 'slow', turns: 1, power: 1 } },
      },

      // --- Shadow · Shadowblade ------------------------------------------
      {
        id: 'shadow-swap', name: 'Shadow Swap', icon: '🌀', school: 'shadow',
        description: 'Trade places with the enemy.',
        apCost: 1, cooldown: 3, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'swap' },
      },
      {
        id: 'mark-for-death', name: 'Mark for Death', icon: '🎯', school: 'shadow',
        description: 'Mark the enemy. For 2 turns they take +2 damage from every hit.',
        apCost: 1, cooldown: 3, range: 5, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 0, status: { kind: 'vulnerable', turns: 2, power: 2 } },
      },
      {
        id: 'backstab', name: 'Backstab', icon: '🔪', school: 'shadow',
        description: 'A precise, deadly melee strike.',
        apCost: 2, cooldown: 0, range: 1, targeting: 'enemy', needsLOS: false, aoe: 0,
        effect: { type: 'damage', amount: 3 },
      },

      // --- Holy · Lightbringer -------------------------------------------
      {
        id: 'smite', name: 'Smite', icon: '🔱', school: 'holy',
        description: 'Strike with holy light at short range.',
        apCost: 2, cooldown: 0, range: 2, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3 },
      },
      {
        id: 'purify', name: 'Purify', icon: '🕊️', school: 'holy',
        description: 'Cleanse every status on you and heal.',
        apCost: 2, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'cleanse', heal: 4 },
      },
      {
        id: 'radiant-nova', name: 'Radiant Nova', icon: '☀️', school: 'holy',
        description: 'Explode with light, burning everything adjacent.',
        apCost: 3, cooldown: 3, range: 0, targeting: 'self', needsLOS: false, aoe: 1,
        effect: { type: 'damage', amount: 4, status: { kind: 'burn', turns: 1, power: 1 } },
      },

      // --- Time · Chronomancer -------------------------------------------
      {
        id: 'haste', name: 'Haste', icon: '⏩', school: 'time',
        description: 'Speed up time around you: +3 move this turn.',
        apCost: 1, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'haste', move: 3 },
      },
      {
        id: 'temporal-bolt', name: 'Temporal Bolt', icon: '⏳', school: 'time',
        description: 'A bolt of slowed time.',
        apCost: 2, cooldown: 0, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 3, status: { kind: 'slow', turns: 1, power: 1 } },
      },
      {
        id: 'stasis', name: 'Stasis', icon: '🕰️', school: 'time',
        description: 'Freeze the enemy in time. They cannot move next turn.',
        apCost: 2, cooldown: 3, range: 3, targeting: 'enemy', needsLOS: true, aoe: 0,
        effect: { type: 'damage', amount: 0, status: { kind: 'root', turns: 1, power: 0 } },
      },
      {
        id: 'rewind', name: 'Rewind', icon: '⏪', school: 'time',
        description: 'Turn back the clock: your other cooldowns tick down by 2.',
        apCost: 1, cooldown: 4, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'refresh', amount: 2 },
      },
    ] satisfies RawAbility[]
  ).map((a) => [a.id, priced(a)]),
);

export const PASSIVES: Record<string, PassiveDef> = Object.fromEntries(
  (
    [
      { id: 'mana-well', name: 'Mana Well', icon: '🏺', points: 3, description: 'Absorb Mana gives +50%.', mods: { absorbBonus: 0.5 } },
      { id: 'iron-skin', name: 'Iron Skin', icon: '🪨', points: 3, description: 'Every hit you take is 1 lower (but at least 1).', mods: { armor: 1 } },
      { id: 'regeneration', name: 'Regeneration', icon: '✚', points: 3, description: '+1 HP at the start of your turn.', mods: { regen: 1 } },
      { id: 'wellspring', name: 'Wellspring', icon: '⛲', points: 4, description: '+1 Mana per turn on top of Magic.', mods: { manaRegen: 1 } },
    ] satisfies PassiveDef[]
  ).map((p) => [p.id, p]),
);

export const SCHOOLS: Record<School, { name: string; icon: string }> = {
  fire: { name: 'Fire', icon: '🔥' },
  frost: { name: 'Frost', icon: '❄️' },
  steel: { name: 'Steel', icon: '⚔️' },
  arcane: { name: 'Arcane', icon: '✨' },
  nature: { name: 'Nature', icon: '🌿' },
  blood: { name: 'Blood', icon: '🩸' },
  tide: { name: 'Tide', icon: '🌊' },
  death: { name: 'Death', icon: '💀' },
  earth: { name: 'Earth', icon: '⛰️' },
  shadow: { name: 'Shadow', icon: '🌑' },
  holy: { name: 'Holy', icon: '☀️' },
  time: { name: 'Time', icon: '⏳' },
};

const loadout = (l: Omit<Loadout, 'abilityIds'> & { abilities: string[] }): Loadout => ({
  id: l.id,
  name: l.name,
  circle: l.circle,
  stats: l.stats,
  abilityIds: [STAFF_STRIKE, ...l.abilities],
  passiveIds: l.passiveIds,
});

export const DEFAULT_LOADOUTS: Loadout[] = [
  loadout({ id: 'c1-archmage', name: 'Archmage', circle: 1, stats: { hp: 3, magic: 2, movespeed: 0 }, abilities: ['firebolt', 'meteor', 'frost-lance', 'ward', 'counterspell', 'blink', 'mend'], passiveIds: [] }),
  loadout({ id: 'c1-warlord', name: 'Battlemage', circle: 1, stats: { hp: 4, magic: 0, movespeed: 1 }, abilities: ['cleave', 'quick-stab', 'glacial-snare', 'blood-lash', 'mend'], passiveIds: [] }),
  loadout({ id: 'c2-pyro', name: 'Pyromancer', circle: 2, stats: { hp: 2, magic: 1, movespeed: 0 }, abilities: ['firebolt', 'meteor', 'blink', 'ward'], passiveIds: [] }),
  loadout({ id: 'c2-stalker', name: 'Stalker', circle: 2, stats: { hp: 2, magic: 0, movespeed: 1 }, abilities: ['frost-lance', 'quick-stab', 'thorn-volley'], passiveIds: [] }),
  loadout({ id: 'c3-adept', name: 'Adept', circle: 3, stats: { hp: 2, magic: 0, movespeed: 0 }, abilities: ['firebolt', 'blink'], passiveIds: [] }),
  loadout({ id: 'c3-brawler', name: 'Brawler', circle: 3, stats: { hp: 3, magic: 0, movespeed: 0 }, abilities: ['quick-stab', 'mend'], passiveIds: [] }),
];
