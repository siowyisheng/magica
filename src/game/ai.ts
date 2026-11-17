import { ABILITIES } from './content';
import { crystalYield } from './crystals';
import {
  abilityRange,
  bidCap,
  bidCommitment,
  absorbError,
  apCost,
  apForMove,
  applyAction,
  castError,
  hasLOS,
  hitDamage,
  incoming,
  maxMana,
  mpPerAp,
  reachable,
  validTargets,
  AP_PER_TURN,
} from './engine';
import { distance, fromKey, key, neighbors, type Hex } from './hex';
import { rngStep } from './rng';
import { aimableHexes, isDrawn, threatArea } from './threat';
import { other, type Action, type GameState, type Hit, type Mage, type PendingAttack, type PlayerId } from './types';

// ---------------------------------------------------------------------------
// Greedy bot. chooseAction returns the single next action for `player`; call
// it repeatedly until it ends the phase/turn. Every action it returns spends
// AP, Movement Points or Mana, or ends the phase, so it always terminates.
// ---------------------------------------------------------------------------

export function chooseAction(state: GameState, player: PlayerId): Action {
  if (state.bidding) return chooseBidding(state);
  return state.phase === 'reaction' ? chooseReaction(state, player) : chooseMain(state, player);
}

/**
 * How likely a caster is to bid the Max Bid, judged from the Mana they'd have left afterwards:
 * 0% if they can't afford it, otherwise 25% plus 5% per point left over, up to 95%.
 */
export function maxBidLikelihood(casterMana: number, maxBid: number): number {
  const leftover = casterMana - maxBid;
  return leftover < 0 ? 0 : Math.min(0.95, 0.25 + 0.05 * leftover);
}

/** Chance a defender throws a low bid instead of 0 when the caster can afford the Max Bid. */
const lowBidChance = (pMax: number) => 0.4 * (1 - pMax);

/** Pseudo-random numbers for one bid, from the seeded match state: replays stay identical. */
function bidRandoms(state: GameState, player: PlayerId): [number, number] {
  const seed = (state.rng ^ Math.imul(state.bidding!.id, 0x9e3779b1) ^ (player === 'p1' ? 0x5bd1e995 : 0x1b873593)) >>> 0;
  const [r1, next] = rngStep(seed);
  const [r2] = rngStep(next);
  return [r1, r2];
}

/** The AI's secret bid for the open contest: offensive if it cast the spell, defensive if it's the target. */
export function aiBid(state: GameState, player: PlayerId): number {
  const b = state.bidding;
  if (!b) return 0;
  const def = ABILITIES[b.abilityId];
  const cap = bidCap(def);
  const me = state.mages[player];
  const afford = Math.max(0, Math.min(me.mana, cap));
  const [r1, r2] = bidRandoms(state, player);

  if (player === b.target) {
    // Defending. Max Bids cap both sides and ties go to the caster, so a Max Bid can't be beaten:
    // resisting only pays when the caster can't afford it (then out-bid them for sure) or gambles low.
    const caster = state.mages[b.caster];
    if (caster.mana < cap) {
      const beat = caster.mana + 1;
      return beat <= afford ? beat : 0;
    }
    if (r1 < lowBidChance(maxBidLikelihood(caster.mana, cap))) return Math.min(afford, r2 < 0.5 ? 1 : 2);
    return 0;
  }

  // Attacking. The sure win is matching what the defender could possibly bid; sometimes gamble on
  // them not resisting, less often the more the spell itself cost.
  const defender = state.mages[b.target];
  const sure = Math.min(defender.mana, cap, me.mana);
  if (sure === 0) return 0;
  const theyCanSurelyResist = me.mana < cap && me.mana + 1 <= Math.min(defender.mana, cap);
  const noResist = theyCanSurelyResist ? 0 : 1 - lowBidChance(maxBidLikelihood(me.mana, cap));
  const costFactor = Math.max(0.4, Math.min(1, 1 - (def.mana - 2) * 0.1));
  const gamble = (0.1 + 0.05 * noResist) * costFactor;
  if (r1 < gamble) return r2 < 0.75 ? 0 : Math.min(1, sure);
  return sure;
}

/** Salt the headless AI uses. The UI uses a fresh random salt for every bid instead. */
export const HEADLESS_SALT = 'ai';

/**
 * Drive a whole bid when both sides are bots (AI vs AI, tests): commit for whoever hasn't,
 * close the window, then reveal. The UI runs the real window and salts itself.
 */
function chooseBidding(state: GameState): Action {
  const b = state.bidding!;
  const duellists = [b.caster, b.target];
  if (b.stage === 'commit') {
    const p = duellists.find((d) => !b.commits[d]);
    return p
      ? { type: 'commitBid', player: p, hash: bidCommitment(b.id, p, aiBid(state, p), HEADLESS_SALT) }
      : { type: 'closeBidding', player: state.active };
  }
  const p = duellists.find((d) => b.reveals[d] === undefined)!;
  return { type: 'revealBid', player: p, amount: aiBid(state, p), salt: HEADLESS_SALT };
}

const areaOf = (attacks: GameState['pending']) => new Set(attacks.flatMap((a) => a.area));

/**
 * Reaction Phase: look ahead over every sequence of Reactions we could afford this phase (dodges,
 * Reaction Spells, Block…), play each out with the real rules until the incoming Attacks land, and
 * take the first step of the sequence that leaves us best off. Harm taken dominates; Mana, AP and
 * cooldowns spent break the ties, then ending up nearer where we want to fight from.
 */
function chooseReaction(state: GameState, player: PlayerId): Action {
  const me = state.mages[player];
  const threats = incoming(state, player);
  const hitting = threats.filter((a) => a.homing || a.area.includes(key(me.pos)));
  if (!hitting.length) return { type: 'endReaction', player };
  const toPost = stepsToFiringPost(state, state.mages[other(player)].pos, me);
  return planReaction(state, player, state, toPost, REACTION_DEPTH).action;
}

const REACTION_DEPTH = 3;
/** What each resource is worth, in HP, when weighing Reactions against the harm they prevent. */
const VALUE = { mana: 0.25, ap: 1, cooldown: 0.5, statusTurn: 0.75, disable: 2.5, post: 0.1 } as const;
const BAD_STATUSES = new Set(['burn', 'poison', 'slow', 'root', 'vulnerable', 'disarmed', 'fatigue', 'charm', 'fear', 'asleep']);
const DISABLING = new Set(['root', 'charm', 'fear', 'asleep']);

function planReaction(
  state: GameState,
  player: PlayerId,
  start: GameState,
  toPost: Map<string, number>,
  depth: number,
): { action: Action; cost: number } {
  const end: Action = { type: 'endReaction', player };
  let best: { action: Action; cost: number } = { action: end, cost: reactionOutcome(applyAction(state, end), player, start, toPost) };
  if (depth === 0) return best;
  for (const action of reactionOptions(state, player, toPost)) {
    const next = applyAction(state, action);
    if (next === state) continue; // illegal
    const cost = planReaction(next, player, start, toPost, depth - 1).cost;
    if (cost < best.cost - 1e-9) best = { action, cost };
  }
  return best;
}

/** Every Reaction worth trying from here: each castable Reaction Spell, and a few dodges. */
function reactionOptions(state: GameState, player: PlayerId, toPost: Map<string, number>): Action[] {
  const me = state.mages[player];
  const threats = incoming(state, player);
  const out: Action[] = [];
  for (const slot of me.abilities) {
    if (castError(state, player, slot.id)) continue;
    const fx = ABILITIES[slot.id].effect;
    if (fx.type === 'counter' || fx.type === 'deflect') {
      for (const a of threats)
        if (!castError(state, player, slot.id, me.pos, a.id)) out.push({ type: 'cast', player, abilityId: slot.id, target: me.pos, attackId: a.id });
    } else if (fx.type === 'shield' || fx.type === 'block') {
      out.push({ type: 'cast', player, abilityId: slot.id, target: me.pos });
    } else if (fx.type === 'blink') {
      const t = bestHexes(validTargets(state, player, slot.id).map((h) => ({ k: key(h), cost: 0 })), threats, state, player, toPost, () => 0);
      for (const k of t) out.push({ type: 'cast', player, abilityId: slot.id, target: fromKey(k) });
    }
  }
  // Dodges: for each AP spend, the safest hexes, nearest our firing post.
  const reach = [...reachable(state, player)].map(([k, cost]) => ({ k, cost }));
  for (const k of bestHexes(reach, threats, state, player, toPost, (c) => apForMove(me, c, true)))
    out.push({ type: 'move', player, to: fromKey(k) });
  return out;
}

/** Per group (AP spent), the hex hit by the fewest incoming Attacks, nearest our firing post. */
function bestHexes(
  hexes: Array<{ k: string; cost: number }>,
  threats: PendingAttack[],
  state: GameState,
  player: PlayerId,
  toPost: Map<string, number>,
  group: (cost: number) => number,
): string[] {
  const own = areaOf(state.pending.filter((a) => a.caster === player));
  const best = new Map<number, { k: string; score: number }>();
  for (const { k, cost } of hexes) {
    if (own.has(k)) continue;
    const hits = threats.filter((a) => !a.homing && a.area.includes(k)).length;
    const score = hits * 100 + (toPost.get(k) ?? 1000) + cost * 0.01;
    const g = group(cost);
    const cur = best.get(g);
    if (!cur || score < cur.score) best.set(g, { k, score });
  }
  return [...best.values()].map((b) => b.k);
}

/** How badly a played-out Reaction Phase went for `player`, in HP-equivalents (lower is better). */
function reactionOutcome(after: GameState, player: PlayerId, before: GameState, toPost: Map<string, number>): number {
  const me = after.mages[player];
  const was = before.mages[player];
  if (after.winner === other(player) || me.hp <= 0) return 1e6;
  if (after.winner === player) return -1e6;
  let cost = was.hp - me.hp;
  for (const s of me.statuses) {
    if (!BAD_STATUSES.has(s.kind)) continue;
    const prev = was.statuses.find((p) => p.kind === s.kind);
    const gained = s.turns - (prev?.turns ?? 0);
    if (gained > 0) cost += DISABLING.has(s.kind) ? VALUE.disable : gained * VALUE.statusTurn * Math.max(1, s.power);
  }
  cost += (was.mana - me.mana) * VALUE.mana;
  cost += (was.ap - me.ap) * VALUE.ap;
  for (const slot of me.abilities) {
    const prev = was.abilities.find((a) => a.id === slot.id);
    const cd = (slot.cooldown ?? 0) - (prev?.cooldown ?? 0);
    if (cd > 0) cost += VALUE.cooldown * cd;
  }
  // Attacks we sent back at the enemy are worth something too.
  for (const a of after.pending) if (a.reflected && a.caster === player) cost -= a.hit.damage * 0.5;
  cost += ((toPost.get(key(me.pos)) ?? 1000) - (toPost.get(key(was.pos)) ?? 1000)) * VALUE.post;
  return cost;
}

function chooseMain(state: GameState, player: PlayerId): Action {
  const me = state.mages[player];
  const enemy = state.mages[other(player)];

  // 0. Free Mana under our feet.
  if (!absorbError(state, player)) return { type: 'absorb', player };

  // 1. Best cast available right now.
  let best: { score: number; action: Action } | null = null;
  for (const slot of me.abilities) {
    if (castError(state, player, slot.id)) continue;
    for (const [target, area, path] of castCandidates(state, player, slot.id)) {
      const score = scoreCast(state, player, slot.id, target, area);
      if (score > 0.3 && (!best || score > best.score)) {
        best = { score, action: { type: 'cast', player, abilityId: slot.id, target, path } };
      }
    }
  }
  if (best) return best.action;

  const options = reachable(state, player);
  const ownDanger = areaOf(state.pending.filter((a) => a.caster === player));

  // 2. Walk onto a Ready crystal if we can reach it and still have an AP left to absorb.
  if (me.ap >= 2 || me.mp > 0) {
    const budget = me.mp + (me.ap - 1) * mpPerAp(me);
    const target = state.crystals
      .filter((c) => c.state === 'ready' && (options.get(key(c.pos)) ?? Infinity) <= budget && !ownDanger.has(key(c.pos)))
      .sort((a, b) => crystalYield(b) - crystalYield(a))[0];
    if (target) return { type: 'move', player, to: target.pos };
  }

  // 3. Reposition. With AP to spare for an Attack after walking, head for a firing post. Otherwise
  // this is where we'll stand through the enemy's turn: keep out of what they can hit us with.
  const toPost = stepsToFiringPost(state, enemy.pos, me);
  const offense = canStillAttackAfterWalking(state, player);
  const threat = offense ? null : enemyThreat(state, player);
  const wary = idealRange(me) <= 1 ? 0 : 1; // melee mages have to walk into reach anyway
  const scorePos = (k: string) =>
    (ownDanger.has(k) ? -100 : 0) -
    (offense ? toPost.get(k) ?? Infinity : 0.3 * (toPost.get(k) ?? 1000) + wary * threat!(k));
  let bestPos: string | null = null;
  const here = scorePos(key(me.pos));
  let bestScore = here;
  let bestCost = 0;
  for (const [k, cost] of options) {
    const s = scorePos(k);
    // On a tie, the cheaper walk: it keeps AP for an Attack once we get there.
    if (s > bestScore + 1e-9 || (bestPos && Math.abs(s - bestScore) < 1e-9 && cost < bestCost)) {
      bestScore = s;
      bestPos = k;
      bestCost = cost;
    }
  }
  // 4. Leftover AP: a small step isn't worth more than topping up Mana or health with it.
  const filler = offense ? null : fillerCast(state, player);
  if (filler && (!bestPos || bestScore - here < 0.3 || options.get(bestPos)! <= me.mp)) return filler;
  // AP left at the end of a turn is lost, so any step to a better position is worth it.
  if (bestPos) return { type: 'move', player, to: fromKey(bestPos) };
  if (filler) return filler;

  return { type: 'endTurn', player };
}

/**
 * For every hex, how far it is from a good place to attack from: Movement to walk there around
 * rocks, plus a heavy penalty for how far that place is off the ideal range or out of sight.
 * Walking distance (not straight-line distance) keeps the bot from getting stuck behind a wall
 * whose way round first leads away from the enemy.
 */
function stepsToFiringPost(state: GameState, enemyPos: Hex, me: Mage): Map<string, number> {
  const ideal = idealRange(me);
  const farthest = maxReach(me);
  const enemy = key(enemyPos);
  const passable = (k: string) => k !== enemy && state.tiles[k] && state.tiles[k].terrain !== 'rock';
  const best = new Map<string, number>();
  const frontier: Array<[string, number]> = [];
  for (const k of Object.keys(state.tiles)) {
    if (!passable(k)) continue;
    const h = fromKey(k);
    // Being out of reach or out of sight weighs far more than a step of walking, so a long way round
    // to a real firing post still beats standing nearer in a straight line. Within reach, the ideal
    // range is only a mild preference, which leaves room to back away from danger.
    const d = distance(h, enemyPos);
    const off = d < ideal ? 4 * (ideal - d) : d <= farthest ? d - ideal : farthest - ideal + 10 * (d - farthest);
    const cost = off + (hasLOS(state, h, enemyPos) ? 0 : 3);
    best.set(k, cost);
    frontier.push([k, cost]);
  }
  while (frontier.length) {
    frontier.sort((a, b) => a[1] - b[1]);
    const [k, cost] = frontier.shift()!;
    if (cost > best.get(k)!) continue;
    for (const n of neighbors(fromKey(k))) {
      const nk = key(n);
      if (!passable(nk) || (best.get(nk) ?? Infinity) <= cost + 1) continue;
      best.set(nk, cost + 1);
      frontier.push([nk, cost + 1]);
    }
  }
  return best;
}

/** Whether, after spending an AP (or leftover Movement) on walking, we could still afford an Attack this turn. */
function canStillAttackAfterWalking(state: GameState, player: PlayerId): boolean {
  const me = state.mages[player];
  const apAfterWalk = me.mp > 0 ? me.ap : me.ap - 1;
  return me.abilities.some((slot) => {
    const def = ABILITIES[slot.id];
    if (def.effect.type !== 'attack' || def.mana > me.mana || apCost(def) > apAfterWalk) return false;
    const err = castError(state, player, slot.id);
    return !err || !err.match(/cooldown|once|times per turn|equipped|Mana|AP/i);
  });
}

/**
 * For each hex, the worst single Attack the enemy could land on us there next turn, in HP-equivalents:
 * they may walk first (keeping an AP to cast) and need line of sight for anything but a Burst or Wall.
 * Halved when we could step out of it in our own Reaction Phase; homing Attacks can't be stepped out of.
 */
function enemyThreat(state: GameState, player: PlayerId): (k: string) => number {
  const me = state.mages[player];
  const enemy = state.mages[other(player)];
  const attacks = enemy.abilities
    .map((slot) => ({ slot, def: ABILITIES[slot.id] }))
    .filter(({ slot, def }) => def.effect.type === 'attack' && def.mana <= enemy.mana + 2 && (slot.cooldown ?? 0) <= 1)
    .map(({ def }) => {
      const fx = def.effect as Extract<typeof def.effect, { type: 'attack' }>;
      const dmg = fx.hit.damage > 0 ? hitDamage(me, fx.hit.damage) : 0;
      const sure = !!(fx.homing || fx.instant);
      const value = (dmg + (fx.hit.status ? 1.5 : 0)) * (sure || mpPerAp(me, true) <= 0 ? 1 : 0.5);
      const los = !(fx.shape.kind === 'burst' || fx.shape.kind === 'wall' || fx.shape.kind === 'selfBurst');
      return { reach: abilityRange(def), los, value };
    })
    .sort((a, b) => b.value - a.value);
  if (!attacks.length) return () => 0;
  // Where the enemy could cast from: walking with all but one AP of their next turn.
  const from: Hex[] = [enemy.pos];
  const budget = Math.max(0, nextTurnAp(enemy) - 1) * mpPerAp(enemy);
  if (budget > 0) {
    const seen = new Set([key(enemy.pos)]);
    let frontier = [enemy.pos];
    for (let d = 1; d <= budget; d++) {
      const next: Hex[] = [];
      for (const h of frontier)
        for (const n of neighbors(h)) {
          const k = key(n);
          if (seen.has(k) || !state.tiles[k] || state.tiles[k].terrain === 'rock') continue;
          seen.add(k);
          next.push(n);
          from.push(n);
        }
      frontier = next;
    }
  }
  const cache = new Map<string, number>();
  return (k: string) => {
    let v = cache.get(k);
    if (v !== undefined) return v;
    const h = fromKey(k);
    v = 0;
    for (const a of attacks)
      if (from.some((p) => distance(p, h) <= a.reach && (!a.los || hasLOS(state, p, h)))) {
        v = a.value;
        break;
      }
    cache.set(k, v);
    return v;
  };
}

/** Something useful for a last AP that has nothing better to do: top up Mana, or heal. */
function fillerCast(state: GameState, player: PlayerId): Action | null {
  const me = state.mages[player];
  for (const slot of me.abilities) {
    const fx = ABILITIES[slot.id].effect;
    if (castError(state, player, slot.id, me.pos)) continue;
    const useful = (fx.type === 'mana' && me.mana < maxMana(me)) || (fx.type === 'heal' && me.hp < me.maxHp);
    if (useful) return { type: 'cast', player, abilityId: slot.id, target: me.pos };
  }
  return null;
}

/** Could we still launch an Attack covering the enemy this turn with this much AP and Mana left? */
function hasFollowUp(state: GameState, player: PlayerId, apLeft: number, manaLeft: number): boolean {
  const me = state.mages[player];
  return me.abilities.some((slot) => {
    const def = ABILITIES[slot.id];
    if (def.effect.type !== 'attack' || def.mana > manaLeft || apCost(def) > apLeft) return false;
    if (castError(state, player, slot.id)?.match(/cooldown|once|times per turn|equipped/i)) return false;
    return castCandidates(state, player, slot.id).length > 0;
  });
}

/** How far our longest Attack reaches (capped, so unlimited Lines don't send us to the board edge). */
function maxReach(me: Mage): number {
  const ranges = me.abilities.map((s) => ABILITIES[s.id]).filter((d) => d.effect.type === 'attack').map(abilityRange);
  return Math.max(idealRange(me), Math.min(8, ...ranges.length ? [Math.max(...ranges)] : [1]));
}

function idealRange(me: Mage): number {
  const ranges = me.abilities
    .map((s) => ABILITIES[s.id])
    .filter((d) => d.effect.type === 'attack')
    .map(abilityRange);
  const ranged = ranges.filter((r) => r > 1);
  // Unlimited ranges would send the bot to the board edge; stay within a comfortable 5.
  return ranged.length ? Math.min(...ranged, 5) : 1;
}

/** Aim points worth evaluating, with their Threat Areas. For Attacks, only aims that cover the enemy (or where they'd dodge to). */
function castCandidates(state: GameState, player: PlayerId, abilityId: string): Array<[Hex, Set<string>, Hex[]?]> {
  const def = ABILITIES[abilityId];
  if (def.effect.type !== 'attack') return validTargets(state, player, abilityId).map((t) => [t, new Set<string>()]);
  const me = state.mages[player].pos;
  const enemyPos = state.mages[other(player)].pos;
  const enemy = key(enemyPos);
  const shape = def.effect.shape;
  const out: Array<[Hex, Set<string>, Hex[]?]> = [];
  if (isDrawn(shape)) {
    for (const path of wallsThrough(enemyPos, shape.length)) {
      const area = threatArea(state.tiles, me, shape, path);
      if (area) out.push([path[0], new Set(area.map(key)), path]);
    }
    return out;
  }
  // Once something is on its way, an Attack that covers where they'd escape to is worth trying too.
  const escapes = state.pending.some((a) => a.caster === player && !a.reflected) ? dodgeReach(state, player) : null;
  for (const aim of aimableHexes(state.tiles, me, shape)) {
    const area = threatArea(state.tiles, me, shape, aim, enemyPos);
    if (!area) continue;
    const keys = new Set(area.map(key));
    if (keys.has(enemy) || (escapes && [...keys].some((k) => escapes.has(k)))) out.push([aim, keys]);
  }
  // Equal scores keep the first candidate, so try aiming straight at the enemy first. Otherwise the bot
  // can pick a slightly off-angle Line that clips them but misses the hex behind, and they step out of it.
  return out.sort((x, y) => Number(key(y[0]) === enemy) - Number(key(x[0]) === enemy));
}

/** Straight Walls of `length` passing through `h`, along each of the three hex axes, at every offset. */
function wallsThrough(h: Hex, length: number): Hex[][] {
  const axes = [
    { q: 1, r: 0 },
    { q: 0, r: 1 },
    { q: 1, r: -1 },
  ];
  const out: Hex[][] = [];
  for (const d of axes)
    for (let start = -(length - 1); start <= 0; start++)
      out.push(Array.from({ length }, (_, i) => ({ q: h.q + d.q * (start + i), r: h.r + d.r * (start + i) })));
  return out;
}

/** Can't dodge in their next Reaction Phase: rooted, or facing a Compelled turn (Sleep, Charm, Fear). */
const isPinned = (m: Mage) => m.statuses.some((s) => s.kind === 'root' || s.kind === 'asleep' || s.kind === 'charm' || s.kind === 'fear');

/** AP the mage will have next turn (fatigue takes some away). */
const nextTurnAp = (m: Mage) => Math.max(0, AP_PER_TURN - (m.statuses.find((s) => s.kind === 'fatigue')?.power ?? 0));

/** An Attack as the enemy will face it in their Reaction Phase. */
interface Incoming {
  area: Set<string>;
  hit: Hit;
  /** Lands wherever they stand (homing or instant). */
  sure: boolean;
}

/**
 * Where the enemy could stand when our Attacks land, if they spend their next Reaction Phase walking:
 * each reachable hex with the AP it costs. Reaction Movement is slower; a Pinned mage can't step at all.
 */
function dodgeReach(state: GameState, player: PlayerId): Map<string, number> {
  const enemy = state.mages[other(player)];
  const out = new Map([[key(enemy.pos), 0]]);
  const per = mpPerAp(enemy, true);
  if (isPinned(enemy) || per <= 0) return out;
  const budget = nextTurnAp(enemy) * per;
  const blocked = key(state.mages[player].pos);
  let frontier = [enemy.pos];
  for (let d = 1; d <= budget; d++) {
    const next: Hex[] = [];
    for (const h of frontier)
      for (const n of neighbors(h)) {
        const k = key(n);
        const t = state.tiles[k];
        if (!t || t.terrain === 'rock' || k === blocked || out.has(k)) continue;
        out.set(k, Math.ceil(d / per));
        next.push(n);
      }
    frontier = next;
  }
  return out;
}

/** Our Attacks already on their way to the enemy. */
function ownIncoming(state: GameState, player: PlayerId): Incoming[] {
  return state.pending
    .filter((a) => a.caster === player && !a.reflected)
    .map((a) => ({ area: new Set(a.area), hit: a.hit, sure: !!a.homing }));
}

/** What a set of Attacks would do to the enemy standing on one hex (in HP-equivalents). */
function harmAt(enemy: Mage, k: string, attacks: Incoming[]): number {
  let dmg = 0;
  let extra = 0;
  const statuses = new Set<string>();
  for (const a of attacks) {
    if (!a.sure && !a.area.has(k)) continue;
    const d = a.hit.damage > 0 ? hitDamage(enemy, a.hit.damage) : 0;
    dmg += d;
    if (a.hit.status && !enemy.statuses.some((s) => s.kind === a.hit.status!.kind)) statuses.add(a.hit.status.kind);
    if (a.hit.lifesteal) extra += d * a.hit.lifesteal * 0.5;
    if (a.hit.knockback) extra += 0.3;
  }
  if (dmg > 0 && dmg >= enemy.hp + enemy.shield) extra += 100;
  return dmg + extra + statuses.size * 1.5;
}

/**
 * The enemy's best reply to a set of Attacks: the hex they'd walk to (or stay on) that leaves them
 * least worse off, counting each AP spent walking as about 1 HP. `value` is what the Attacks are worth
 * to us (harm landed plus AP they force the enemy to burn); `harm` is the harm alone.
 */
function bestDodge(state: GameState, player: PlayerId, attacks: Incoming[], reach = dodgeReach(state, player)) {
  const enemy = state.mages[other(player)];
  let best = { value: Infinity, harm: 0 };
  for (const [k, ap] of reach) {
    const harm = harmAt(enemy, k, attacks);
    const value = harm + ap * VALUE.ap;
    if (value < best.value - 1e-9 || (Math.abs(value - best.value) < 1e-9 && harm < best.harm)) best = { value, harm };
  }
  return best;
}

function scoreCast(state: GameState, player: PlayerId, abilityId: string, _target: Hex, area: Set<string>): number {
  const me = state.mages[player];
  const enemy = state.mages[other(player)];
  const def = ABILITIES[abilityId];
  const fx = def.effect;
  const dist = distance(me.pos, enemy.pos);
  const cost = Math.max(1, apCost(def) + def.mana / 5);
  switch (fx.type) {
    case 'attack': {
      // Worth what it adds on top of what we've already launched, given the enemy's best dodge: an Attack
      // that covers where they'd escape to (or that they can't escape) lands; one they simply step out of
      // only taxes their AP.
      const launched = ownIncoming(state, player);
      const reach = dodgeReach(state, player);
      const before = bestDodge(state, player, launched, reach);
      const after = bestDodge(state, player, [...launched, { area, hit: fx.hit, sure: !!(fx.instant || fx.homing) }], reach);
      // Rule: never pour Mana or AP into Attacks the enemy can simply walk away from. An Attack that lands
      // nothing extra is dodgeable: at most one a turn, for no more than 2 Mana or 20% of our Mana.
      if (after.harm - before.harm < 0.5) {
        const alreadyDodgeable = launched.length > 0 && before.harm < 0.5;
        if (alreadyDodgeable || def.mana > Math.max(2, 0.2 * me.mana)) return 0;
      }
      let score = after.value - before.value;
      // Standing in our own Threat Area is fine only if we can still walk out.
      if (area.has(key(me.pos))) score -= me.ap > apCost(def) || me.mp > 1 ? 0.5 : fx.hit.damage * 1.5;
      return score / cost;
    }
    case 'heal':
      return me.hp <= me.maxHp * 0.6 ? Math.min(me.maxHp - me.hp, fx.amount) / cost : 0;
    case 'shield':
      // Shields hold until our next resolution: worth it when the enemy can reach us.
      return dist <= 6 && me.shield === 0 && me.ap === 1 ? 1 : 0;
    case 'contest':
    case 'status': {
      if (def.targeting === 'self') return me.statuses.some((s) => s.kind === fx.status.kind) ? 0 : 2.5;
      if (enemy.statuses.some((s) => s.kind === fx.status.kind)) return 0;
      // Rule: only cast a Contested Spell when, after paying for it, we can afford the bid that wins for
      // sure (the defender's Mana or the Max Bid, whichever is lower; ties go to the caster).
      const sureBid = fx.type === 'contest' ? Math.min(enemy.mana, bidCap(def)) : 0;
      const manaLeft = me.mana - def.mana - sureBid;
      if (manaLeft < 0) return 0;
      const pinning = fx.status.kind === 'root' || fx.status.kind === 'asleep' || fx.status.kind === 'charm' || fx.status.kind === 'fear';
      if (!pinning) return 1.5;
      // Pin first, then attack: a pinned enemy can't step out of what follows. A Root is only worth it
      // with a follow-up ready (or an Attack already covering them); a Compelled turn is worth it anyway.
      const covered = state.pending.some((a) => a.caster === player && a.area.includes(key(enemy.pos)));
      const followUp = covered || hasFollowUp(state, player, me.ap - apCost(def), manaLeft);
      if (fx.status.kind === 'root') return followUp ? 5 : 0;
      return followUp ? 5 : 2.5;
    }
    case 'mana':
      // Only when running low: it spends the AP that could have gone into an attack.
      return me.mana <= maxMana(me) / 3 ? Math.min(fx.amount, maxMana(me) - me.mana) / cost : 0;
    case 'counter':
    case 'deflect':
    case 'haste':
    case 'blink':
    case 'block':
    case 'empower':
    case 'pillar':
      return 0; // positional tricks are left to humans (and a smarter future bot)
  }
}
