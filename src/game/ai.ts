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
  const me = state.units[player];
  const enemy = state.units[other(player)];

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
      .filter((d) => d.effect.type === 'damage')
      .map((d) => abilityRange(me, d));
    const ideal = ranges.length ? Math.max(1, Math.min(...ranges)) : 1;
    const scorePos = (h: Hex) =>
      -Math.abs(distance(h, enemy.pos) - ideal) +
      (hasLOS(state, h, enemy.pos) ? 0.5 : 0) +
      (state.tiles[`${h.q},${h.r}`]?.terrain === 'rune' ? 0.3 : 0);
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
  const me = state.units[player];
  const enemy = state.units[other(player)];
  const def = ABILITIES[abilityId];
  const fx = def.effect;
  switch (fx.type) {
    case 'damage': {
      const dmg = fx.amount + me.power;
      let score = 0;
      if (distance(enemy.pos, target) <= def.aoe) {
        score += dmg + (fx.status ? 1 : 0);
        if (enemy.hp + enemy.shield <= dmg) score += 100;
      }
      if (distance(me.pos, target) <= def.aoe) score -= dmg * 1.5; // don't nuke yourself
      return score / def.apCost;
    }
    case 'heal':
      return me.hp <= me.maxHp * 0.6 ? Math.min(me.maxHp - me.hp, fx.amount + me.power) / def.apCost : 0;
    case 'shield':
      return distance(me.pos, enemy.pos) <= 5 && me.ap === def.apCost ? 1 : 0;
    case 'blink':
      return 0; // movement handles positioning; blink left as an exercise for a smarter bot
  }
}
