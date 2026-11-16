import type { Hex } from './hex';

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
export const other = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

export type Terrain = 'plain' | 'rock';

export interface Tile extends Hex {
  terrain: Terrain;
}

/**
 * burn / poison: damage each turn. slow: −move. root: no movement.
 * vulnerable: takes +power damage from every hit.
 */
export type StatusKind = 'burn' | 'poison' | 'slow' | 'root' | 'vulnerable';

export interface Status {
  kind: StatusKind;
  /** Owner-turns remaining. */
  turns: number;
  /** DoT damage per tick, move removed by slow, or bonus damage taken while vulnerable. */
  power: number;
}

/** A range so long that it never limits an aim: the board edge, Rock or line of sight do. Hidden in the UI. */
export const UNLIMITED = 99;

/** The geometry of an Attack's Threat Area. */
export type Shape =
  | { kind: 'line'; range: number }
  /** `los`: the hex must be in line of sight (no Rock between). */
  | { kind: 'single'; range: number; los?: boolean }
  | { kind: 'meleeArc' }
  | { kind: 'burst'; range: number; radius: number }
  /** Flies toward the aimed hex and Bursts on the enemy if they are in its way, else where the flight ends (the hex, or before Rock). */
  | { kind: 'explosiveLine'; range: number; radius: number }
  | { kind: 'cone'; range: number }
  | { kind: 'fan'; range: number }
  | { kind: 'selfBurst'; radius: number }
  /** Drawn freely by the caster: `length` connected hexes, the first within `range`. */
  | { kind: 'wall'; range: number; length: number };

/** What an Attack does to each mage standing in its Threat Area when it resolves. */
export interface Hit {
  /** 0 = status-only. */
  damage: number;
  status?: Status;
  /** Fraction of damage dealt to the other mage returned to the caster as healing. */
  lifesteal?: number;
  /** Hexes each victim is shoved away from where the Attack was launched. Negative = pulled toward. */
  knockback?: number;
}

export type AbilityEffect =
  /** Offensive: becomes a pending Attack that resolves after the defender's Reaction Phase. */
  | { type: 'attack'; shape: Shape; hit: Hit }
  /** Reaction, targeted: cancel one incoming Spell (not Techniques). */
  | { type: 'counter' }
  /** Reaction, targeted: cancel one incoming Line and send it back at the attacker. */
  | { type: 'deflect' }
  | { type: 'heal'; amount: number }
  /** Absorbs damage until the end of your next resolution. */
  | { type: 'shield'; amount: number }
  /** Teleport to an empty hex within `range`. */
  | { type: 'blink' }
  /** Walk to an empty hex within `range` hexes, going round Rock and the other mage. */
  | { type: 'step' }
  /** Reaction: reduce the damage of the first incoming Attack. */
  | { type: 'block'; amount: number }
  /** Your Techniques deal `bonus` more damage for the rest of this turn. */
  | { type: 'empower'; bonus: number }
  /** Turn an empty hex into Rock. */
  | { type: 'pillar' }
  /** Extra Movement Points this turn. */
  | { type: 'haste'; move: number };

/** For non-Attack Abilities. self: cast on yourself. tile: an empty hex within range. */
export type Targeting = 'self' | 'tile';

export type School = 'fire' | 'frost' | 'steel' | 'arcane' | 'nature' | 'tide' | 'death' | 'earth' | 'time';

export type AbilityKind = 'spell' | 'technique';

export interface AbilityDef {
  id: string;
  kind: AbilityKind;
  /** Loadout Points to include this Ability in a Loadout. */
  points: number;
  /** Mana per cast. Spells always cost some; Techniques never do. */
  mana: number;
  /** Fast Spells cost no AP. Everything else costs exactly 1 AP, in the Reaction Phase too. */
  fast?: boolean;
  /**
   * When it can be used. 'reaction' = Reaction ability (Reaction Phase only).
   * 'both' = also works proactively in the Action Phase. Default 'action'.
   */
  timing?: 'action' | 'reaction' | 'both';
  name: string;
  icon: string;
  school: School;
  description: string;
  /** Non-Attack Abilities only (Attacks aim with their Shape). */
  targeting?: Targeting;
  range?: number;
  effect: AbilityEffect;
}

/** Which of a mage's stats a Loadout can buy steps of. */
export type StatKey = 'hp' | 'magic' | 'movespeed';

/** A mage's rank. Sets the Loadout Point budget: First 30, Second 20, Third 10. */
export type Circle = 1 | 2 | 3;

export interface Loadout {
  id: string;
  name: string;
  circle: Circle;
  /** Steps bought above base, per stat. */
  stats: Record<StatKey, number>;
  /** Up to 8 Abilities; Staff Strike is always first. */
  abilityIds: string[];
  passiveIds: string[];
}

/** Always-on effects a Passive grants. Add a field here (and handle it) to support new kinds of Passive. */
export interface PassiveMods {
  /** Every hit taken is reduced by this much (minimum 1 still lands). */
  armor?: number;
  /** HP restored at the start of your turn. */
  regen?: number;
  /** Extra Mana regained each turn, on top of Magic. */
  manaRegen?: number;
  /** Absorb Mana yields this fraction more (0.5 = +50%). */
  absorbBonus?: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Loadout Points to include this Passive. */
  points: number;
  mods: PassiveMods;
}

export interface AbilityState {
  id: string;
}

export interface Mage {
  owner: PlayerId;
  name: string;
  circle: Circle;
  pos: Hex;
  hp: number;
  maxHp: number;
  shield: number;
  ap: number;
  magic: number;
  mana: number;
  movespeed: number;
  /** Movement Points left this turn. Bought with AP: Movespeed points per AP. */
  mp: number;
  armor: number;
  regen: number;
  manaRegen: number;
  absorbBonus: number;
  /** Bonus damage on Techniques launched this turn (Empower). Cleared when the turn ends. */
  empower: number;
  passiveIds: string[];
  abilities: AbilityState[];
  statuses: Status[];
}

export type GameEventKind = 'move' | 'cast' | 'damage' | 'heal' | 'status' | 'turn' | 'victory';

/**
 * What a sound effect needs to know about an event. The engine records these and stays silent itself;
 * the UI decides how each one sounds.
 */
export type Cue =
  /** An instant Spell or Reaction was used. */
  | { kind: 'cast'; abilityId: string }
  /** An Attack was launched. */
  | { kind: 'launch'; abilityId: string }
  /** An Attack landed at Resolution, whether or not it found anyone. */
  | { kind: 'resolve'; abilityId: string }
  /** A mage lost `amount` HP to an Attack's Hit. */
  | { kind: 'damage'; amount: number }
  /** A Hit took no HP because a shield or Block absorbed it. */
  | { kind: 'absorbed' }
  /** A mage walked `hexes` hexes. */
  | { kind: 'move'; hexes: number }
  | { kind: 'crystalAbsorb'; size: CrystalSize }
  | { kind: 'crystalReady'; size: CrystalSize }
  | { kind: 'actionStart'; player: PlayerId }
  | { kind: 'reactionStart'; player: PlayerId }
  | { kind: 'result'; winner: PlayerId | 'draw' };

export interface GameEvent {
  turn: number;
  kind: GameEventKind;
  /** Shown in the event log. Empty for events that only carry a cue. */
  text: string;
  cue?: Cue;
  /** Hex the event happened at, for floating combat text. */
  at?: Hex;
  amount?: number;
  /** For a Move: who walked, and the hexes walked through, from where they started to where they ended. */
  player?: PlayerId;
  path?: Hex[];
}

export type CrystalSize = 'large' | 'small';
/** Spawning → Almost Ready → Ready, one step per round. Only Ready crystals can be absorbed. */
export type CrystalState = 'spawning' | 'almostReady' | 'ready';

export interface Crystal {
  size: CrystalSize;
  pos: Hex;
  state: CrystalState;
}

export interface PendingAttack {
  id: number;
  caster: PlayerId;
  abilityId: string;
  /** Where the caster stood when launching; knockback pushes away from here. */
  origin: Hex;
  /** Threat Area as hex keys, fixed at launch. */
  area: string[];
  hit: Hit;
  /** Sent back by a Deflect. Reactions can't target it (one layer of response only). */
  reflected?: boolean;
  /** Damage taken off this Attack by Block. */
  blocked?: number;
}

/** Reaction Phase happens only when Attacks are pending against the active mage. */
export type Phase = 'reaction' | 'action';

export interface GameState {
  config: MatchConfig;
  /** Increments on every end of turn. A "round" is two turns. */
  turn: number;
  active: PlayerId;
  tiles: Record<string, Tile>;
  mages: Record<PlayerId, Mage>;
  crystals: Crystal[];
  phase: Phase;
  /** Launched Attacks waiting to resolve, in launch order. */
  pending: PendingAttack[];
  nextAttackId: number;
  /** Seeded PRNG state for in-match randomness (crystal placement). */
  rng: number;
  events: GameEvent[];
  winner: PlayerId | 'draw' | null;
}

export type Action =
  | { type: 'move'; player: PlayerId; to: Hex }
  /** `attackId` picks the incoming Attack for targeted Reaction Spells. */
  | { type: 'cast'; player: PlayerId; abilityId: string; target: Hex; attackId?: number; path?: Hex[] }
  | { type: 'absorb'; player: PlayerId }
  /** Finish the Reaction Phase: pending Attacks resolve, then the Action Phase begins. */
  | { type: 'endReaction'; player: PlayerId; reason?: 'timeout' }
  | { type: 'endTurn'; player: PlayerId; reason?: 'timeout' };

export interface MatchConfig {
  seed: number;
  radius: number;
  turnSeconds: number;
  /** After this many turns the match ends; highest HP % wins. */
  maxTurns: number;
  loadouts: Record<PlayerId, Loadout>;
  names: Record<PlayerId, string>;
}

/** Everything needed to reproduce a match exactly. Matches are deterministic. */
export interface MatchRecord {
  id: string;
  createdAt: number;
  config: MatchConfig;
  actions: Action[];
}
