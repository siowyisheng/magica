import type { Hex } from './hex';

export type PlayerId = 'p1' | 'p2';
export const PLAYERS: readonly PlayerId[] = ['p1', 'p2'];
export const other = (p: PlayerId): PlayerId => (p === 'p1' ? 'p2' : 'p1');

export type Terrain = 'plain' | 'forest' | 'rock' | 'rune';

export interface Tile extends Hex {
  terrain: Terrain;
}

export type StatusKind = 'burn' | 'slow' | 'root';

export interface Status {
  kind: StatusKind;
  /** Owner-turns remaining. */
  turns: number;
  /** Burn damage per tick, or move points removed by slow. */
  power: number;
}

export type AbilityEffect =
  | { type: 'damage'; amount: number; status?: Status }
  | { type: 'heal'; amount: number }
  | { type: 'shield'; amount: number }
  | { type: 'blink' };

/** self: caster's own hex. enemy: a hex holding the opponent. tile: any hex in range. */
export type Targeting = 'self' | 'enemy' | 'tile';

export type School = 'fire' | 'frost' | 'steel' | 'arcane' | 'nature';

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
  /** Radius of splash around the target hex. 0 = single target. Hits everyone, including you. */
  aoe: number;
  effect: AbilityEffect;
}

export interface StatMods {
  hp?: number;
  ap?: number;
  move?: number;
  power?: number;
  range?: number;
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
