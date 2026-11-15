import { ABILITIES } from './content';
import { castError, hasLOS, reachable, validTargets, abilityRange } from './engine';
import { distance, fromKey, type Hex } from './hex';
import { other, type Action, type GameState, type PlayerId } from './types';

/**
 * Greedy bot: returns the single next action for `player`. Call it repeatedly
 * (with a small delay for readability) until it returns endTurn.
 * Every action it returns either spends AP or movement, so it always terminates.
 */
export function chooseAction(state: GameState, player: PlayerId): Action {
  const me = state.mages[player];
  const enemy = state.mages[other(player)];

  // 1. Best cast available right now.
  let best: { score: number; action: Action } | null = null;
  for (const slot of me.abilities) {
    const def = ABILITIES[slot.id];
    if (castError(state, player, slot.id)) continue;
    for (const target of validTargets(state, player, slot.id)) {
      const score = scoreCast(state, player, slot.id, target);
      if (score > 0 && (!best || score > best.score)) {
        best = { score, action: { type: 'cast', player, abilityId: def.id, target } };
      }
    }
  }
  if (best) return best.action;

  // 2. Reposition to the ideal distance for our damage abilities.
  if (me.moveLeft > 0) {
    const ranges = me.abilities
      .map((s) => ABILITIES[s.id])
      .filter((d) => d.effect.type === 'damage' && d.effect.amount > 0)
      .map((d) => (d.targeting === 'self' ? d.aoe : abilityRange(me, d)));
    const ideal = ranges.length ? Math.max(1, Math.min(...ranges)) : 1;
    const scorePos = (h: Hex) =>
      -Math.abs(distance(h, enemy.pos) - ideal) +
      (hasLOS(state, h, enemy.pos) ? 0.5 : 0);
    let bestPos: Hex | null = null;
    let bestScore = scorePos(me.pos);
    for (const k of reachable(state, player).keys()) {
      const h = fromKey(k);
      const s = scorePos(h);
      if (s > bestScore + 1e-9) {
        bestScore = s;
        bestPos = h;
      }
    }
    if (bestPos) return { type: 'move', player, to: bestPos };
  }

  return { type: 'endTurn', player };
}

function scoreCast(state: GameState, player: PlayerId, abilityId: string, target: Hex): number {
  const me = state.mages[player];
  const enemy = state.mages[other(player)];
  const def = ABILITIES[abilityId];
  const fx = def.effect;
  const dist = distance(me.pos, enemy.pos);
  switch (fx.type) {
    case 'damage': {
      const hitsEnemy = distance(enemy.pos, target) <= def.aoe;
      const hitsMe = !def.spareCaster && distance(me.pos, target) <= def.aoe;
      const vuln = enemy.statuses.find((s) => s.kind === 'vulnerable')?.power ?? 0;
      const raw = fx.amount > 0 ? fx.amount : 0;
      const dmg = raw > 0 ? Math.max(1, raw + vuln - enemy.armor) : 0;
      let score = 0;
      if (hitsEnemy) {
        score += dmg;
        if (fx.status && !enemy.statuses.some((s) => s.kind === fx.status!.kind)) score += 1.5;
        if (fx.lifesteal) score += dmg * fx.lifesteal * (me.hp < me.maxHp ? 0.8 : 0.2);
        if (fx.knockback) score += 0.3;
        if (dmg > 0 && enemy.hp + enemy.shield <= dmg) score += 100;
      }
      if (hitsMe) score -= (raw || 1) * 1.5; // don't nuke yourself
      return score / Math.max(1, def.apCost + def.mana / 4);
    }
    case 'heal':
      return me.hp <= me.maxHp * 0.6 ? Math.min(me.maxHp - me.hp, fx.amount) / def.apCost : 0;
    case 'cleanse': {
      const bad = me.statuses.length;
      const missing = me.maxHp - me.hp;
      return bad > 0 || me.hp <= me.maxHp * 0.6 ? (bad * 2 + Math.min(missing, fx.heal)) / def.apCost : 0;
    }
    case 'shield':
      return dist <= 5 && me.ap === def.apCost ? 1 : 0;
    case 'sacrifice':
      // Only when healthy and the enemy is within reach of our damage.
      return me.hp > me.maxHp * 0.6 && me.hp > fx.hp + 4 && dist <= maxDamageRange(me) ? 1.2 : 0;
    case 'haste':
      return dist > maxDamageRange(me) && me.moveLeft <= me.move ? 1 : 0;
    case 'refresh': {
      const waiting = me.abilities.filter((a) => a.id !== def.id).reduce((n, a) => n + a.cooldown, 0);
      return waiting >= 3 ? 1 : 0;
    }
    case 'blink':
    case 'swap':
    case 'terraform':
      return 0; // positional tricks are left to humans (and a smarter future bot)
  }
}

function maxDamageRange(me: GameState['mages']['p1']): number {
  const ranges = me.abilities
    .map((s) => ABILITIES[s.id])
    .filter((d) => d.effect.type === 'damage' && d.effect.amount > 0)
    .map((d) => (d.targeting === 'self' ? d.aoe : abilityRange(me, d)));
  return ranges.length ? Math.max(...ranges) : 1;
}
