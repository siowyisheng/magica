import { useCallback, useEffect, useRef, useState } from 'react';
import { aiBid } from '../game/ai';
import { bidCommitment } from '../game/engine';
import type { Action, GameState, PlayerId } from '../game/types';
import type { BidReveal } from './BidPanel';
import { useCountdown } from './useCountdown';

/** The longest the secret bidding can take. It ends early as soon as both duellists have bid. */
export const BID_WINDOW_S = 7;
/** How long revealed bids stay on screen; the caster's turn timer gets this back. */
export const REVEAL_S = 2;
/** After the window closes, a duellist who still hasn't revealed counts as bidding 0. */
const REVEAL_DEADLINE_MS = 3000;

/** 16 random bytes as hex: without a salt, a commitment could be matched by hashing every possible bid. */
function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs secret bids on this screen: the window, our lock-ins, the AI's lock-in, closing the window,
 * revealing and the reveal display. Salts and amounts stay here until the reveal; the engine
 * (and so spectators) only ever sees commitments before that.
 */
export function useBidding(
  state: GameState,
  getState: () => GameState,
  dispatch: (a: Action) => void,
  bidders: PlayerId[],
  bots: PlayerId[],
) {
  const b = state.bidding;
  const secrets = useRef(new Map<string, { amount: number; salt: string }>());
  const [locked, setLocked] = useState<Set<PlayerId>>(new Set());
  useEffect(() => setLocked(new Set()), [b?.id]);

  const commit = useCallback(
    (player: PlayerId, amount: number) => {
      const cur = getState().bidding;
      if (!cur || cur.stage !== 'commit' || cur.commits[player]) return;
      const salt = randomSalt();
      secrets.current.set(`${cur.id}:${player}`, { amount, salt });
      dispatch({ type: 'commitBid', player, hash: bidCommitment(cur.id, player, amount, salt) });
    },
    [getState, dispatch],
  );

  const lock = useCallback(
    (player: PlayerId, amount: number) => {
      setLocked((s) => new Set(s).add(player));
      commit(player, amount);
    },
    [commit],
  );

  // The AI bids at once, so the reveal comes as soon as the player locks in.
  const botKey = bots.join(',');
  useEffect(() => {
    if (!b || b.stage !== 'commit') return;
    for (const p of bots) if ((p === b.caster || p === b.target) && !b.commits[p]) commit(p, aiBid(getState(), p));
    // Re-run only when a new bidding opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, b?.stage, botKey, commit, getState]);

  // Close the window when time is up.
  const remaining = useCountdown(`bid:${b?.id ?? 'none'}`, BID_WINDOW_S, !!b && b.stage === 'commit');
  useEffect(() => {
    const cur = getState().bidding;
    if (cur && cur.stage === 'commit' && remaining <= 0) dispatch({ type: 'closeBidding', player: getState().active });
  }, [remaining, getState, dispatch]);

  // Reveal everything we hold; anyone still silent after the deadline counts as 0.
  useEffect(() => {
    if (!b || b.stage !== 'reveal') return;
    for (const p of [b.caster, b.target]) {
      const secret = secrets.current.get(`${b.id}:${p}`);
      const cur = getState().bidding;
      if (secret && cur && cur.reveals[p] === undefined)
        dispatch({ type: 'revealBid', player: p, amount: secret.amount, salt: secret.salt });
    }
    const t = setTimeout(() => {
      if (getState().bidding?.stage === 'reveal') dispatch({ type: 'revealTimeout', player: getState().active });
    }, REVEAL_DEADLINE_MS);
    return () => clearTimeout(t);
  }, [b, getState, dispatch]);

  // Show the revealed bids for a moment. The timer belongs to the reveal itself: new events (say, a
  // Firebolt cast right after) must not cancel it, or the result would stay up and hold the AI forever.
  const [reveal, setReveal] = useState<BidReveal | null>(null);
  const seen = useRef(state.events.length);
  useEffect(() => {
    const fresh = state.events.slice(seen.current);
    seen.current = state.events.length;
    const e = [...fresh].reverse().find((x) => x.cue?.kind === 'contest');
    if (!e || e.cue?.kind !== 'contest') return;
    const c = e.cue;
    setReveal({ abilityId: c.abilityId, success: c.success, target: c.target, caster: c.target === 'p1' ? 'p2' : 'p1', bids: c.bids });
  }, [state.events]);
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), REVEAL_S * 1000);
    return () => clearTimeout(t);
  }, [reveal]);

  return { remaining, locked, lock, reveal, bidders };
}
