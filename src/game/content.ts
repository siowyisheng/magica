import type { AbilityDef, ArchetypeDef, Loadout, RelicDef } from './types';

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
        apCost: 2, cooldown: 0, range: 4, targeting: 'enemy', needsLOS: true, aoe: 0,
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
        effect: { type: 'damage', amount: 5 },
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
        effect: { type: 'damage', amount: 2 },
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
        hp: 24, ap: 4, move: 3, abilitySlots: 3, relicSlots: 2,
      },
      {
        id: 'arcanist', name: 'Arcanist', icon: '🔮',
        description: 'Glass cannon with a deep spellbook.',
        hp: 16, ap: 5, move: 3, abilitySlots: 4, relicSlots: 2,
      },
      {
        id: 'stalker', name: 'Stalker', icon: '🏹',
        description: 'Fast skirmisher. Hit, run, repeat.',
        hp: 18, ap: 4, move: 4, abilitySlots: 3, relicSlots: 3,
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
    ] satisfies RelicDef[]
  ).map((r) => [r.id, r]),
);

export const DEFAULT_LOADOUTS: Loadout[] = [
  { id: 'default-pyro', name: 'Pyromancer', archetypeId: 'arcanist', abilityIds: ['firebolt', 'meteor', 'blink', 'arcane-ward'], relicIds: ['ember-sigil', 'heartstone'] },
  { id: 'default-bruiser', name: 'Bruiser', archetypeId: 'warden', abilityIds: ['cleave', 'glacial-snare', 'mend'], relicIds: ['haste-boots', 'heartstone'] },
  { id: 'default-ranger', name: 'Thornranger', archetypeId: 'stalker', abilityIds: ['frost-lance', 'thorn-volley', 'quick-stab'], relicIds: ['eagle-eye', 'haste-boots', 'focus-crystal'] },
];
