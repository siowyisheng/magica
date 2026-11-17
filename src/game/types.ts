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
 * disarmed: the weapon is out of use (see Weapon): weapon techniques and weapon bonuses are lost. Unarmed mages can't be disarmed.
 * fatigue: starts each turn with `power` fewer AP.
 * armored: takes `power` less damage from every hit (never below 1).
 * charm / fear: the next turn skips the Reaction Phase, no Abilities, and the mage spends all their movement
 *   walking toward (charm) or away from (fear) the other mage.
 * asleep: skips the Reaction Phase and has no AP. Taking damage wakes the mage at once.
 */
export type StatusKind = 'burn' | 'poison' | 'slow' | 'root' | 'vulnerable' | 'disarmed' | 'fatigue' | 'armored' | 'charm' | 'fear' | 'asleep';

export interface Status {
  kind: StatusKind;
  /** Owner-turns remaining. */
  turns: number;
  /** DoT damage per tick, move removed by slow, or bonus damage taken while vulnerable. */
  power: number;
}

/** A range so long that it never limits an aim: the board edge, Rock or line of sight do. Hidden in the UI. */
export const UNLIMITED = 99;
/** A status with this many turns never wears off. */
export const PERMANENT = 999;

/** The geometry of an Attack's Threat Area. */
export type Shape =
  /** `pierce`: hits every mage along the Line; otherwise only the first one it reaches. */
  | { kind: 'line'; range: number; pierce?: boolean }
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
  /** AP the victim loses from the turn this lands in, if it hits for at least 1 damage. */
  apLoss?: number;
}

export type AbilityEffect =
  /** Offensive: becomes a pending Attack that resolves after the defender's Reaction Phase. */
  | {
      type: 'attack';
      shape: Shape;
      hit: Hit;
      /** Lands the moment it is cast: no Reaction Phase, so it can't be dodged. */
      instant?: boolean;
      /** Aimed at the enemy mage, not a hex: it lands on them wherever they have moved to. */
      homing?: boolean;
    }
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
  /** Reaction: reduce the damage of the first incoming Attack. */
  | { type: 'block'; amount: number }
  /** Your Techniques deal `bonus` more damage for the rest of this turn. */
  | { type: 'empower'; bonus: number }
  /** Turn an empty hex into Rock. */
  | { type: 'pillar' }
  /** Extra Movement Points this turn. */
  | { type: 'haste'; move: number }
  /**
   * Contested: casting opens a secret bid of Mana between caster and target. The status lands if the
   * caster's bid is at least the target's; both bids are spent either way. A bid can't be more than
   * `maxBid`.
   */
  | { type: 'contest'; maxBid: number; status: Status }
  /** Gain Mana (up to Max Mana). */
  | { type: 'mana'; amount: number }
  /** Puts a status straight on the target (the caster for a `self` Ability, otherwise the enemy). */
  | { type: 'status'; status: Status };

/**
 * For non-Attack Abilities. self: cast on yourself. tile: an empty hex within range.
 * enemy: the other mage, within range and in line of sight.
 */
export type Targeting = 'self' | 'tile' | 'enemy';

export type School = 'fire' | 'frost' | 'steel' | 'arcane' | 'nature' | 'tide' | 'death' | 'earth' | 'time';

export type AbilityKind = 'spell' | 'technique';

export interface AbilityDef {
  id: string;
  kind: AbilityKind;
  /** Loadout Points to include this Ability in a Loadout. */
  points: number;
  /** Mana per cast. Spells always cost some; Techniques never do. */
  mana: number;
  /** Fast Abilities cost no AP and, unless `multi`, can be used once per turn. Everything else costs exactly 1 AP, in the Reaction Phase too. */
  fast?: boolean;
  /** A Fast Ability that can be used any number of times a turn. */
  multi?: boolean;
  /** A weapon technique: only mages carrying this weapon can have it, and it can't be used while disarmed. */
  weapon?: WeaponId;
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
  /** At most this many uses per turn. Unset: once for a Fast Ability (unless `multi`), otherwise unlimited. */
  perTurn?: number;
  /** After a use, can't be used again until this many of the caster's turns later: 2 means every other turn. */
  cooldown?: number;
  /** Targeting the enemy doesn't need line of sight. */
  noLos?: boolean;
  effect: AbilityEffect;
}

export type WeaponId = 'unarmed' | 'staff' | 'wand' | 'sword' | 'spear' | 'bow';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  description: string;
  /** Loadout Points to carry it. */
  points: number;
  /** Mana Regen it adds (lost while disarmed). */
  manaRegen?: number;
  /** A Technique that comes free with the weapon, in the first slot. */
  defaultTechnique?: string;
  /** Can't cast Spells while disarmed. */
  spellsNeedWeapon?: boolean;
  /** Unarmed mages have nothing to take away. */
  disarmable: boolean;
}

/** Which of a mage's stats a Loadout can buy steps of. */
export type StatKey = 'hp' | 'maxMana' | 'manaRegen' | 'movespeed';

/** A mage's rank. Sets the Loadout Point budget: First 30, Second 20, Third 10. */
export type Circle = 1 | 2 | 3;

export interface Loadout {
  id: string;
  name: string;
  /** The mage's portrait emoji (see MAGE_ICONS). Older saved loadouts have none. */
  icon?: string;
  circle: Circle;
  /** Steps bought above base, per stat. */
  stats: Record<StatKey, number>;
  /** Exactly one weapon (Unarmed included). */
  weapon: WeaponId;
  /** Up to 8 Abilities in all, counting the weapon's default Technique, which is added for you and not listed here. */
  abilityIds: string[];
  passiveIds: string[];
}

/** Always-on effects a Passive grants. Add a field here (and handle it) to support new kinds of Passive. */
export interface PassiveMods {
  /** Every hit taken is reduced by this much (minimum 1 still lands). */
  armor?: number;
  /** HP restored at the start of your turn. */
  regen?: number;
  /** Extra Mana regained each turn, on top of the Mana Regen stat. */
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
  /** Uses so far this turn, for Abilities with `perTurn`. Reset at the start of each own turn. */
  uses: number;
  /** Own turns left before this Ability is ready again (see `AbilityDef.cooldown`). Unset or 0: ready. */
  cooldown?: number;
}

export interface Mage {
  owner: PlayerId;
  name: string;
  icon: string;
  circle: Circle;
  weapon: WeaponId;
  pos: Hex;
  hp: number;
  maxHp: number;
  shield: number;
  ap: number;
  /** The most Mana the mage can hold. */
  maxMana: number;
  mana: number;
  movespeed: number;
  /** Movement Points left this turn. Bought with AP: Movespeed points per AP. */
  mp: number;
  armor: number;
  regen: number;
  /** Mana regained at the start of each own turn after the first: the Mana Regen stat plus passives. */
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
  | { kind: 'result'; winner: PlayerId | 'draw' }
  /** A contested Spell was cast and the secret bidding opened. */
  | { kind: 'bidStart'; abilityId: string }
  /** Bids were revealed: the contested effect landed on `target`, or was Resisted. */
  | { kind: 'contest'; abilityId: string; success: boolean; target: PlayerId; bids: Record<PlayerId, number> };

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
  /** Hits the enemy mage wherever they are when it lands, ignoring `area`. */
  homing?: boolean;
  /** Sent back by a Deflect. Reactions can't target it (one layer of response only). */
  reflected?: boolean;
  /** Damage taken off this Attack by Block. */
  blocked?: number;
}

/**
 * A secret Mana bid for a contested Spell, settled by commit-and-reveal: each duellist first sends only
 * a hash of (bid, salt), and the amounts are revealed and checked once the window closes. Nothing here
 * can reveal a bid before then.
 */
export interface Bidding {
  id: number;
  abilityId: string;
  caster: PlayerId;
  target: PlayerId;
  /** 'commit': hashes are coming in. 'reveal': both bid (or the window ran out); amounts are being revealed. */
  stage: 'commit' | 'reveal';
  commits: Partial<Record<PlayerId, string>>;
  /** Checked, valid bids (an overbid or no-show counts as 0). */
  reveals: Partial<Record<PlayerId, number>>;
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
  /** An open secret bid for a contested Spell. While set, only bid actions are allowed. */
  bidding: Bidding | null;
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
  | { type: 'endTurn'; player: PlayerId; reason?: 'timeout' }
  /** Send a commitment: SHA-256 of `${biddingId}|${player}|${amount}|${salt}` (see bidCommitment). */
  | { type: 'commitBid'; player: PlayerId; hash: string }
  /** The bidding window ran out before both bid. Anyone who hasn't committed bids 0. */
  | { type: 'closeBidding'; player: PlayerId }
  /** Reveal a committed bid; it must match the commitment. */
  | { type: 'revealBid'; player: PlayerId; amount: number; salt: string }
  /** The reveal deadline passed. Anyone who hasn't revealed bids 0. */
  | { type: 'revealTimeout'; player: PlayerId };

export interface MatchConfig {
  seed: number;
  radius: number;
  turnSeconds: number;
  /** After this many turns the match ends; highest HP % wins. */
  maxTurns: number;
  loadouts: Record<PlayerId, Loadout>;
  names: Record<PlayerId, string>;
  /** Free Movement Rules variant: Movespeed in Movement Points at the start of every Action Phase. Absent in older matches (off). */
  freeMovement?: boolean;
}

/** Everything needed to reproduce a match exactly. Matches are deterministic. */
export interface MatchRecord {
  id: string;
  createdAt: number;
  config: MatchConfig;
  actions: Action[];
}
