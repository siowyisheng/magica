import { generateBoard, moveCost, spawnFor } from './board';
import { ABILITIES } from './content';
import { distance, equals, key, line, neighbors, type Hex } from './hex';
import { buildUnit } from './loadout';
import {
  other,
  type AbilityDef,
  type Action,
  type GameEvent,
  type GameState,
  type MatchConfig,
  type PlayerId,
  type Status,
  type Unit,
} from './types';

// ---------------------------------------------------------------------------
// The engine is pure and deterministic: (state, action) -> state.
// No clocks, no Math.random. That's what makes replays and spectating trivial:
// a match is just its config + the list of actions.
// ---------------------------------------------------------------------------

export function createGame(config: MatchConfig): GameState {
  const tiles = generateBoard(config.seed, config.radius);
  const units = {
    p1: buildUnit('p1', config.names.p1, config.loadouts.p1, spawnFor('p1', config.radius)),
    p2: buildUnit('p2', config.names.p2, config.loadouts.p2, spawnFor('p2', config.radius)),
  };
  return {
    config,
    turn: 1,
    active: 'p1',
    tiles,
    units,
    events: [{ turn: 1, kind: 'turn', text: `${config.names.p1} takes the first turn.` }],
    winner: null,
  };
}

// --- Queries ---------------------------------------------------------------

/** Hexes the player's unit can move to this turn, with their movement cost. */
export function reachable(state: GameState, player: PlayerId): Map<string, number> {
  const u = state.units[player];
  const blocked = key(state.units[other(player)].pos);
  const best = new Map<string, number>([[key(u.pos), 0]]);
  const frontier: Array<[Hex, number]> = [[u.pos, 0]];
  while (frontier.length) {
    frontier.sort((a, b) => a[1] - b[1]);
    const [cur, cost] = frontier.shift()!;
    if (cost > best.get(key(cur))!) continue;
    for (const n of neighbors(cur)) {
      const k = key(n);
      const tile = state.tiles[k];
      if (!tile || k === blocked) continue;
      const next = cost + moveCost(tile.terrain);
      if (next > u.moveLeft) continue;
      if ((best.get(k) ?? Infinity) <= next) continue;
      best.set(k, next);
      frontier.push([n, next]);
    }
  }
  best.delete(key(u.pos));
  return best;
}

/** Rocks block line of sight. Units and forests don't. */
export function hasLOS(state: GameState, a: Hex, b: Hex): boolean {
  return line(a, b)
    .slice(1, -1)
    .every((h) => state.tiles[key(h)]?.terrain !== 'rock');
}

export const abilityRange = (u: Unit, def: AbilityDef): number =>
  def.targeting === 'self' ? 0 : def.range + u.rangeBonus;

/** Why the player can't cast this ability (at this target), or null if they can. */
export function castError(state: GameState, player: PlayerId, abilityId: string, target?: Hex): string | null {
  if (state.winner) return 'The match is over.';
  if (state.active !== player) return 'Not your turn.';
  const u = state.units[player];
  const slot = u.abilities.find((a) => a.id === abilityId);
  const def = ABILITIES[abilityId];
  if (!slot || !def) return 'Ability not equipped.';
  if (slot.cooldown > 0) return `On cooldown (${slot.cooldown}).`;
  if (u.ap < def.apCost) return 'Not enough AP.';
  if (!target) return null;

  const tile = state.tiles[key(target)];
  if (!tile) return 'Off the board.';
  const enemy = state.units[other(player)];
  const dist = distance(u.pos, target);
  if (def.targeting === 'self') return equals(target, u.pos) ? null : 'Targets yourself.';
  if (dist > abilityRange(u, def)) return 'Out of range.';
  if (def.needsLOS && !hasLOS(state, u.pos, target)) return 'No line of sight.';
  if (def.targeting === 'enemy' && !equals(target, enemy.pos)) return 'Must target the enemy.';
  if (def.effect.type === 'blink') {
    if (dist === 0) return 'Pick another hex.';
    if (tile.terrain === 'rock') return "Can't blink into rock.";
    if (equals(target, enemy.pos)) return 'Hex is occupied.';
  }
  return null;
}

export function validTargets(state: GameState, player: PlayerId, abilityId: string): Hex[] {
  if (castError(state, player, abilityId)) return [];
  return Object.values(state.tiles).filter((t) => castError(state, player, abilityId, t) === null);
}

/** Hexes an ability would hit if cast at `target`. */
export function impactArea(state: GameState, abilityId: string, target: Hex): Hex[] {
  const def = ABILITIES[abilityId];
  if (!def) return [];
  return Object.values(state.tiles).filter((t) => distance(t, target) <= def.aoe);
}

export function actionError(state: GameState, action: Action): string | null {
  if (state.winner) return 'The match is over.';
  if (action.player !== state.active) return 'Not your turn.';
  switch (action.type) {
    case 'move':
      return reachable(state, action.player).has(key(action.to)) ? null : "Can't move there.";
    case 'cast':
      return castError(state, action.player, action.abilityId, action.target);
    case 'endTurn':
      return null;
  }
}

export const hpFraction = (u: Unit) => u.hp / u.maxHp;

// --- Transitions -----------------------------------------------------------

/** Applies an action. Illegal actions return the original state untouched. */
export function applyAction(prev: GameState, action: Action): GameState {
  if (actionError(prev, action)) return prev;
  const state = structuredClone(prev);
  const log = (e: Omit<GameEvent, 'turn'>) => state.events.push({ turn: state.turn, ...e });
  const me = state.units[action.player];

  switch (action.type) {
    case 'move': {
      const cost = reachable(prev, action.player).get(key(action.to))!;
      me.pos = action.to;
      me.moveLeft -= cost;
      log({ kind: 'move', text: `${me.name} moves.`, at: action.to });
      break;
    }
    case 'cast': {
      const def = ABILITIES[action.abilityId];
      me.ap -= def.apCost;
      me.abilities.find((a) => a.id === def.id)!.cooldown = def.cooldown;
      log({ kind: 'cast', text: `${me.name} casts ${def.icon} ${def.name}.`, at: action.target });
      resolveEffect(state, me, def, action.target, log);
      checkWinner(state, log);
      break;
    }
    case 'endTurn': {
      if (action.reason === 'timeout') log({ kind: 'turn', text: `${me.name} ran out of time!` });
      state.turn += 1;
      if (state.turn > state.config.maxTurns) {
        const [a, b] = [hpFraction(state.units.p1), hpFraction(state.units.p2)];
        state.winner = a === b ? 'draw' : a > b ? 'p1' : 'p2';
        log({
          kind: 'victory',
          text: state.winner === 'draw' ? 'Time! The duel ends in a draw.' : `Time! ${state.units[state.winner].name} wins on health.`,
        });
        break;
      }
      state.active = other(action.player);
      startTurn(state, state.active, log);
      checkWinner(state, log);
      break;
    }
  }
  return state;
}

type Log = (e: Omit<GameEvent, 'turn'>) => void;

function resolveEffect(state: GameState, caster: Unit, def: AbilityDef, target: Hex, log: Log) {
  const fx = def.effect;
  switch (fx.type) {
    case 'damage': {
      const victims = Object.values(state.units).filter((u) => distance(u.pos, target) <= def.aoe);
      for (const v of victims) {
        dealDamage(v, fx.amount + caster.power, log);
        if (fx.status && v.hp > 0) addStatus(v, fx.status, log);
      }
      if (victims.length === 0) log({ kind: 'cast', text: '…and hits nothing.' });
      break;
    }
    case 'heal': {
      const amount = Math.min(caster.maxHp - caster.hp, fx.amount + caster.power);
      caster.hp += amount;
      log({ kind: 'heal', text: `${caster.name} heals ${amount}.`, at: caster.pos, amount });
      break;
    }
    case 'shield': {
      const amount = fx.amount + caster.power;
      caster.shield += amount;
      log({ kind: 'status', text: `${caster.name} gains ${amount} shield.`, at: caster.pos, amount });
      break;
    }
    case 'blink':
      caster.pos = target;
      break;
  }
}

function dealDamage(victim: Unit, amount: number, log: Log) {
  const absorbed = Math.min(victim.shield, amount);
  victim.shield -= absorbed;
  const dealt = amount - absorbed;
  victim.hp = Math.max(0, victim.hp - dealt);
  log({
    kind: 'damage',
    text: `${victim.name} takes ${dealt}${absorbed ? ` (${absorbed} blocked)` : ''}.`,
    at: victim.pos,
    amount: dealt,
  });
}

function addStatus(u: Unit, s: Status, log: Log) {
  const existing = u.statuses.find((x) => x.kind === s.kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, s.turns);
    existing.power = Math.max(existing.power, s.power);
  } else u.statuses.push({ ...s });
  log({ kind: 'status', text: `${u.name} is ${STATUS_VERB[s.kind]}.`, at: u.pos });
}

const STATUS_VERB: Record<Status['kind'], string> = { burn: 'burning', slow: 'slowed', root: 'rooted' };

function startTurn(state: GameState, player: PlayerId, log: Log) {
  const u = state.units[player];
  u.shield = 0;
  const slow = u.statuses.find((s) => s.kind === 'slow')?.power ?? 0;
  const rooted = u.statuses.some((s) => s.kind === 'root');
  u.moveLeft = rooted ? 0 : Math.max(0, u.move - slow);
  for (const s of u.statuses) if (s.kind === 'burn') dealDamage(u, s.power, log);
  u.statuses = u.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0);
  for (const a of u.abilities) a.cooldown = Math.max(0, a.cooldown - 1);
  const onRune = state.tiles[key(u.pos)]?.terrain === 'rune';
  u.ap = u.maxAp + (onRune ? 1 : 0);
  log({ kind: 'turn', text: `${u.name}'s turn${onRune ? ' (+1 AP from rune)' : ''}.` });
}

function checkWinner(state: GameState, log: Log) {
  if (state.winner) return;
  const dead1 = state.units.p1.hp <= 0;
  const dead2 = state.units.p2.hp <= 0;
  if (!dead1 && !dead2) return;
  state.winner = dead1 && dead2 ? 'draw' : dead1 ? 'p2' : 'p1';
  log({
    kind: 'victory',
    text: state.winner === 'draw' ? 'Both champions fall. Draw!' : `${state.units[state.winner].name} is victorious!`,
  });
}

/** Rebuild a state from scratch. Used by replays and spectators. */
export function replay(config: MatchConfig, actions: Action[], upTo = actions.length): GameState {
  let s = createGame(config);
  for (let i = 0; i < upTo && i < actions.length; i++) s = applyAction(s, actions[i]);
  return s;
}
