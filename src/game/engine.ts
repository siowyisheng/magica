import { generateBoard, moveCost, spawnFor } from './board';
import { advanceCrystals, crystalAt, crystalYield, initialCrystals, respawnCrystal } from './crystals';
import { ABILITIES } from './content';
import { distance, equals, key, line, neighbors, toPixel, type Hex } from './hex';
import { buildMage } from './loadout';
import {
  other,
  type AbilityDef,
  type Action,
  type GameEvent,
  type GameState,
  type MatchConfig,
  type PlayerId,
  type Status,
  type Mage,
} from './types';

// ---------------------------------------------------------------------------
// The engine is pure and deterministic: (state, action) -> state.
// No clocks, no Math.random. That's what makes replays and spectating trivial:
// a match is just its config + the list of actions.
// ---------------------------------------------------------------------------

export function createGame(config: MatchConfig): GameState {
  const tiles = generateBoard(config.seed, config.radius);
  const mages = {
    p1: buildMage('p1', config.names.p1, config.loadouts.p1, spawnFor('p1', config.radius)),
    p2: buildMage('p2', config.names.p2, config.loadouts.p2, spawnFor('p2', config.radius)),
  };
  // Going second is a disadvantage: P2 starts with one extra turn of regen.
  mages.p2.mana = Math.min(maxMana(mages.p2), mages.p2.mana + mages.p2.magic);
  const state: GameState = {
    config,
    turn: 1,
    active: 'p1',
    tiles,
    mages,
    crystals: [],
    rng: (config.seed ^ 0x9e3779b9) >>> 0,
    events: [{ turn: 1, kind: 'turn', text: `${config.names.p1} takes the first turn.` }],
    winner: null,
  };
  state.crystals = initialCrystals(state);
  return state;
}

// --- Queries ---------------------------------------------------------------

export const AP_PER_TURN = 2;

export const apCost = (def: AbilityDef): number => (def.fast ? 0 : 1);

/** Movement Points one AP buys right now: Movespeed, less any slow; none while rooted. */
export function mpPerAp(m: Mage): number {
  if (m.statuses.some((s) => s.kind === 'root')) return 0;
  const slow = m.statuses.find((s) => s.kind === 'slow')?.power ?? 0;
  return Math.max(0, m.movespeed - slow);
}

/** Total hexes the mage could still walk this turn, spending all remaining AP on movement. */
export const moveBudget = (m: Mage): number => m.mp + m.ap * mpPerAp(m);

/** AP a Move of `cost` hexes would spend (0 if leftover Movement Points cover it). */
export function apForMove(m: Mage, cost: number): number {
  if (cost <= m.mp) return 0;
  const per = mpPerAp(m);
  return per > 0 ? Math.ceil((cost - m.mp) / per) : Infinity;
}

/** Hexes the player's mage can move to this turn, with their movement cost. */
export function reachable(state: GameState, player: PlayerId): Map<string, number> {
  const u = state.mages[player];
  const budget = moveBudget(u);
  const blocked = key(state.mages[other(player)].pos);
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
      if (next > budget) continue;
      if ((best.get(k) ?? Infinity) <= next) continue;
      best.set(k, next);
      frontier.push([n, next]);
    }
  }
  best.delete(key(u.pos));
  return best;
}

/** Rocks block line of sight. Mages don't. */
export function hasLOS(state: GameState, a: Hex, b: Hex): boolean {
  return line(a, b)
    .slice(1, -1)
    .every((h) => state.tiles[key(h)]?.terrain !== 'rock');
}

export const abilityRange = (_mage: Mage, def: AbilityDef): number =>
  def.targeting === 'self' ? 0 : Math.max(1, def.range);

/** Why the player can't cast this ability (at this target), or null if they can. */
export function castError(state: GameState, player: PlayerId, abilityId: string, target?: Hex): string | null {
  if (state.winner) return 'The match is over.';
  if (state.active !== player) return 'Not your turn.';
  const u = state.mages[player];
  const slot = u.abilities.find((a) => a.id === abilityId);
  const def = ABILITIES[abilityId];
  if (!slot || !def) return 'Ability not equipped.';
  if (slot.cooldown > 0) return `On cooldown (${slot.cooldown}).`;
  if (u.ap < apCost(def)) return 'Not enough AP.';
  if (u.mana < def.mana) return 'Not enough Mana.';
  if (def.effect.type === 'sacrifice' && u.hp <= def.effect.hp) return 'Not enough HP.';
  if (!target) return null;

  const tile = state.tiles[key(target)];
  if (!tile) return 'Off the board.';
  const enemy = state.mages[other(player)];
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
  if (def.effect.type === 'terraform') {
    if (equals(target, enemy.pos) || equals(target, u.pos)) return 'Hex is occupied.';
    if (tile.terrain === def.effect.terrain) return 'Already that terrain.';
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
    case 'absorb':
      return absorbError(state, action.player);
    case 'endTurn':
      return null;
  }
}

export const maxMana = (m: Mage) => 10 * m.magic;

/** A round is one turn by each mage. */
export const round = (state: GameState) => Math.ceil(state.turn / 2);

export function absorbError(state: GameState, player: PlayerId): string | null {
  if (state.winner) return 'The match is over.';
  if (state.active !== player) return 'Not your turn.';
  const m = state.mages[player];
  const c = crystalAt(state, m.pos);
  if (!c) return 'Stand on a Mana Crystal to absorb it.';
  if (c.state !== 'ready') return 'That crystal is not Ready yet.';
  if (m.ap < 1) return 'Not enough AP.';
  return null;
}

export const hpFraction = (u: Mage) => u.hp / u.maxHp;

// --- Transitions -----------------------------------------------------------

/** Applies an action. Illegal actions return the original state untouched. */
export function applyAction(prev: GameState, action: Action): GameState {
  if (actionError(prev, action)) return prev;
  const state = structuredClone(prev);
  const log = (e: Omit<GameEvent, 'turn'>) => state.events.push({ turn: state.turn, ...e });
  const me = state.mages[action.player];

  switch (action.type) {
    case 'move': {
      const cost = reachable(prev, action.player).get(key(action.to))!;
      const spend = apForMove(me, cost);
      me.ap -= spend;
      me.mp += spend * mpPerAp(me) - cost;
      me.pos = action.to;
      log({ kind: 'move', text: `${me.name} moves.`, at: action.to });
      break;
    }
    case 'cast': {
      const def = ABILITIES[action.abilityId];
      me.ap -= apCost(def);
      me.mana -= def.mana;
      me.abilities.find((a) => a.id === def.id)!.cooldown = def.cooldown;
      log({ kind: 'cast', text: `${me.name} casts ${def.icon} ${def.name}.`, at: action.target });
      resolveEffect(state, me, def, action.target, log);
      checkWinner(state, log);
      break;
    }
    case 'absorb': {
      const c = crystalAt(state, me.pos)!;
      const gained = Math.min(maxMana(me) - me.mana, crystalYield(c, round(state)));
      me.ap -= 1;
      me.mana += gained;
      log({ kind: 'heal', text: `${me.name} absorbs ${gained} Mana from the ${c.size} crystal.`, at: me.pos });
      respawnCrystal(state, c);
      break;
    }
    case 'endTurn': {
      if (action.reason === 'timeout') log({ kind: 'turn', text: `${me.name} ran out of time!` });
      // Statuses last through the owner's turn (slow and root are read live while moving).
      me.statuses = me.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0);
      state.turn += 1;
      if (state.turn > state.config.maxTurns) {
        const [a, b] = [hpFraction(state.mages.p1), hpFraction(state.mages.p2)];
        state.winner = a === b ? 'draw' : a > b ? 'p1' : 'p2';
        log({
          kind: 'victory',
          text: state.winner === 'draw' ? 'Time! The duel ends in a draw.' : `Time! ${state.mages[state.winner].name} wins on health.`,
        });
        break;
      }
      state.active = other(action.player);
      if (state.active === 'p1') advanceCrystals(state); // a new round begins
      startTurn(state, state.active, log);
      checkWinner(state, log);
      break;
    }
  }
  return state;
}

type Log = (e: Omit<GameEvent, 'turn'>) => void;

function resolveEffect(state: GameState, caster: Mage, def: AbilityDef, target: Hex, log: Log) {
  const fx = def.effect;
  const enemy = state.mages[other(caster.owner)];
  switch (fx.type) {
    case 'damage': {
      const victims = Object.values(state.mages).filter(
        (u) => distance(u.pos, target) <= def.aoe && !(def.spareCaster && u.owner === caster.owner),
      );
      let stolen = 0;
      for (const v of victims) {
        if (fx.amount > 0) {
          const dealt = dealDamage(v, fx.amount, log);
          if (v.owner !== caster.owner) stolen += dealt;
        }
        if (fx.status && v.hp > 0) addStatus(v, fx.status, log);
        if (fx.knockback && v.owner !== caster.owner && v.hp > 0) knockback(state, caster, v, fx.knockback, log);
      }
      if (fx.lifesteal && stolen > 0 && caster.hp > 0) heal(caster, Math.floor(stolen * fx.lifesteal), log);
      if (victims.length === 0) log({ kind: 'cast', text: '…and hits nothing.' });
      break;
    }
    case 'heal':
      heal(caster, fx.amount, log);
      break;
    case 'shield': {
      const amount = fx.amount;
      caster.shield += amount;
      log({ kind: 'status', text: `${caster.name} gains ${amount} shield.`, at: caster.pos, amount });
      break;
    }
    case 'blink':
      caster.pos = target;
      break;
    case 'swap':
      [caster.pos, enemy.pos] = [enemy.pos, caster.pos];
      log({ kind: 'move', text: `${caster.name} and ${enemy.name} trade places.`, at: caster.pos });
      break;
    case 'sacrifice':
      caster.hp -= fx.hp;
      caster.ap += fx.ap;
      log({ kind: 'damage', text: `${caster.name} pays ${fx.hp} HP for ${fx.ap} AP.`, at: caster.pos, amount: fx.hp });
      break;
    case 'cleanse':
      if (caster.statuses.length) log({ kind: 'status', text: `${caster.name} is cleansed.` });
      caster.statuses = [];
      heal(caster, fx.heal, log);
      break;
    case 'haste':
      caster.mp += fx.move;
      log({ kind: 'status', text: `${caster.name} gains ${fx.move} Movement Points.` });
      break;
    case 'refresh':
      for (const a of caster.abilities) if (a.id !== def.id) a.cooldown = Math.max(0, a.cooldown - fx.amount);
      log({ kind: 'status', text: `${caster.name} rewinds their cooldowns.` });
      break;
    case 'terraform':
      state.tiles[key(target)].terrain = fx.terrain;
      log({ kind: 'cast', text: `The ground becomes ${fx.terrain}.`, at: target });
      break;
  }
}

function heal(u: Mage, amount: number, log: Log) {
  const healed = Math.max(0, Math.min(u.maxHp - u.hp, amount));
  if (healed <= 0) return;
  u.hp += healed;
  log({ kind: 'heal', text: `${u.name} heals ${healed}.`, at: u.pos, amount: healed });
}

const COLLISION_DAMAGE = 2;

/** Shove `victim` |n| hexes away from (n > 0) or toward (n < 0) the caster. */
function knockback(state: GameState, caster: Mage, victim: Mage, n: number, log: Log) {
  const push = n > 0;
  const origin = toPixel(caster.pos, 1);
  let moved = 0;
  for (let i = 0; i < Math.abs(n); i++) {
    const cur = victim.pos;
    const d0 = distance(cur, caster.pos);
    if (!push && d0 <= 1) break;
    // Ideal next point: one step along the caster→victim ray (or its reverse).
    const p = toPixel(cur, 1);
    const len = Math.hypot(p.x - origin.x, p.y - origin.y) || 1;
    const dir = push ? 1 : -1;
    const ideal = { x: p.x + (dir * Math.sqrt(3) * (p.x - origin.x)) / len, y: p.y + (dir * Math.sqrt(3) * (p.y - origin.y)) / len };
    let best: Hex | null = null;
    let bestErr = Infinity;
    for (const nb of neighbors(cur)) {
      if (distance(nb, caster.pos) !== d0 + dir) continue;
      const q = toPixel(nb, 1);
      const err = Math.hypot(q.x - ideal.x, q.y - ideal.y);
      if (err < bestErr - 1e-9) {
        bestErr = err;
        best = nb;
      }
    }
    const tile = best && state.tiles[key(best)];
    const blocked = !best || !tile || tile.terrain === 'rock' || equals(best, caster.pos);
    if (blocked) {
      if (push) {
        log({ kind: 'damage', text: `${victim.name} slams into an obstacle!` });
        dealDamage(victim, COLLISION_DAMAGE, log);
      }
      break;
    }
    victim.pos = best!;
    moved++;
  }
  if (moved) log({ kind: 'move', text: `${victim.name} is ${push ? 'knocked back' : 'pulled in'}.`, at: victim.pos });
}

/** Applies vulnerable + armor + shield. Returns HP actually lost. */
function dealDamage(victim: Mage, amount: number, log: Log): number {
  const vuln = victim.statuses.find((s) => s.kind === 'vulnerable')?.power ?? 0;
  let total = amount + vuln;
  if (victim.armor > 0) total = Math.max(1, total - victim.armor);
  const absorbed = Math.min(victim.shield, total);
  victim.shield -= absorbed;
  const dealt = Math.min(victim.hp, total - absorbed);
  victim.hp -= dealt;
  log({
    kind: 'damage',
    text: `${victim.name} takes ${dealt}${absorbed ? ` (${absorbed} blocked)` : ''}.`,
    at: victim.pos,
    amount: dealt,
  });
  return dealt;
}

function addStatus(u: Mage, s: Status, log: Log) {
  const existing = u.statuses.find((x) => x.kind === s.kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, s.turns);
    existing.power = Math.max(existing.power, s.power);
  } else u.statuses.push({ ...s });
  log({ kind: 'status', text: `${u.name} is ${STATUS_VERB[s.kind]}.`, at: u.pos });
}

const STATUS_VERB: Record<Status['kind'], string> = {
  burn: 'burning',
  poison: 'poisoned',
  slow: 'slowed',
  root: 'rooted',
  vulnerable: 'vulnerable',
};

function startTurn(state: GameState, player: PlayerId, log: Log) {
  const u = state.mages[player];
  u.shield = 0;
  // Each mage's first turn is turn 1 (P1) or 2 (P2); regen starts after that.
  if (state.turn > 2) u.mana = Math.min(maxMana(u), u.mana + u.magic);
  u.mp = 0;
  if (u.regen > 0) heal(u, u.regen, log);
  for (const s of u.statuses) if (s.kind === 'burn' || s.kind === 'poison') dealDamage(u, s.power, log);
  for (const a of u.abilities) a.cooldown = Math.max(0, a.cooldown - 1);
  u.ap = AP_PER_TURN;
  log({ kind: 'turn', text: `${u.name}'s turn.` });
}

function checkWinner(state: GameState, log: Log) {
  if (state.winner) return;
  const dead1 = state.mages.p1.hp <= 0;
  const dead2 = state.mages.p2.hp <= 0;
  if (!dead1 && !dead2) return;
  state.winner = dead1 && dead2 ? 'draw' : dead1 ? 'p2' : 'p1';
  log({
    kind: 'victory',
    text: state.winner === 'draw' ? 'Both champions fall. Draw!' : `${state.mages[state.winner].name} is victorious!`,
  });
}

/** Rebuild a state from scratch. Used by replays and spectators. */
export function replay(config: MatchConfig, actions: Action[], upTo = actions.length): GameState {
  let s = createGame(config);
  for (let i = 0; i < upTo && i < actions.length; i++) s = applyAction(s, actions[i]);
  return s;
}
