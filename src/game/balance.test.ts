import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { actionError, applyAction, bidCap, bidCommitment, castError, createGame, hitDamage, mpPerAp, reachable, roundsLeftLabel } from './engine';
import { distance } from './hex';
import { threatArea } from './threat';
import { PERMANENT, type Action, type GameState, type Loadout, type PlayerId } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 4, manaRegen: 0, movespeed: 0 },
  weapon: 'unarmed',
  abilityIds: abilities,
  passiveIds: [],
});

/** Open board; P1 at (0,3) holds `abilities`, P2 at (0,0). Both have 30 Mana. */
function duel(abilities: string[]): GameState {
  const g = createGame({
    seed: 3,
    radius: 7,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(abilities), p2: loadout([]) },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = { q: 0, r: 3 };
  g.mages.p2.pos = { q: 0, r: 0 };
  g.mages.p1.mana = g.mages.p2.mana = 30;
  return g;
}
const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};
const cast = (g: GameState, abilityId: string, target = g.mages.p2.pos) => act(g, { type: 'cast', player: 'p1', abilityId, target });
const bid = (g: GameState, player: PlayerId, amount: number) =>
  act(g, { type: 'commitBid', player, hash: bidCommitment(g.bidding!.id, player, amount, `s-${player}`) });
const reveal = (g: GameState, player: PlayerId, amount: number) => act(g, { type: 'revealBid', player, amount, salt: `s-${player}` });
const contest = (g: GameState, a: number, b: number) => reveal(reveal(bid(bid(g, 'p1', a), 'p2', b), 'p1', a), 'p2', b);
const endTurn = (g: GameState) => act(g, { type: 'endTurn', player: g.active });
const endReaction = (g: GameState) => act(g, { type: 'endReaction', player: g.active });
/** P1 ends its turn; P2 reacts (nothing) so the attacks land. */
const land = (g: GameState) => endReaction(endTurn(g));

describe('max bid', () => {
  it('every contested Spell has one: Stasis 4, Doom 5, Hold Person 7', () => {
    expect(bidCap(ABILITIES.stasis)).toBe(4);
    expect(bidCap(ABILITIES['hold-person'])).toBe(7);
    expect(bidCap(ABILITIES.doom)).toBe(5);
  });

  it('a bid over the max counts as 0 and forfeits all of that mage’s Mana, even with Mana to spare', () => {
    let g = contest(cast(duel(['stasis']), 'stasis'), 2, 5);
    expect(g.mages.p2.mana).toBe(0);
    expect(g.mages.p2.statuses.some((s) => s.kind === 'root')).toBe(true); // 2 ≥ 0
    g = contest(cast(duel(['stasis']), 'stasis'), 2, 4); // exactly the max is fine
    expect(g.mages.p2.mana).toBe(26);
  });
});

describe('Doom', () => {
  it('is a secret-bid curse (range 8, no line of sight) that makes every hit +4, permanently', () => {
    expect(ABILITIES.doom).toMatchObject({ kind: 'spell', targeting: 'enemy', range: 8, noLos: true });
    let g = duel(['doom']);
    g.mages.p1.pos = { q: 0, r: 8 }; // 8 away, with rock between
    g.tiles['0,4'].terrain = 'rock';
    expect(castError(g, 'p1', 'doom', g.mages.p2.pos)).toBeNull();
    g = contest(cast(g, 'doom'), 3, 1);
    const curse = g.mages.p2.statuses.find((s) => s.kind === 'vulnerable')!;
    expect(curse).toMatchObject({ power: 4, turns: PERMANENT });
  });

  it('never wears off', () => {
    let g = contest(cast(duel(['doom']), 'doom'), 3, 0);
    for (let i = 0; i < 6; i++) g = endTurn(g);
    expect(g.mages.p2.statuses.some((s) => s.kind === 'vulnerable')).toBe(true);
  });
});

describe('Magic Missile', () => {
  it('costs 2 pts and 7 Mana, reaches 8 without line of sight, and always lands for 6', () => {
    expect(ABILITIES['magic-missile']).toMatchObject({ points: 2, mana: 7 });
    let g = duel(['magic-missile']);
    g.mages.p1.pos = { q: 0, r: 8 };
    g.tiles['0,4'].terrain = 'rock';
    expect(castError(g, 'p1', 'magic-missile', g.mages.p2.pos)).toBeNull();
    g = land(cast(g, 'magic-missile'));
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 6);
  });

  it('cannot be avoided by moving', () => {
    const g0 = duel(['magic-missile']);
    g0.mages.p2.movespeed = 6; // enough to move while reacting
    let g = cast(g0, 'magic-missile');
    g = endTurn(g);
    g = act(g, { type: 'move', player: 'p2', to: { q: 1, r: -1 } });
    expect(g.mages.p2.pos).toEqual({ q: 1, r: -1 });
    g = endReaction(g);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 6);
  });

  it('only targets the enemy mage', () => {
    const g = duel(['magic-missile']);
    expect(castError(g, 'p1', 'magic-missile', { q: 1, r: 1 })).toMatch(/enemy/i);
  });
});

describe('Soul Drain', () => {
  it('hits instantly for 5 and heals 5, with no Reaction Phase, then waits a turn', () => {
    expect(ABILITIES['soul-drain']).toMatchObject({ points: 2, mana: 10, cooldown: 1 });
    const g0 = duel(['soul-drain']);
    g0.mages.p1.pos = { q: 0, r: 4 }; // range 4
    g0.mages.p1.hp = 3;
    const g = cast(g0, 'soul-drain');
    expect(g.pending).toHaveLength(0);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 5);
    expect(g.mages.p1.hp).toBe(8);
    expect(castError(g, 'p1', 'soul-drain', g.mages.p2.pos)).toBeTruthy(); // not again this turn
  });
});

describe('Channel Mana', () => {
  it('is a 1-pt Technique: 1 AP, no Mana, gain 2 Mana, not on consecutive turns', () => {
    expect(ABILITIES['channel-mana']).toMatchObject({ kind: 'technique', points: 1, mana: 0, cooldown: 2 });
    const g0 = duel(['channel-mana']);
    g0.mages.p1.mana = 5;
    const g = cast(g0, 'channel-mana', g0.mages.p1.pos);
    expect(g.mages.p1.mana).toBe(7);
    expect(g.mages.p1.ap).toBe(1);
    expect(castError(g, 'p1', 'channel-mana', g.mages.p1.pos)).toBeTruthy();
  });

  it('never overfills Max Mana', () => {
    const g0 = duel(['channel-mana']);
    g0.mages.p1.mana = g0.mages.p1.maxMana - 1;
    expect(cast(g0, 'channel-mana', g0.mages.p1.pos).mages.p1.mana).toBe(g0.mages.p1.maxMana);
  });
});

describe("Dragon's Breath", () => {
  it('stops at rock: nothing behind it, nor the rock itself, is in the cone', () => {
    const g = duel([]);
    const from = { q: 0, r: 0 };
    const open = threatArea(g.tiles, from, { kind: 'cone', range: 4 }, { q: 0, r: -2 })!.map((h) => `${h.q},${h.r}`);
    expect(open).toContain('0,-2');
    expect(open).toContain('0,-3');
    g.tiles['0,-1'].terrain = 'rock';
    const blocked = threatArea(g.tiles, from, { kind: 'cone', range: 4 }, { q: 0, r: -2 })!.map((h) => `${h.q},${h.r}`);
    expect(blocked).not.toContain('0,-1');
    expect(blocked).not.toContain('0,-2');
    expect(blocked).not.toContain('0,-3');
  });
});

describe('round limit', () => {
  const finish = (g: GameState) => endTurn(endTurn(g)); // P1's turn, then P2's: the last round ends
  const short = () => {
    const g = duel([]);
    g.config.maxTurns = 2; // one round
    return g;
  };

  it('counts down: 12 Rounds Left, then Final Round', () => {
    const g = createGame({ seed: 1, radius: 7, turnSeconds: 20, maxTurns: 24, loadouts: { p1: loadout([]), p2: loadout([]) }, names: { p1: 'A', p2: 'B' } });
    expect(roundsLeftLabel(g)).toBe('12 Rounds Left');
    g.turn = 22; // round 11
    expect(roundsLeftLabel(g)).toBe('2 Rounds Left');
    g.turn = 23; // round 12
    expect(roundsLeftLabel(g)).toBe('Final Round');
  });

  it('is won by the higher share of HP remaining', () => {
    let g = short();
    g.mages.p2.hp = g.mages.p2.maxHp - 1;
    expect(finish(g).winner).toBe('p1');
    g = short();
    g.mages.p1.hp = g.mages.p1.maxHp - 1;
    expect(finish(g).winner).toBe('p2');
    g = short();
    g.mages.p1.maxHp = 20;
    g.mages.p1.hp = 15; // 75%, against P2's 90%
    g.mages.p2.hp = g.mages.p2.maxHp * 0.9;
    expect(finish(g).winner).toBe('p2');
  });

  it('waits for the second mage’s last Attacks: P1 still gets a Reaction Phase, and they land before the result', () => {
    // P2 is the one launching here, so give P2 the Spell and P1 the target.
    let g = createGame({ seed: 3, radius: 7, turnSeconds: 20, maxTurns: 2, loadouts: { p1: loadout([]), p2: loadout(['lightning-bolt']) }, names: { p1: 'A', p2: 'B' } });
    for (const t of Object.values(g.tiles)) t.terrain = 'plain';
    g.crystals = [];
    g.mages.p1.pos = { q: 0, r: 3 };
    g.mages.p2.pos = { q: 0, r: 0 };
    g.mages.p2.mana = 30;
    g = endTurn(g); // P1
    g = act(g, { type: 'cast', player: 'p2', abilityId: 'lightning-bolt', target: g.mages.p1.pos });
    g = endTurn(g); // P2 ends the last turn
    expect(g.winner).toBeNull();
    expect(g.phase).toBe('reaction');
    expect(g.active).toBe('p1');
    g = endReaction(g);
    expect(g.mages.p1.hp).toBeLessThan(g.mages.p1.maxHp);
    expect(g.winner).toBe('p2'); // P1 took the hit, so P2 has the higher share of HP
  });

  it('goes to the mage who moves second on a tie', () => {
    const g = finish(short());
    expect(g.winner).toBe('p2');
    expect(g.events.at(-1)?.text).toMatch(/goes second/);
  });
});

describe('control spells', () => {
  const has = (g: GameState, player: PlayerId, kind: string) => g.mages[player].statuses.some((s) => s.kind === kind);

  it('all cost 2 pts with the cooldowns they were given', () => {
    const want: Record<string, [number, number]> = {
      entangle: [7, 3], 'hold-person': [7, 4], slow: [5, 4], charm: [5, 3], fear: [5, 3], sleep: [5, 4], 'magic-armor': [4, 4], 'lightning-bolt': [2, 1],
    };
    for (const [id, [mana, cooldown]] of Object.entries(want)) expect(ABILITIES[id], id).toMatchObject({ points: 2, mana, cooldown });
    expect(ABILITIES['cold-touch']).toMatchObject({ points: 1, mana: 2 });
    expect(ABILITIES.stasis).toMatchObject({ mana: 4 });
  });

  it('Entangle needs range 5 and line of sight, and roots for the next 2 turns', () => {
    let g = duel(['entangle']);
    g.mages.p1.pos = { q: 0, r: 6 };
    expect(castError(g, 'p1', 'entangle', g.mages.p2.pos)).toMatch(/range/i);
    g.mages.p1.pos = { q: 0, r: 4 };
    g.tiles['0,2'].terrain = 'rock';
    expect(castError(g, 'p1', 'entangle', g.mages.p2.pos)).toMatch(/line of sight/i);
    g.tiles['0,2'].terrain = 'plain';
    g = cast(g, 'entangle');
    expect(g.mages.p1.mana).toBe(23);
    expect(g.bidding).toBeNull(); // no bid: it just lands
    g = endTurn(g);
    expect(reachable(g, 'p2').size).toBe(0);
    g = endTurn(endTurn(g)); // P2 ends, P1 ends: P2's second turn
    expect(reachable(g, 'p2').size).toBe(0);
    g = endTurn(endTurn(g)); // and the third: free again
    expect(has(g, 'p2', 'root')).toBe(false);
    expect(reachable(g, 'p2').size).toBeGreaterThan(0);
  });

  it('Hold Person is a bid (max 7) that roots for 3 turns', () => {
    const g = contest(cast(duel(['hold-person']), 'hold-person'), 7, 2);
    expect(g.mages.p2.statuses.find((s) => s.kind === 'root')).toMatchObject({ turns: 3 });
    expect(contest(cast(duel(['hold-person']), 'hold-person'), 1, 2).mages.p2.statuses).toHaveLength(0);
  });

  it('Slow takes 1 AP off for the next 3 turns', () => {
    let g = contest(cast(duel(['slow']), 'slow'), 5, 0);
    const aps: number[] = [];
    for (let i = 0; i < 4; i++) {
      g = endTurn(g); // P2's turn starts
      aps.push(g.mages.p2.ap);
      g = endTurn(g); // P2 ends, back to P1
    }
    expect(aps).toEqual([1, 1, 1, 2]);
  });

  it('Charm skips the reaction, then walks the target toward the caster with all their movement', () => {
    let g = duel(['charm', 'firebolt']);
    g = cast(g, 'firebolt');
    g = contest(cast(g, 'charm'), 5, 0);
    expect(has(g, 'p2', 'charm')).toBe(true);
    g = endTurn(g);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4); // the Firebolt landed, with no Reaction Phase
    expect(g.mages.p2.pos).toEqual({ q: 0, r: 2 }); // walked up to the caster
    expect(g.active).toBe('p1'); // and their whole turn is gone
    expect(g.phase).toBe('action');
    expect(has(g, 'p2', 'charm')).toBe(false);
  });

  it('Fear sends them as far away as their movement allows', () => {
    let g = contest(cast(duel(['fear']), 'fear'), 5, 0);
    g = endTurn(g);
    expect(distance(g.mages.p2.pos, g.mages.p1.pos)).toBe(3 + 3 * 2); // 3 Movespeed x 2 AP further
    expect(g.active).toBe('p1');
  });

  it('a rooted mage can neither close in nor flee', () => {
    let g = contest(cast(duel(['charm', 'hold-person']), 'charm'), 5, 0);
    g.mages.p2.statuses.push({ kind: 'root', turns: 2, power: 0 });
    g = endTurn(g);
    expect(g.mages.p2.pos).toEqual({ q: 0, r: 0 });
  });

  it('Sleep skips the reaction and the whole turn for 2 turns', () => {
    let g = contest(cast(duel(['sleep']), 'sleep'), 5, 0);
    g = endTurn(g);
    expect(g.active).toBe('p1'); // P2 slept through it
    expect(has(g, 'p2', 'asleep')).toBe(true);
    g = endTurn(g);
    expect(g.active).toBe('p1'); // and the one after
    expect(has(g, 'p2', 'asleep')).toBe(false);
    g = endTurn(g);
    expect(g.active).toBe('p2'); // awake at last
    expect(g.mages.p2.ap).toBe(2);
  });

  it('damage wakes a sleeper, who then keeps their normal AP', () => {
    let g = duel(['sleep', 'firebolt']);
    g = cast(g, 'firebolt');
    g = contest(cast(g, 'sleep'), 5, 0);
    g = endTurn(g);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4);
    expect(has(g, 'p2', 'asleep')).toBe(false);
    expect(g.active).toBe('p2');
    expect(g.phase).toBe('action');
    expect(g.mages.p2.ap).toBe(2);
  });
});

describe('Magic Armor, Lightning Bolt and Cold Touch', () => {
  it('Magic Armor takes 4 off every hit (never below 1) for this turn and the next two', () => {
    let g = cast(duel(['magic-armor']), 'magic-armor', { q: 0, r: 3 });
    expect(hitDamage(g.mages.p1, 6)).toBe(2);
    expect(hitDamage(g.mages.p1, 3)).toBe(1);
    const armored = () => g.mages.p1.statuses.some((s) => s.kind === 'armored');
    g = endTurn(endTurn(g)); // P1's next turn
    expect(armored()).toBe(true);
    g = endTurn(endTurn(g)); // the one after: armour ends with it
    expect(armored()).toBe(true);
    g = endTurn(endTurn(g));
    expect(armored()).toBe(false);
  });

  it('Lightning Bolt hits for 4 along a Line of 8 and costs the target 1 AP', () => {
    let g = duel(['lightning-bolt']);
    g.mages.p1.pos = { q: 0, r: 7 };
    g = land(cast(g, 'lightning-bolt', { q: 0, r: 0 }));
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4);
    expect(g.mages.p2.ap).toBe(1);
  });

  it('Lightning Bolt can be cast every turn but not twice in one', () => {
    let g = cast(duel(['lightning-bolt']), 'lightning-bolt');
    expect(castError(g, 'p1', 'lightning-bolt', g.mages.p2.pos)).toBeTruthy();
    g = endTurn(g);
    g = endReaction(g);
    g = endTurn(g);
    expect(castError(g, 'p1', 'lightning-bolt', g.mages.p2.pos)).toBeNull();
  });

  it('Cold Touch slows an adjacent target (-1 Movespeed) for 3 turns', () => {
    let g = duel(['cold-touch']);
    g.mages.p1.pos = { q: 0, r: 1 };
    g = land(cast(g, 'cold-touch', { q: 0, r: 0 }));
    expect(g.mages.p2.statuses.find((s) => s.kind === 'slow')).toMatchObject({ power: 1, turns: 3 });
    expect(mpPerAp(g.mages.p2)).toBe(2);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp);
  });
});
