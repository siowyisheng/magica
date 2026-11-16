import { generateBoard, moveCost, spawnFor } from './board';
import { ABILITIES } from './content';
import { advanceCrystals, crystalAt, crystalYield, initialCrystals, respawnCrystal } from './crystals';
import { distance, equals, fromKey, key, line, neighbors, toPixel, type Hex } from './hex';
import { buildMage } from './loadout';
import { aimableHexes, isDrawn, shapeReach, threatArea } from './threat';
import {
  other,
  type AbilityDef,
  type Action,
  type Cue,
  type GameEvent,
  type GameState,
  type Hit,
  type Mage,
  type MatchConfig,
  type PendingAttack,
  type PlayerId,
  type Shape,
  type Status,
} from './types';

// ---------------------------------------------------------------------------
// The engine is pure and deterministic: (state, action) -> state.
// No clocks, no Math.random. That's what makes replays and spectating trivial:
// a match is just its config + the list of actions.
//
// A turn is: [Reaction Phase] → resolution of pending Attacks → Action Phase.
// Attacks launched in the Action Phase stay pending until the end of the
// opponent's next Reaction Phase.
// ---------------------------------------------------------------------------

export const AP_PER_TURN = 2;

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
    phase: 'action',
    tiles,
    mages,
    crystals: [],
    pending: [],
    nextAttackId: 1,
    rng: (config.seed ^ 0x9e3779b9) >>> 0,
    events: [{ turn: 1, kind: 'turn', text: `${config.names.p1} takes the first turn.` }],
    winner: null,
  };
  state.crystals = initialCrystals(state);
  return state;
}

// --- Queries ---------------------------------------------------------------

export const maxMana = (m: Mage) => 10 * m.magic;
export const hpFraction = (m: Mage) => m.hp / m.maxHp;
/** A round is one turn by each mage. */
export const round = (state: GameState) => Math.ceil(state.turn / 2);
/** AP an Ability costs: 1, or 0 if Fast. The same in the Reaction Phase as in the Action Phase. */
export const apCost = (def: AbilityDef): number => (def.fast ? 0 : 1);
const enemyPos = (state: GameState, player: PlayerId): Hex => state.mages[other(player)].pos;
export const isAttack = (def: AbilityDef) => def.effect.type === 'attack';
export const timing = (def: AbilityDef) => def.timing ?? 'action';
/** Reaction Spells that must be aimed at one specific incoming Attack. */
export const isTargetedReaction = (def: AbilityDef) => def.effect.type === 'counter' || def.effect.type === 'deflect';

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

/**
 * Hexes reachable from `from` by walking at most `budget` hexes, with their cost.
 * Rock and the hex `blocked` can't be entered. `from` itself is left out.
 */
function walk(
  state: GameState,
  from: Hex,
  budget: number,
  blocked: string,
  parents?: Map<string, Hex>,
): Map<string, number> {
  const best = new Map<string, number>([[key(from), 0]]);
  const frontier: Array<[Hex, number]> = [[from, 0]];
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
      parents?.set(k, cur);
      frontier.push([n, next]);
    }
  }
  best.delete(key(from));
  return best;
}

/** The cheapest walk from `from` to `to` (both included), around rocks and the other mage. Empty if unreachable. */
export function walkPath(state: GameState, from: Hex, to: Hex, blocked: string, budget = Infinity): Hex[] {
  const parents = new Map<string, Hex>();
  walk(state, from, budget, blocked, parents);
  const path: Hex[] = [];
  for (let h: Hex | undefined = to; h; h = parents.get(key(h))) {
    path.push(h);
    if (key(h) === key(from)) return path.reverse();
  }
  return [];
}

/** Hexes the player's mage can Move to this turn, with their movement cost. Nobody Moves in the Reaction Phase. */
export function reachable(state: GameState, player: PlayerId): Map<string, number> {
  if (state.phase === 'reaction') return new Map();
  const mage = state.mages[player];
  return walk(state, mage.pos, moveBudget(mage), key(state.mages[other(player)].pos));
}

/** Rocks block line of sight. Mages don't. */
export function hasLOS(state: GameState, a: Hex, b: Hex): boolean {
  return line(a, b)
    .slice(1, -1)
    .every((h) => state.tiles[key(h)]?.terrain !== 'rock');
}

/** Reach of an Ability, for display and AI positioning. */
export function abilityRange(def: AbilityDef): number {
  if (def.effect.type === 'attack') return shapeReach(def.effect.shape);
  return def.targeting === 'tile' ? Math.max(1, def.range ?? 0) : 0;
}

/** Why the player can't cast this Ability (at this target), or null if they can. */
export function castError(
  state: GameState,
  player: PlayerId,
  abilityId: string,
  target?: Hex,
  attackId?: number,
  path?: Hex[],
): string | null {
  if (state.winner) return 'The match is over.';
  if (state.active !== player) return 'Not your turn.';
  const mage = state.mages[player];
  const slot = mage.abilities.find((a) => a.id === abilityId);
  const def = ABILITIES[abilityId];
  if (!slot || !def) return 'Ability not equipped.';
  const reacting = state.phase === 'reaction';
  if (reacting && timing(def) === 'action') return 'Only Reactions are allowed in the Reaction Phase.';
  if (!reacting && timing(def) === 'reaction') return 'Reactions can only be used in the Reaction Phase.';
  if (mage.ap < apCost(def)) return 'Not enough AP.';
  if (mage.mana < def.mana) return 'Not enough Mana.';
  if (isTargetedReaction(def)) {
    if (attackId === undefined) return target ? 'Choose an incoming attack.' : null;
    const atk = incoming(state, player).find((a) => a.id === attackId);
    if (!atk) return 'Choose an incoming attack.';
    if (atk.reflected) return "Can't react to a reaction.";
    const attacker = ABILITIES[atk.abilityId];
    if (def.effect.type === 'counter' && attacker.kind === 'technique') return "Counterspell can't stop a Technique.";
    if (def.effect.type === 'deflect' && (attacker.effect.type !== 'attack' || attacker.effect.shape.kind !== 'line'))
      return 'Only Lines can be deflected.';
    return null;
  }
  if (def.effect.type === 'attack' && isDrawn(def.effect.shape)) {
    if (!path) return target ? 'Draw the Wall: pick 5 connected hexes.' : null;
    return threatArea(state.tiles, mage.pos, def.effect.shape, path) ? null : "Can't draw the Wall there.";
  }
  if (!target) return null;

  const tile = state.tiles[key(target)];
  if (!tile) return 'Off the board.';
  if (def.effect.type === 'attack') {
    // An aim that threatens nothing (e.g. a Line straight into adjacent Rock) is not a valid aim.
    return threatArea(state.tiles, mage.pos, def.effect.shape, target, enemyPos(state, player))?.length ? null : "Can't aim there.";
  }
  const enemy = state.mages[other(player)];
  if (def.targeting !== 'tile') return equals(target, mage.pos) ? null : 'Targets yourself.';
  const dist = distance(mage.pos, target);
  if (dist === 0) return 'Pick another hex.';
  if (dist > abilityRange(def)) return 'Out of range.';
  if (tile.terrain === 'rock') return def.effect.type === 'pillar' ? 'Already rock.' : "Can't land on rock.";
  if (equals(target, enemy.pos)) return 'Hex is occupied.';
  if (def.effect.type === 'pillar') {
    if (crystalAt(state, target)) return 'A Mana Crystal is there.';
    if (!hasLOS(state, mage.pos, target)) return 'No line of sight.';
  }
  // A step is walked, so Rock and the other mage can block the way.
  if (def.effect.type === 'step' && !walk(state, mage.pos, abilityRange(def), key(enemy.pos)).has(key(target))) return 'No way through.';
  return null;
}

/** Hexes the player can aim this Ability at right now. */
export function validTargets(state: GameState, player: PlayerId, abilityId: string): Hex[] {
  if (castError(state, player, abilityId)) return [];
  const def = ABILITIES[abilityId];
  // A Wall's valid first hexes; the rest of the path is drawn from there.
  if (def.effect.type === 'attack' && isDrawn(def.effect.shape))
    return aimableHexes(state.tiles, state.mages[player].pos, def.effect.shape);
  const candidates =
    def.effect.type === 'attack'
      ? aimableHexes(state.tiles, state.mages[player].pos, def.effect.shape)
      : Object.values(state.tiles);
  return candidates.filter((t) => castError(state, player, abilityId, t) === null);
}

/** Hexes an Ability would affect if aimed at `target` (its Threat Area, for Attacks). */
export function impactArea(state: GameState, player: PlayerId, abilityId: string, target: Hex | Hex[]): Hex[] {
  const def = ABILITIES[abilityId];
  if (!def) return [];
  if (def.effect.type === 'attack')
    return threatArea(state.tiles, state.mages[player].pos, def.effect.shape, target, enemyPos(state, player)) ?? [];
  return Array.isArray(target) ? [] : [target];
}

export function absorbError(state: GameState, player: PlayerId): string | null {
  if (state.winner) return 'The match is over.';
  if (state.active !== player) return 'Not your turn.';
  if (state.phase === 'reaction') return 'Only Reactions are allowed in the Reaction Phase.';
  const m = state.mages[player];
  const c = crystalAt(state, m.pos);
  if (!c) return 'Stand on a Mana Crystal to absorb it.';
  if (c.state !== 'ready') return 'That crystal is not Ready yet.';
  if (m.ap < 1) return 'Not enough AP.';
  return null;
}

/** Pending Attacks the given mage will have to face (launched by the other mage). */
export const incoming = (state: GameState, player: PlayerId) => state.pending.filter((a) => a.caster !== player);

export function actionError(state: GameState, action: Action): string | null {
  if (state.winner) return 'The match is over.';
  if (action.player !== state.active) return 'Not your turn.';
  switch (action.type) {
    case 'move':
      if (state.phase === 'reaction') return 'No Moving in the Reaction Phase. Use a Reaction.';
      return reachable(state, action.player).has(key(action.to)) ? null : "Can't move there.";
    case 'cast':
      return castError(state, action.player, action.abilityId, action.target, action.attackId, action.path);
    case 'absorb':
      return absorbError(state, action.player);
    case 'endReaction':
      return state.phase === 'reaction' ? null : 'Not in the Reaction Phase.';
    case 'endTurn':
      return state.phase === 'action' ? null : 'Finish the Reaction Phase first.';
  }
}

// --- Transitions -----------------------------------------------------------

type Log = (e: Omit<GameEvent, 'turn'>) => void;

/** Applies an action. Illegal actions return the original state untouched. */
export function applyAction(prev: GameState, action: Action): GameState {
  if (actionError(prev, action)) return prev;
  const state = structuredClone(prev);
  const log: Log = (e) => state.events.push({ turn: state.turn, ...e });
  const me = state.mages[action.player];

  switch (action.type) {
    case 'move': {
      const from = me.pos;
      const cost = reachable(prev, action.player).get(key(action.to))!;
      const spend = apForMove(me, cost);
      me.ap -= spend;
      me.mp += spend * mpPerAp(me) - cost;
      me.pos = action.to;
      const path = walkPath(prev, from, action.to, key(prev.mages[other(action.player)].pos), moveBudget(prev.mages[action.player]));
      log({ kind: 'move', text: `${me.name} moves.`, at: action.to, player: action.player, path, cue: { kind: 'move', hexes: distance(from, action.to) } });
      break;
    }
    case 'cast': {
      const def = ABILITIES[action.abilityId];
      me.ap -= apCost(def);
      me.mana -= def.mana;
      if (def.effect.type === 'attack') {
        const aim = isDrawn(def.effect.shape) ? action.path! : action.target;
        const area = threatArea(state.tiles, me.pos, def.effect.shape, aim, enemyPos(state, me.owner))!;
        state.pending.push({
          id: state.nextAttackId++,
          caster: me.owner,
          abilityId: def.id,
          origin: me.pos,
          area: area.map(key),
          hit: boosted(me, def),
        });
        log({ kind: 'cast', text: `${me.name} launches ${def.icon} ${def.name}.`, at: me.pos, cue: { kind: 'launch', abilityId: def.id } });
      } else if (isTargetedReaction(def)) {
        react(state, me, def, action.attackId!, log);
      } else {
        log({ kind: 'cast', text: `${me.name} casts ${def.icon} ${def.name}.`, at: me.pos, cue: { kind: 'cast', abilityId: def.id } });
        resolveUtility(state, me, def, action.target, log);
      }
      checkWinner(state, log);
      break;
    }
    case 'absorb': {
      const c = crystalAt(state, me.pos)!;
      const gained = Math.min(maxMana(me) - me.mana, Math.floor(crystalYield(c, round(state)) * (1 + me.absorbBonus)));
      me.ap -= 1;
      me.mana += gained;
      log({ kind: 'heal', text: `${me.name} absorbs ${gained} Mana from the ${c.size} crystal.`, at: me.pos, cue: { kind: 'crystalAbsorb', size: c.size } });
      respawnCrystal(state, c);
      break;
    }
    case 'endReaction': {
      if (action.reason === 'timeout') log({ kind: 'turn', text: `${me.name} ran out of time to react!` });
      resolveIncoming(state, log);
      break;
    }
    case 'endTurn': {
      if (action.reason === 'timeout') log({ kind: 'turn', text: `${me.name} ran out of time!` });
      // Statuses last through the owner's turn (slow and root are read live while moving).
      me.statuses = me.statuses.map((s) => ({ ...s, turns: s.turns - 1 })).filter((s) => s.turns > 0);
      me.empower = 0;
      state.turn += 1;
      if (state.turn > state.config.maxTurns) {
        const [a, b] = [hpFraction(state.mages.p1), hpFraction(state.mages.p2)];
        state.winner = a === b ? 'draw' : a > b ? 'p1' : 'p2';
        log({
          kind: 'victory',
          text:
            state.winner === 'draw' ? 'Time! The duel ends in a draw.' : `Time! ${state.mages[state.winner].name} wins on health.`,
          cue: { kind: 'result', winner: state.winner },
        });
        break;
      }
      state.active = other(action.player);
      if (state.active === 'p1')
        advanceCrystals(state, (c) =>
          log({ kind: 'status', text: `The ${c.size} crystal is ready.`, at: c.pos, cue: { kind: 'crystalReady', size: c.size } }),
        ); // a new round begins
      startTurn(state, state.active, log);
      break;
    }
  }
  return state;
}

function startTurn(state: GameState, player: PlayerId, log: Log) {
  const mage = state.mages[player];
  // Each mage's first turn is turn 1 (P1) or 2 (P2); regen starts after that.
  if (state.turn > 2) mage.mana = Math.min(maxMana(mage), mage.mana + mage.magic + mage.manaRegen);
  mage.mp = 0;
  mage.empower = 0;
  if (mage.regen > 0) heal(mage, mage.regen, log);
  for (const s of mage.statuses) if (s.kind === 'burn' || s.kind === 'poison') dealDamage(mage, s.power, log);
  mage.ap = AP_PER_TURN;
  log({ kind: 'turn', text: `${mage.name}'s turn.` });
  checkWinner(state, log);
  if (state.winner) return;
  if (incoming(state, player).length) {
    state.phase = 'reaction';
    log({
      kind: 'turn',
      text: `${mage.name} must react to ${incoming(state, player).length} incoming attack(s).`,
      cue: { kind: 'reactionStart', player },
    });
  } else resolveIncoming(state, log);
}

/** End of the Reaction Phase: incoming Attacks land in launch order, shields fade, Action Phase begins. */
function resolveIncoming(state: GameState, log: Log) {
  const defender = state.active;
  for (const attack of incoming(state, defender)) {
    resolveAttack(state, attack, log);
    if (state.winner) break;
  }
  state.pending = state.pending.filter((a) => a.caster === defender);
  state.mages[defender].shield = 0;
  state.phase = 'action';
  if (!state.winner) log({ kind: 'turn', text: '', cue: { kind: 'actionStart', player: defender } });
}

function resolveAttack(state: GameState, attack: PendingAttack, log: Log) {
  const def = ABILITIES[attack.abilityId];
  const caster = state.mages[attack.caster];
  const area = new Set(attack.area);
  const victims = Object.values(state.mages).filter((m) => area.has(key(m.pos)));
  const at = fromKey(attack.area[Math.floor(attack.area.length / 2)]);
  const cue: Cue = { kind: 'resolve', abilityId: def.id };
  if (!victims.length) {
    log({ kind: 'cast', text: `${def.icon} ${def.name} misses.`, at, cue });
    return;
  }
  log({ kind: 'cast', text: `${def.icon} ${def.name} hits ${victims.map((v) => v.name).join(' and ')}.`, at, cue });
  let stolen = 0;
  for (const v of victims) applyHit(state, attack, attack.hit, v, (n) => v.owner !== caster.owner && (stolen += n), log);
  if (attack.hit.lifesteal && stolen > 0 && caster.hp > 0) heal(caster, Math.floor(stolen * attack.hit.lifesteal), log);
  checkWinner(state, log);
}

function applyHit(state: GameState, attack: PendingAttack, hit: Hit, v: Mage, onDealt: (n: number) => unknown, log: Log) {
  if (hit.damage > 0) onDealt(dealDamage(v, hitDamage(v, hit.damage), log, true));
  else if (attack.blocked) log({ kind: 'status', text: `${v.name} is unharmed: the damage was blocked.`, at: v.pos, cue: { kind: 'absorbed' } });
  if (hit.status && v.hp > 0) addStatus(v, hit.status, log);
  if (hit.knockback && v.owner !== attack.caster && v.hp > 0) knockback(state, attack.origin, v, hit.knockback, log);
}

/** Targeted Reaction Spells: Counterspell cancels; Deflect cancels and fires the Line back. */
function react(state: GameState, me: Mage, def: AbilityDef, attackId: number, log: Log) {
  const atk = state.pending.find((a) => a.id === attackId)!;
  const name = `${ABILITIES[atk.abilityId].icon} ${ABILITIES[atk.abilityId].name}`;
  state.pending = state.pending.filter((a) => a !== atk);
  if (def.effect.type === 'counter') {
    log({ kind: 'cast', text: `${me.name} counters ${name}!`, at: me.pos, cue: { kind: 'cast', abilityId: def.id } });
    return;
  }
  const attacker = state.mages[atk.caster];
  const shape = (ABILITIES[atk.abilityId].effect as { shape: Shape }).shape;
  const area = threatArea(state.tiles, me.pos, shape, attacker.pos, attacker.pos) ?? [];
  if (!area.length) {
    log({ kind: 'cast', text: `${me.name} deflects ${name}, but it shatters against the rock.`, at: me.pos, cue: { kind: 'cast', abilityId: def.id } });
    return;
  }
  state.pending.push({ ...atk, id: state.nextAttackId++, caster: me.owner, origin: me.pos, area: area.map(key), reflected: true });
  log({ kind: 'cast', text: `${me.name} deflects ${name} back at ${attacker.name}!`, at: me.pos, cue: { kind: 'cast', abilityId: def.id } });
}

/** The Hit an Attack launched now will carry: Techniques get the caster's Empower bonus. */
function boosted(caster: Mage, def: AbilityDef): Hit {
  const hit = (def.effect as { hit: Hit }).hit;
  return def.kind === 'technique' && caster.empower > 0 && hit.damage > 0 ? { ...hit, damage: hit.damage + caster.empower } : hit;
}

/** Instant, non-Attack effects (healing, shields, blinks, steps, …). */
function resolveUtility(state: GameState, caster: Mage, def: AbilityDef, target: Hex, log: Log) {
  const fx = def.effect;
  switch (fx.type) {
    case 'attack':
    case 'counter':
    case 'deflect':
      return;
    case 'heal':
      heal(caster, fx.amount, log);
      break;
    case 'shield':
      caster.shield += fx.amount;
      log({ kind: 'status', text: `${caster.name} gains ${fx.amount} shield.`, at: caster.pos, amount: fx.amount });
      break;
    case 'blink':
      caster.pos = target;
      break;
    case 'step': {
      const path = walkPath(state, caster.pos, target, key(state.mages[other(caster.owner)].pos), abilityRange(def));
      caster.pos = target;
      log({ kind: 'move', text: `${caster.name} steps aside.`, at: target, player: caster.owner, path });
      break;
    }
    case 'block': {
      const first = incoming(state, caster.owner)[0];
      if (!first) break;
      const was = first.hit.damage;
      first.hit = { ...first.hit, damage: Math.max(0, was - fx.amount) };
      first.blocked = (first.blocked ?? 0) + (was - first.hit.damage);
      const a = ABILITIES[first.abilityId];
      log({ kind: 'status', text: `${caster.name} blocks ${was - first.hit.damage} damage of ${a.icon} ${a.name}.`, at: caster.pos });
      break;
    }
    case 'empower':
      caster.empower += fx.bonus;
      log({ kind: 'status', text: `${caster.name}'s Techniques deal +${fx.bonus} damage this turn.`, at: caster.pos });
      break;
    case 'pillar':
      state.tiles[key(target)].terrain = 'rock';
      log({ kind: 'cast', text: `${caster.name} raises a stone pillar.`, at: target });
      break;
    case 'haste':
      caster.mp += fx.move;
      log({ kind: 'status', text: `${caster.name} gains ${fx.move} Movement Points.` });
      break;
  }
}

function heal(mage: Mage, amount: number, log: Log) {
  const healed = Math.max(0, Math.min(mage.maxHp - mage.hp, amount));
  if (healed <= 0) return;
  mage.hp += healed;
  log({ kind: 'heal', text: `${mage.name} heals ${healed}.`, at: mage.pos, amount: healed });
}

const COLLISION_DAMAGE = 2;

/** Shove `victim` |n| hexes away from (n > 0) or toward (n < 0) `origin`. */
function knockback(state: GameState, origin: Hex, victim: Mage, n: number, log: Log) {
  const push = n > 0;
  const o = toPixel(origin, 1);
  const blockers = Object.values(state.mages).filter((m) => m !== victim).map((m) => m.pos);
  let moved = 0;
  for (let i = 0; i < Math.abs(n); i++) {
    const cur = victim.pos;
    const d0 = distance(cur, origin);
    if (!push && d0 <= 1) break;
    // Ideal next point: one step along the origin→victim ray (or its reverse).
    const p = toPixel(cur, 1);
    const len = Math.hypot(p.x - o.x, p.y - o.y) || 1;
    const dir = push ? 1 : -1;
    const ideal = {
      x: p.x + (dir * Math.sqrt(3) * (p.x - o.x)) / len,
      y: p.y + (dir * Math.sqrt(3) * (p.y - o.y)) / len,
    };
    let best: Hex | null = null;
    let bestErr = Infinity;
    for (const nb of neighbors(cur)) {
      if (distance(nb, origin) !== d0 + dir) continue;
      const q = toPixel(nb, 1);
      const err = Math.hypot(q.x - ideal.x, q.y - ideal.y);
      if (err < bestErr - 1e-9) {
        bestErr = err;
        best = nb;
      }
    }
    const tile = best && state.tiles[key(best)];
    const blocked = !best || !tile || tile.terrain === 'rock' || blockers.some((b) => equals(b, best!));
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

/**
 * Damage an Attack's hit really does to `victim` before shields: vulnerable adds,
 * armor (Iron Skin) subtracts, but a hit always deals at least 1.
 * Damage-over-time ticks and collisions are not hits and skip this.
 */
export function hitDamage(victim: Mage, amount: number): number {
  const vuln = victim.statuses.find((s) => s.kind === 'vulnerable')?.power ?? 0;
  return Math.max(1, amount + vuln - victim.armor);
}

/** Applies shields. Returns HP actually lost. `fromHit`: damage from an Attack's Hit, which makes a sound. */
function dealDamage(victim: Mage, total: number, log: Log, fromHit = false): number {
  const absorbed = Math.min(victim.shield, total);
  victim.shield -= absorbed;
  const dealt = Math.min(victim.hp, total - absorbed);
  victim.hp -= dealt;
  log({
    kind: 'damage',
    text: `${victim.name} takes ${dealt}${absorbed ? ` (${absorbed} blocked)` : ''}.`,
    at: victim.pos,
    amount: dealt,
    cue: !fromHit ? undefined : dealt > 0 ? { kind: 'damage', amount: dealt } : absorbed > 0 ? { kind: 'absorbed' } : undefined,
  });
  return dealt;
}

function addStatus(mage: Mage, s: Status, log: Log) {
  const existing = mage.statuses.find((x) => x.kind === s.kind);
  if (existing) {
    existing.turns = Math.max(existing.turns, s.turns);
    existing.power = Math.max(existing.power, s.power);
  } else mage.statuses.push({ ...s });
  log({ kind: 'status', text: `${mage.name} is ${STATUS_VERB[s.kind]}.`, at: mage.pos });
}

const STATUS_VERB: Record<Status['kind'], string> = {
  burn: 'burning',
  poison: 'poisoned',
  slow: 'slowed',
  root: 'rooted',
  vulnerable: 'vulnerable',
};

function checkWinner(state: GameState, log: Log) {
  if (state.winner) return;
  const dead1 = state.mages.p1.hp <= 0;
  const dead2 = state.mages.p2.hp <= 0;
  if (!dead1 && !dead2) return;
  state.winner = dead1 && dead2 ? 'draw' : dead1 ? 'p2' : 'p1';
  log({
    kind: 'victory',
    text: state.winner === 'draw' ? 'Both mages fall. Draw!' : `${state.mages[state.winner].name} is victorious!`,
    cue: { kind: 'result', winner: state.winner },
  });
}

/** Rebuild a state from scratch. Used by replays and spectators. */
export function replay(config: MatchConfig, actions: Action[], upTo = actions.length): GameState {
  let s = createGame(config);
  for (let i = 0; i < upTo && i < actions.length; i++) s = applyAction(s, actions[i]);
  return s;
}
