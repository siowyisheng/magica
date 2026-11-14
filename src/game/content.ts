import type { AbilityDef, ArchetypeDef, Loadout, RelicDef, School } from './types';

// ---------------------------------------------------------------------------
// Content tables. Add new abilities / archetypes / relics here; the loadout
// builder, engine and AI pick them up automatically.
// ---------------------------------------------------------------------------

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  (
    [
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
        id: 'blink', name: 'Blink', icon: '✨', school: 'arcane',
        description: 'Teleport to an empty hex. Ignores terrain.',
        apCost: 1, cooldown: 2, range: 3, targeting: 'tile', needsLOS: false, aoe: 0,
        effect: { type: 'blink' },
      },
      {
        id: 'arcane-ward', name: 'Arcane Ward', icon: '🛡️', school: 'arcane',
        description: 'Gain a shield that absorbs damage until your next turn.',
        apCost: 1, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 0,
        effect: { type: 'shield', amount: 4 },
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
        description: 'A crashing wave that shoves enemies 2 hexes away. Slamming into rock or the arena edge hurts. Spares you.',
        apCost: 3, cooldown: 2, range: 3, targeting: 'tile', needsLOS: false, aoe: 1, spareCaster: true,
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
        description: 'Shake the ground around you (radius 2). Damages and slows. Spares you.',
        apCost: 3, cooldown: 2, range: 0, targeting: 'self', needsLOS: false, aoe: 2, spareCaster: true,
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
        description: 'Explode with light, burning everything adjacent. Spares you.',
        apCost: 3, cooldown: 3, range: 0, targeting: 'self', needsLOS: false, aoe: 1, spareCaster: true,
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
    ] satisfies AbilityDef[]
  ).map((a) => [a.id, a]),
);

export const ARCHETYPES: Record<string, ArchetypeDef> = Object.fromEntries(
  (
    [
      {
        id: 'warden', name: 'Warden', icon: '🛡️',
        description: 'Tough frontliner. Lots of HP, fewer tricks.',
        hp: 24, ap: 4, move: 3, abilitySlots: 3, relicSlots: 2, school: 'steel',
      },
      {
        id: 'arcanist', name: 'Arcanist', icon: '🔮',
        description: 'Glass cannon with a deep spellbook.',
        hp: 16, ap: 5, move: 3, abilitySlots: 4, relicSlots: 2, school: 'arcane',
      },
      {
        id: 'stalker', name: 'Stalker', icon: '🏹',
        description: 'Fast skirmisher. Hit, run, repeat.',
        hp: 18, ap: 4, move: 4, abilitySlots: 3, relicSlots: 3, school: 'nature',
      },
      {
        id: 'bloodreaver', name: 'Bloodreaver', icon: '🧛',
        description: 'Blood mage. Trades life for power and heals by hurting.',
        hp: 22, ap: 4, move: 3, abilitySlots: 3, relicSlots: 2, school: 'blood',
      },
      {
        id: 'tidecaller', name: 'Tidecaller', icon: '🧜',
        description: 'Controls the battlefield with currents: drags, shoves, cleanses.',
        hp: 20, ap: 5, move: 3, abilitySlots: 4, relicSlots: 2, school: 'tide',
      },
      {
        id: 'gravebinder', name: 'Gravebinder', icon: '💀',
        description: 'Necromancer who rots foes from afar and drinks their souls.',
        hp: 16, ap: 5, move: 3, abilitySlots: 3, relicSlots: 2, school: 'death', regen: 1,
      },
      {
        id: 'geomancer', name: 'Geomancer', icon: '⛰️',
        description: 'Slow, armored stone-shaper who reshapes the arena itself.',
        hp: 24, ap: 4, move: 2, abilitySlots: 3, relicSlots: 2, school: 'earth', armor: 1,
      },
      {
        id: 'shadowblade', name: 'Shadowblade', icon: '🥷',
        description: 'Fragile assassin. Marks, swaps in, and stabs.',
        hp: 15, ap: 4, move: 4, abilitySlots: 3, relicSlots: 3, school: 'shadow',
      },
      {
        id: 'lightbringer', name: 'Lightbringer', icon: '😇',
        description: 'Radiant paladin who shrugs off curses and outlasts.',
        hp: 22, ap: 4, move: 3, abilitySlots: 3, relicSlots: 2, school: 'holy', regen: 1,
      },
      {
        id: 'chronomancer', name: 'Chronomancer', icon: '🧙',
        description: 'Bends time: extra movement, frozen enemies, faster cooldowns.',
        hp: 17, ap: 5, move: 3, abilitySlots: 4, relicSlots: 2, school: 'time',
      },
    ] satisfies ArchetypeDef[]
  ).map((a) => [a.id, a]),
);

export const RELICS: Record<string, RelicDef> = Object.fromEntries(
  (
    [
      { id: 'ember-sigil', name: 'Ember Sigil', icon: '🔆', description: '+1 power to all effects.', mods: { power: 1 } },
      { id: 'haste-boots', name: 'Boots of Haste', icon: '👢', description: '+1 move.', mods: { move: 1 } },
      { id: 'heartstone', name: 'Heartstone', icon: '❤️', description: '+5 max HP.', mods: { hp: 5 } },
      { id: 'focus-crystal', name: 'Focus Crystal', icon: '💎', description: '+1 AP per turn, −3 max HP.', mods: { ap: 1, hp: -3 } },
      { id: 'eagle-eye', name: 'Eagle Eye', icon: '🦅', description: '+1 range on targeted abilities.', mods: { range: 1 } },
      // Blood
      { id: 'blood-chalice', name: 'Blood Chalice', icon: '🍷', description: 'Regenerate 1 HP per turn, +2 max HP.', mods: { regen: 1, hp: 2 } },
      { id: 'ravenous-fang', name: 'Ravenous Fang', icon: '🦷', description: '+1 power, −2 max HP.', mods: { power: 1, hp: -2 } },
      // Tide
      { id: 'coral-mail', name: 'Coral Mail', icon: '🪸', description: '+1 armor, −1 move.', mods: { armor: 1, move: -1 } },
      { id: 'conch-of-currents', name: 'Conch of Currents', icon: '🐚', description: '+1 range, +2 max HP.', mods: { range: 1, hp: 2 } },
      // Death
      { id: 'phylactery', name: 'Phylactery', icon: '⚱️', description: '+6 max HP, −1 move.', mods: { hp: 6, move: -1 } },
      { id: 'lich-candle', name: 'Lich Candle', icon: '🕯️', description: '+1 AP, −1 move.', mods: { ap: 1, move: -1 } },
      // Earth
      { id: 'granite-heart', name: 'Granite Heart', icon: '🗿', description: '+1 armor.', mods: { armor: 1 } },
      { id: 'obsidian-edge', name: 'Obsidian Edge', icon: '🔺', description: '+2 power, −1 range.', mods: { power: 2, range: -1 } },
      // Shadow
      { id: 'cloak-of-shadows', name: 'Cloak of Shadows', icon: '🧥', description: '+1 move, +1 range.', mods: { move: 1, range: 1 } },
      { id: 'nightshade-vial', name: 'Nightshade Vial', icon: '🧪', description: '+2 power, −4 max HP.', mods: { power: 2, hp: -4 } },
      // Holy
      { id: 'halo', name: 'Halo', icon: '💫', description: 'Regenerate 1 HP per turn.', mods: { regen: 1 } },
      { id: 'sacred-plate', name: 'Sacred Plate', icon: '🪖', description: '+1 armor, +3 max HP, −1 move.', mods: { armor: 1, hp: 3, move: -1 } },
      // Time
      { id: 'chrono-lens', name: 'Chrono Lens', icon: '🔭', description: '+1 range, +1 move.', mods: { range: 1, move: 1 } },
      { id: 'sands-of-time', name: 'Sands of Time', icon: '⌛', description: '+1 AP, −3 max HP.', mods: { ap: 1, hp: -3 } },
    ] satisfies RelicDef[]
  ).map((r) => [r.id, r]),
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

export const DEFAULT_LOADOUTS: Loadout[] = [
  { id: 'default-pyro', name: 'Pyromancer', archetypeId: 'arcanist', abilityIds: ['firebolt', 'meteor', 'blink', 'arcane-ward'], relicIds: ['ember-sigil', 'heartstone'] },
  { id: 'default-bruiser', name: 'Bruiser', archetypeId: 'warden', abilityIds: ['cleave', 'glacial-snare', 'mend'], relicIds: ['haste-boots', 'heartstone'] },
  { id: 'default-ranger', name: 'Thornranger', archetypeId: 'stalker', abilityIds: ['frost-lance', 'thorn-volley', 'quick-stab'], relicIds: ['eagle-eye', 'haste-boots', 'heartstone'] },
  { id: 'default-reaver', name: 'Sanguine Duelist', archetypeId: 'bloodreaver', abilityIds: ['blood-lash', 'crimson-pact', 'exsanguinate'], relicIds: ['blood-chalice', 'ravenous-fang'] },
  { id: 'default-tide', name: 'Maelstrom', archetypeId: 'tidecaller', abilityIds: ['riptide', 'tidal-wave', 'cleansing-rain', 'frost-lance'], relicIds: ['conch-of-currents', 'heartstone'] },
  { id: 'default-grave', name: 'Plaguelord', archetypeId: 'gravebinder', abilityIds: ['soul-drain', 'plague', 'doom'], relicIds: ['phylactery', 'lich-candle'] },
  { id: 'default-geo', name: 'Mountain', archetypeId: 'geomancer', abilityIds: ['raise-earth', 'boulder-toss', 'tremor'], relicIds: ['haste-boots', 'heartstone'] },
  { id: 'default-shadow', name: 'Nightblade', archetypeId: 'shadowblade', abilityIds: ['shadow-swap', 'mark-for-death', 'backstab'], relicIds: ['cloak-of-shadows', 'nightshade-vial', 'heartstone'] },
  { id: 'default-light', name: 'Dawnguard', archetypeId: 'lightbringer', abilityIds: ['smite', 'purify', 'radiant-nova'], relicIds: ['halo', 'sacred-plate'] },
  { id: 'default-chrono', name: 'Timeweaver', archetypeId: 'chronomancer', abilityIds: ['haste', 'temporal-bolt', 'stasis', 'rewind'], relicIds: ['chrono-lens', 'sands-of-time'] },
];
