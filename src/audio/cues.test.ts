import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../game/engine';
import type { Hex } from '../game/hex';
import type { Action, GameEvent, GameState, Loadout } from '../game/types';
import { DAMAGE_LAG_S, MAX_SEQUENCE_S, MAX_STEPS, newEvents, panFor, planSounds, RESOLVE_GAP_S, type ScheduledSound, type Viewer } from './cues';

const loadout: Loadout = {
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike', 'firebolt', 'icicle', 'ward', 'counterspell', 'block', 'mend', 'blink', 'spark'],
  passiveIds: [],
};

function duel(a: Hex = { q: 0, r: 2 }, b: Hex = { q: 0, r: -1 }): GameState {
  const g = createGame({
    seed: 3,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout, p2: loadout },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.mages.p1.pos = a;
  g.mages.p2.pos = b;
  g.mages.p1.mana = g.mages.p2.mana = 30;
  return g;
}
const act = (g: GameState, a: Action) => applyAction(g, a);
const cast = (g: GameState, abilityId: string, target: Hex, player: 'p1' | 'p2' = 'p1', attackId?: number) =>
  act(g, { type: 'cast', player, abilityId, target, attackId });
const ids = (list: ScheduledSound[]) => list.map((s) => s.sound.id);
/** The sounds an action makes: plan only the events it added. */
const soundsOf = (before: GameState, after: GameState, viewer: Viewer = 'p1') =>
  planSounds(after.events.slice(before.events.length), viewer, 6);

describe('engine cues', () => {
  it('a Move carries how many hexes it walked, and an instant Spell is a cast', () => {
    const g = duel();
    const moved = act(g, { type: 'move', player: 'p1', to: { q: 0, r: 1 } });
    expect(moved.events.at(-1)!.cue).toEqual({ kind: 'move', hexes: 1 });
    const healed = cast(g, 'mend', g.mages.p1.pos);
    expect(healed.events.some((e) => e.cue?.kind === 'cast' && e.cue.abilityId === 'mend')).toBe(true);
  });

  it('launching an Attack is a launch, and it lands as a resolve after the Reaction Phase', () => {
    const g0 = duel();
    const launched = cast(g0, 'firebolt', g0.mages.p2.pos);
    expect(soundsOf(g0, launched).map((s) => s.sound)).toEqual([{ id: 'launch', abilityId: 'firebolt' }]);
    const reacting = act(launched, { type: 'endTurn', player: 'p1' });
    expect(reacting.phase).toBe('reaction');
    const landed = act(reacting, { type: 'endReaction', player: 'p2' });
    expect(ids(soundsOf(reacting, landed, 'p2'))).toEqual(['resolve', 'damage', 'actionStart']);
  });
});

describe('planning Resolution sounds', () => {
  const launchTwo = () => {
    let g = duel();
    g = cast(g, 'firebolt', g.mages.p2.pos);
    g = cast(g, 'icicle', g.mages.p2.pos);
    return act(g, { type: 'endTurn', player: 'p1' });
  };

  it('plays Attacks one after another in launch order, each with its damage sound just after', () => {
    const g = launchTwo();
    const landed = act(g, { type: 'endReaction', player: 'p2' });
    const plan = soundsOf(g, landed, 'p2');
    expect(plan.map((s) => s.sound)).toMatchObject([
      { id: 'resolve', abilityId: 'firebolt' },
      { id: 'damage' },
      { id: 'resolve', abilityId: 'icicle' },
      { id: 'damage' },
      { id: 'actionStart' },
    ]);
    expect(plan[0].delay).toBe(0);
    expect(plan[1].delay).toBeCloseTo(DAMAGE_LAG_S);
    expect(plan[2].delay).toBeCloseTo(RESOLVE_GAP_S);
    expect(plan[4].delay).toBeGreaterThanOrEqual(2 * RESOLVE_GAP_S); // the Action Phase waits for the sequence
  });

  it('plays no damage sound when a shield takes the whole Hit, but an absorbed one', () => {
    let g = launchTwo();
    g.mages.p2.shield = 99;
    const warded = g;
    const landed = act(warded, { type: 'endReaction', player: 'p2' });
    expect(ids(soundsOf(warded, landed, 'p2'))).toEqual(['resolve', 'absorbed', 'resolve', 'absorbed', 'actionStart']);
  });

  it('a Block that takes all the damage is absorbed, and a Counterspell leaves no Resolution sound', () => {
    let g = duel();
    g = cast(g, 'spark', g.mages.p2.pos); // 1 damage
    g = act(g, { type: 'endTurn', player: 'p1' });
    const blocked = act(g, { type: 'cast', player: 'p2', abilityId: 'block', target: g.mages.p2.pos });
    const landed = act(blocked, { type: 'endReaction', player: 'p2' });
    expect(ids(soundsOf(blocked, landed, 'p2'))).toEqual(['resolve', 'absorbed', 'actionStart']);

    let h = duel();
    h = cast(h, 'firebolt', h.mages.p2.pos);
    h = act(h, { type: 'endTurn', player: 'p1' });
    const countered = cast(h, 'counterspell', h.mages.p2.pos, 'p2', h.pending[0].id);
    expect(ids(soundsOf(h, countered, 'p2'))).toEqual(['cast']);
    const after = act(countered, { type: 'endReaction', player: 'p2' });
    expect(ids(soundsOf(countered, after, 'p2'))).toEqual(['actionStart']);
  });

  it('a missed Attack still sounds, with no damage sound', () => {
    let g = duel();
    g = cast(g, 'icicle', { q: 3, r: -3 });
    g = act(g, { type: 'endTurn', player: 'p1' });
    const landed = act(g, { type: 'endReaction', player: 'p2' });
    expect(ids(soundsOf(g, landed, 'p2'))).toEqual(['resolve', 'actionStart']);
  });

  it('squeezes a very long Resolution into the time limit', () => {
    const events: GameEvent[] = Array.from({ length: 12 }, (_, i) => ({
      turn: 2,
      kind: 'cast',
      text: `attack ${i}`,
      cue: { kind: 'resolve', abilityId: 'firebolt' },
    }));
    const plan = planSounds(events, 'p1', 6);
    expect(Math.max(...plan.map((s) => s.delay))).toBeLessThanOrEqual(MAX_SEQUENCE_S + 1e-9);
  });
});

describe('who hears what', () => {
  const turnEvents = (player: 'p1' | 'p2'): GameEvent[] => [
    { turn: 2, kind: 'turn', text: '', cue: { kind: 'reactionStart', player } },
    { turn: 2, kind: 'turn', text: '', cue: { kind: 'actionStart', player } },
  ];

  it('a player hears only their own phase starts; hotseat hears both; a spectator none', () => {
    expect(ids(planSounds(turnEvents('p2'), 'p1', 6))).toEqual([]);
    expect(ids(planSounds(turnEvents('p1'), 'p1', 6))).toEqual(['reactionStart', 'actionStart']);
    expect(ids(planSounds(turnEvents('p2'), 'both', 6))).toEqual(['reactionStart', 'actionStart']);
    expect(ids(planSounds(turnEvents('p1'), null, 6))).toEqual([]);
  });

  it('results: win, lose, or a neutral fanfare for hotseat, spectators and draws', () => {
    const result = (winner: 'p1' | 'p2' | 'draw'): GameEvent[] => [{ turn: 9, kind: 'victory', text: '', cue: { kind: 'result', winner } }];
    expect(ids(planSounds(result('p1'), 'p1', 6))).toEqual(['win']);
    expect(ids(planSounds(result('p2'), 'p1', 6))).toEqual(['lose']);
    expect(ids(planSounds(result('draw'), 'p1', 6))).toEqual(['fanfare']);
    expect(ids(planSounds(result('p1'), 'both', 6))).toEqual(['fanfare']);
    expect(ids(planSounds(result('p2'), null, 6))).toEqual(['fanfare']);
  });

  it('plays one footstep per hex walked, at most six, in a quick patter', () => {
    const walk = (hexes: number): GameEvent[] => [{ turn: 1, kind: 'move', text: '', cue: { kind: 'move', hexes } }];
    expect(planSounds(walk(3), 'p1', 6).map((s) => s.delay)).toEqual([0, 0.11, 0.22]);
    expect(planSounds(walk(20), 'p1', 6)).toHaveLength(MAX_STEPS);
  });

  it('a crystal becoming Ready and being absorbed are heard by everyone', () => {
    const events: GameEvent[] = [
      { turn: 3, kind: 'status', text: '', cue: { kind: 'crystalReady', size: 'large' } },
      { turn: 3, kind: 'heal', text: '', cue: { kind: 'crystalAbsorb', size: 'small' } },
    ];
    for (const v of ['p1', 'both', null] as const) expect(ids(planSounds(events, v, 6))).toEqual(['crystalReady', 'crystalAbsorb']);
  });
});

describe('panning', () => {
  it('pans lightly by board column and never past 0.5', () => {
    expect(panFor({ q: 0, r: 0 }, 6)).toBe(0);
    expect(panFor({ q: 6, r: 0 }, 6)).toBeCloseTo(0.5);
    expect(panFor({ q: -6, r: 0 }, 6)).toBeCloseTo(-0.5);
    expect(panFor({ q: 20, r: 0 }, 6)).toBe(0.5);
    expect(panFor(undefined, 6)).toBe(0);
  });
});

describe('new events', () => {
  const ev = (turn: number): GameEvent => ({ turn, kind: 'turn', text: 'x' });

  it('returns only what was added since last time', () => {
    const events = [ev(1), ev(1), ev(2)];
    expect(newEvents(events, 1)).toEqual({ fresh: events.slice(1), seen: 3 });
  });

  it('is silent when the log is rewound or jumped across', () => {
    expect(newEvents([ev(1)], 5)).toEqual({ fresh: [], seen: 1 });
    expect(newEvents([ev(1), ev(2), ev(3), ev(4)], 0).fresh).toEqual([]); // a big scrub forward
    expect(newEvents(Array.from({ length: 50 }, () => ev(2)), 0).fresh).toEqual([]);
  });
});
