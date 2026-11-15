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

/** The geometry of an Attack's Threat Area. */
export type Shape =
  | { kind: 'line'; range: number }
  | { kind: 'single'; range: number }
  | { kind: 'meleeArc' }
  | { kind: 'burst'; range: number; radius: number }
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
  | { type: 'shield'; amount: number }
  | { type: 'blink' }
  /** Swap positions with the target unit. */
  | { type: 'swap' }
  /** Pay HP (cannot kill you) to gain AP this turn. */
  | { type: 'sacrifice'; hp: number; ap: number }
  /** Remove all your statuses and heal. */
  | { type: 'cleanse'; heal: number }
  /** Gain extra move points this turn. */
  | { type: 'haste'; move: number }
  /** Reduce your other abilities' cooldowns. */
  | { type: 'refresh'; amount: number }
  /** Permanently change the target hex's terrain. */
  | { type: 'terraform'; terrain: Terrain };

/** self: caster's own hex. enemy: a hex holding the opponent. tile: any hex in range. */
export type Targeting = 'self' | 'enemy' | 'tile';

export type School =
  | 'fire'
  | 'frost'
  | 'steel'
  | 'arcane'
  | 'nature'
  | 'blood'
  | 'tide'
  | 'death'
  | 'earth'
  | 'shadow'
  | 'holy'
  | 'time';

export type AbilityKind = 'spell' | 'technique';

export interface AbilityDef {
  id: string;
  kind: AbilityKind;
  /** Loadout Points to include this Ability in a Loadout. */
  points: number;
  /** Mana per cast. Spells always cost some; Techniques never do. */
  mana: number;
  name: string;
  icon: string;
  school: School;
  description: string;
  /** Fast Spells cost no AP. Everything else costs exactly 1 AP (0 when cast as a reaction). */
  fast?: boolean;
  /**
   * When it can be cast. 'reaction' = Reaction Spell (Reaction Phase only, 0 AP).
   * 'both' = defensive Spell that also works proactively in the Action Phase (for AP). Default 'action'.
   */
  timing?: 'action' | 'reaction' | 'both';
  /**
   * Own turns until ready again, ticking down at the start of your turn.
   * 0 = recast freely in the same turn, 1 = once per turn, 2 = skip a turn, ...
   */
  cooldown: number;
  range: number;
  targeting: Targeting;
  needsLOS: boolean;
  /** Radius of splash around the target hex. 0 = single target. */
  aoe: number;
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

export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Loadout Points to include this Passive. */
  points: number;
}

export interface AbilityState {
  id: string;
  cooldown: number;
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
  abilities: AbilityState[];
  statuses: Status[];
}

export type GameEventKind = 'move' | 'cast' | 'damage' | 'heal' | 'status' | 'turn' | 'victory';

export interface GameEvent {
  turn: number;
  kind: GameEventKind;
  text: string;
  /** Hex the event happened at, for floating combat text. */
  at?: Hex;
  amount?: number;
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
