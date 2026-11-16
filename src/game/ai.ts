import { ABILITIES } from './content';
import { crystalYield } from './crystals';
import {
  abilityRange,
  bidCommitment,
  absorbError,
  apCost,
  castError,
  hasLOS,
  hitDamage,
  incoming,
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
 * The AI's secret bid for the open contest: a pseudo-random whole number from 0 up to the effect's
 * severity, never more than the Mana it has. Derived from the match's seeded state, so replays and
 * headless games stay deterministic, while a human opponent can't predict it in play.
 */
export function aiBid(state: GameState, player: PlayerId): number {
  const b = state.bidding;
  if (!b) return 0;
  const fx = ABILITIES[b.abilityId].effect;
  const severity = fx.type === 'contest' ? fx.severity : 0;
  const max = Math.max(0, Math.min(state.mages[player].mana, severity));
  const [r] = rngStep((state.rng ^ Math.imul(b.id, 0x9e3779b1) ^ (player === 'p1' ? 0x5bd1e995 : 0x1b873593)) >>> 0);
  return Math.floor(r * (max + 1));
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
  const danger = areaOf(threats);
  if (!danger.has(key(me.pos))) return { type: 'endReaction', player };

  const own = areaOf(state.pending.filter((a) => a.caster === player));

  const hitting = threats.filter((a) => a.area.includes(key(me.pos)));
  const damage = (a: PendingAttack) => (a.hit.damage > 0 ? hitDamage(me, a.hit.damage) : 0);
  const harm = (a: PendingAttack) => damage(a) + (a.hit.status ? 1.5 : 0);
  const total = hitting.reduce((n, a) => n + harm(a), 0);
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
      if (out) consider(total, def.mana, { type: 'cast', player, abilityId: slot.id, target: out });
    }
  }
  // Or just walk out: Movement is slower in the Reaction Phase, but costs no Mana.
  const out = [...reachable(state, player)]
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => fromKey(k))
    .find((h) => !danger.has(key(h)) && !own.has(key(h)));
  if (out) consider(total, 0, { type: 'move', player, to: out });
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
    const ideal = idealRange(me);
    const scorePos = (h: Hex) =>
      (ownDanger.has(key(h)) ? -100 : 0) -
      Math.abs(distance(h, enemy.pos) - ideal) +
      (hasLOS(state, h, enemy.pos) ? 0.5 : 0);
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

/** Expected value of landing `hit` on the enemy, given they get a Reaction Phase to dodge. */
function attackValue(state: GameState, player: PlayerId, area: Set<string>, hit: Hit): number {
  const enemy = state.mages[other(player)];
  const dmg = hit.damage > 0 ? hitDamage(enemy, hit.damage) : 0;
  let full = dmg;
  if (hit.status && !enemy.statuses.some((s) => s.kind === hit.status!.kind)) full += 1.5;
  if (hit.lifesteal) full += dmg * hit.lifesteal * 0.5;
  if (hit.knockback) full += 0.3;
  if (dmg > 0 && enemy.hp + enemy.shield <= dmg) full += 100;

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
      let score = attackValue(state, player, area, fx.hit);
      // Standing in our own Threat Area is fine only if we can still walk out.
      if (area.has(key(me.pos))) score -= me.ap > apCost(def) || me.mp > 1 ? 0.5 : fx.hit.damage * 1.5;
      return score / cost;
    }
    case 'heal':
      return me.hp <= me.maxHp * 0.6 ? Math.min(me.maxHp - me.hp, fx.amount) / cost : 0;
    case 'shield':
      // Shields hold until our next resolution: worth it when the enemy can reach us.
      return dist <= 6 && me.shield === 0 && me.ap === 1 ? 1 : 0;
    case 'contest': {
      // Worth it as a combo: a rooted enemy can't step out of an Attack we already launched at them.
      // Keep enough Mana back to bid with.
      const covered = state.pending.some((a) => a.caster === player && a.area.includes(key(enemy.pos)));
      return covered && me.mana >= def.mana + 2 ? 5 : 0;
    }
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
