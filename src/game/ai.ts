import { ABILITIES } from './content';
import { crystalYield } from './crystals';
import {
  abilityRange,
  bidCap,
  bidCommitment,
  absorbError,
  apCost,
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
 * Reaction Phase: use the Reaction that prevents the most damage (the cheapest in Mana on a tie),
 * which includes dodging out of every incoming Threat Area; otherwise brace.
 */
function chooseReaction(state: GameState, player: PlayerId): Action {
  const me = state.mages[player];
  const threats = incoming(state, player);
  // Homing Attacks (Magic Missile) land wherever we stand, so only the rest can be dodged.
  const danger = areaOf(threats.filter((a) => !a.homing));
  const hitting = threats.filter((a) => a.homing || a.area.includes(key(me.pos)));
  if (!hitting.length) return { type: 'endReaction', player };

  const own = areaOf(state.pending.filter((a) => a.caster === player));

  const damage = (a: PendingAttack) => (a.hit.damage > 0 ? hitDamage(me, a.hit.damage) : 0);
  const harm = (a: PendingAttack) => damage(a) + (a.hit.status ? 1.5 : 0);
  /** Harm that stepping out of the way would avoid. */
  const dodgeable = hitting.filter((a) => !a.homing).reduce((n, a) => n + harm(a), 0);
  const unshielded = hitting.reduce((n, a) => n + damage(a), 0) - me.shield;

  // The Reaction Spell that prevents the most damage; the cheapest one on a tie.
  let best: { prevented: number; mana: number; action: Action } | null = null;
  const consider = (prevented: number, mana: number, action: Action) => {
    if (prevented < 1) return;
    if (!best || prevented > best.prevented || (prevented === best.prevented && mana < best.mana)) best = { prevented, mana, action };
  };
  for (const slot of me.abilities) {
    const def = ABILITIES[slot.id];
    if (castError(state, player, slot.id)) continue;
    const fx = def.effect;
    if (fx.type === 'counter' || fx.type === 'deflect') {
      for (const a of hitting)
        if (!castError(state, player, slot.id, me.pos, a.id))
          consider(harm(a) + (fx.type === 'deflect' ? 1 : 0), def.mana, {
            type: 'cast', player, abilityId: slot.id, target: me.pos, attackId: a.id,
          });
    } else if (fx.type === 'shield' && unshielded > 0) {
      consider(Math.min(fx.amount, unshielded), def.mana, { type: 'cast', player, abilityId: slot.id, target: me.pos });
    } else if (fx.type === 'block') {
      const first = threats[0];
      if (first?.area.includes(key(me.pos)) && first.hit.damage > 0)
        consider(Math.min(fx.amount, hitDamage(me, first.hit.damage)), def.mana, { type: 'cast', player, abilityId: slot.id, target: me.pos });
    } else if (fx.type === 'blink') {
      const out = validTargets(state, player, slot.id).find((h) => !danger.has(key(h)) && !own.has(key(h)));
      if (out) consider(dodgeable, def.mana, { type: 'cast', player, abilityId: slot.id, target: out });
    }
  }
  // Or just walk out: Movement is slower in the Reaction Phase, but costs no Mana.
  const out = [...reachable(state, player)]
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => fromKey(k))
    .find((h) => !danger.has(key(h)) && !own.has(key(h)));
  if (out) consider(dodgeable, 0, { type: 'move', player, to: out });
  return best ? (best as { action: Action }).action : { type: 'endReaction', player };
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

  // 3. Reposition: get out of our own Threat Areas, then toward the ideal range for our attacks.
  if (options.size) {
    const toPost = stepsToFiringPost(state, enemy.pos, idealRange(me));
    const scorePos = (h: Hex) => (ownDanger.has(key(h)) ? -100 : 0) - (toPost.get(key(h)) ?? Infinity);
    let bestPos: Hex | null = null;
    let bestScore = scorePos(me.pos);
    for (const k of options.keys()) {
      const h = fromKey(k);
      const s = scorePos(h);
      if (s > bestScore + 1e-9) {
        bestScore = s;
        bestPos = h;
      }
    }
    // Don't burn the last AP just to shuffle around unless we're standing in our own attack.
    const needsAp = bestPos ? options.get(key(bestPos))! > me.mp : false;
    if (bestPos && (!needsAp || me.ap === AP_PER_TURN || ownDanger.has(key(me.pos)))) {
      return { type: 'move', player, to: bestPos };
    }
  }

  return { type: 'endTurn', player };
}

/**
 * For every hex, how far it is from a good place to attack from: Movement to walk there around
 * rocks, plus a heavy penalty for how far that place is off the ideal range or out of sight.
 * Walking distance (not straight-line distance) keeps the bot from getting stuck behind a wall
 * whose way round first leads away from the enemy.
 */
function stepsToFiringPost(state: GameState, enemyPos: Hex, ideal: number): Map<string, number> {
  const enemy = key(enemyPos);
  const passable = (k: string) => k !== enemy && state.tiles[k] && state.tiles[k].terrain !== 'rock';
  const best = new Map<string, number>();
  const frontier: Array<[string, number]> = [];
  for (const k of Object.keys(state.tiles)) {
    if (!passable(k)) continue;
    const h = fromKey(k);
    // Being off range or out of sight weighs far more than a step of walking, so a long way round
    // to a real firing post still beats standing nearer in a straight line.
    const cost = 10 * Math.abs(distance(h, enemyPos) - ideal) + (hasLOS(state, h, enemyPos) ? 0 : 3);
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

function idealRange(me: Mage): number {
  const ranges = me.abilities
    .map((s) => ABILITIES[s.id])
    .filter((d) => d.effect.type === 'attack')
    .map(abilityRange);
  const ranged = ranges.filter((r) => r > 1);
  // Unlimited ranges would send the bot to the board edge; stay within a comfortable 5.
  return ranged.length ? Math.min(...ranged, 5) : 1;
}

/** Aim points worth evaluating, with their Threat Areas. For Attacks, only aims that cover the enemy. */
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
  for (const aim of aimableHexes(state.tiles, me, shape)) {
    const area = threatArea(state.tiles, me, shape, aim, enemyPos);
    if (!area) continue;
    const keys = new Set(area.map(key));
    if (keys.has(enemy)) out.push([aim, keys]);
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

/** Movement the enemy needs to leave `area`, or Infinity if they can't. */
function escapeCost(state: GameState, from: Hex, area: Set<string>): number {
  if (!area.has(key(from))) return 0;
  const seen = new Set([key(from)]);
  let frontier = [from];
  for (let d = 1; d <= 12; d++) {
    const next: Hex[] = [];
    for (const h of frontier)
      for (const n of neighbors(h)) {
        const k = key(n);
        const t = state.tiles[k];
        if (!t || t.terrain === 'rock' || seen.has(k)) continue;
        if (!area.has(k)) return d;
        seen.add(k);
        next.push(n);
      }
    frontier = next;
  }
  return Infinity;
}

/** Can't dodge in their next Reaction Phase: rooted, or facing a Compelled turn (Sleep, Charm, Fear). */
const isPinned = (m: Mage) => m.statuses.some((s) => s.kind === 'root' || s.kind === 'asleep' || s.kind === 'charm' || s.kind === 'fear');

/** AP the mage will have next turn (fatigue takes some away). */
const nextTurnAp = (m: Mage) => Math.max(0, AP_PER_TURN - (m.statuses.find((s) => s.kind === 'fatigue')?.power ?? 0));

/**
 * Whether the enemy could walk out of `area` in their next Reaction Phase. Instant and homing Attacks,
 * and anything aimed at a Pinned mage, can't be dodged. Reaction Spells (Blink, Ward…) don't count.
 */
function isDodgeable(state: GameState, player: PlayerId, area: Set<string>, unavoidable = false): boolean {
  const enemy = state.mages[other(player)];
  if (unavoidable || isPinned(enemy)) return false;
  return escapeCost(state, enemy.pos, area) <= nextTurnAp(enemy) * mpPerAp(enemy);
}

/** Dodgeable Attacks this mage has already launched this turn (deflected ones aside). */
function dodgeableLaunched(state: GameState, player: PlayerId): number {
  return state.pending.filter((a) => a.caster === player && !a.reflected && isDodgeable(state, player, new Set(a.area), a.homing))
    .length;
}

/**
 * Rule: never pour Mana or AP into Attacks the enemy can simply walk away from. At most one dodgeable
 * Attack per turn, costing no more than 2 Mana or 20% of current Mana, whichever is higher.
 */
function withinDodgeableBudget(state: GameState, player: PlayerId, manaCost: number): boolean {
  const me = state.mages[player];
  return dodgeableLaunched(state, player) === 0 && manaCost <= Math.max(2, 0.2 * me.mana);
}

/** Expected value of landing `hit` on the enemy, given they get a Reaction Phase to dodge. */
function attackValue(state: GameState, player: PlayerId, area: Set<string>, hit: Hit, undodgeable = false): number {
  const enemy = state.mages[other(player)];
  const dmg = hit.damage > 0 ? hitDamage(enemy, hit.damage) : 0;
  let full = dmg;
  if (hit.status && !enemy.statuses.some((s) => s.kind === hit.status!.kind)) full += 1.5;
  if (hit.lifesteal) full += dmg * hit.lifesteal * 0.5;
  if (hit.knockback) full += 0.3;
  if (dmg > 0 && enemy.hp + enemy.shield <= dmg) full += 100;

  if (undodgeable) return full;
  const per = mpPerAp(enemy);
  const cost = escapeCost(state, enemy.pos, area);
  const apToDodge = per > 0 ? Math.ceil(cost / per) : Infinity;
  if (apToDodge > AP_PER_TURN) return full; // unavoidable
  // Dodgeable: still worth something for the AP it forces them to burn.
  return full * 0.3 + apToDodge * 1.2;
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
      const unavoidable = !!(fx.instant || fx.homing);
      if (isDodgeable(state, player, area, unavoidable) && !withinDodgeableBudget(state, player, def.mana)) return 0;
      let score = attackValue(state, player, area, fx.hit, unavoidable || isPinned(enemy));
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
