import type { Hex } from './hex';

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
export const other = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

export type Terrain = 'plain' | 'forest' | 'rock' | 'rune';

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

export type AbilityEffect =
  | {
      type: 'damage';
      /** 0 = status-only (no hit, power not added). */
      amount: number;
      status?: Status;
      /** Fraction of damage dealt to enemies returned to the caster as healing. */
      lifesteal?: number;
      /** Hexes each victim is shoved away from the caster. Negative = pulled toward. */
      knockback?: number;
    }
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

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  school: School;
  description: string;
  apCost: number;
  /**
   * Own turns until ready again, ticking down at the start of your turn.
   * 0 = recast freely in the same turn, 1 = once per turn, 2 = skip a turn, ...
   */
  cooldown: number;
  range: number;
  targeting: Targeting;
  needsLOS: boolean;
  /** Radius of splash around the target hex. 0 = single target. Hits everyone, including you… */
  aoe: number;
  /** …unless this is set. */
  spareCaster?: boolean;
  effect: AbilityEffect;
}

export interface StatMods {
  hp?: number;
  ap?: number;
  move?: number;
  power?: number;
  range?: number;
  /** Flat reduction to every damage instance (minimum 1 still lands). */
  armor?: number;
  /** HP restored at the start of each of your turns. */
  regen?: number;
}

export interface ArchetypeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  hp: number;
  ap: number;
  move: number;
  abilitySlots: number;
  relicSlots: number;
  /** Thematic school; the builder suggests abilities from it. */
  school: School;
  armor?: number;
  regen?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  mods: StatMods;
}

export interface Loadout {
  id: string;
  name: string;
  archetypeId: string;
  abilityIds: string[];
  relicIds: string[];
}

export interface AbilityState {
  id: string;
  cooldown: number;
}

export interface Unit {
  owner: PlayerId;
  name: string;
  archetypeId: string;
  pos: Hex;
  hp: number;
  maxHp: number;
  shield: number;
  ap: number;
  maxAp: number;
  move: number;
  moveLeft: number;
  /** Bonus added to every damage/heal/shield effect. */
  power: number;
  /** Bonus added to every ability range (except self-target). */
  rangeBonus: number;
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

export interface GameState {
  config: MatchConfig;
  /** Increments on every end of turn. A "round" is two turns. */
  turn: number;
  active: PlayerId;
  tiles: Record<string, Tile>;
  units: Record<PlayerId, Unit>;
  events: GameEvent[];
  winner: PlayerId | 'draw' | null;
}

export type Action =
  | { type: 'move'; player: PlayerId; to: Hex }
  | { type: 'cast'; player: PlayerId; abilityId: string; target: Hex }
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
