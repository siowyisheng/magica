import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseAction } from '../game/ai';
import { absorbError, applyAction, createGame, impactArea, reachable, round, validTargets } from '../game/engine';
import { equals, key, type Hex } from '../game/hex';
import { newId, saveReplay } from '../game/storage';
import type { Action, GameState, MatchConfig, MatchRecord, PlayerId } from '../game/types';
import { BroadcastChannelTransport, SpectateHost } from '../net/spectate';
import { HexBoard, type BoardHighlights } from './HexBoard';
import { AbilityBar, EventLog, MageCard, PhaseBanner, TurnTimer } from './Panels';
import { useCountdown } from './useCountdown';

export type MatchMode = 'ai' | 'hotseat';

interface Props {
  config: MatchConfig;
  mode: MatchMode;
  onExit: () => void;
  onRematch: () => void;
  onWatchReplay: (rec: MatchRecord) => void;
}

const AI_DELAY_MS = 420;

export function MatchScreen({ config, mode, onExit, onRematch, onWatchReplay }: Props) {
  const [state, setState] = useState<GameState>(() => createGame(config));
  const stateRef = useRef(state);
  const record = useRef<MatchRecord>({ id: newId(), createdAt: Date.now(), config, actions: [] });
  const hostRef = useRef<SpectateHost | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Hex | null>(null);

  const isLocal = useCallback((p: PlayerId) => mode === 'hotseat' || p === 'p1', [mode]);
  const controlling = !state.winner && isLocal(state.active) ? state.active : null;

  // --- Spectate host -------------------------------------------------------
  useEffect(() => {
    const transport = new BroadcastChannelTransport();
    const title = `${config.names.p1} vs ${config.names.p2}`;
    hostRef.current = new SpectateHost(transport, () => record.current, title);
    return () => {
      hostRef.current?.end();
      transport.close();
      if (record.current.actions.length) saveReplay(record.current);
    };
  }, [config]);

  // --- Dispatch ------------------------------------------------------------
  const dispatch = useCallback((action: Action) => {
    const prev = stateRef.current;
    const next = applyAction(prev, action);
    if (next === prev) return;
    stateRef.current = next;
    record.current.actions.push(action);
    hostRef.current?.publish(record.current.actions.length - 1, action);
    if (action.type !== 'move') setSelected(null);
    if (action.type === 'endTurn') hostRef.current?.announce();
    if (next.winner) saveReplay(record.current);
    setState(next);
  }, []);

  // --- AI ------------------------------------------------------------------
  useEffect(() => {
    if (state.winner || isLocal(state.active)) return;
    const t = setTimeout(() => dispatch(chooseAction(stateRef.current, stateRef.current.active)), AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, isLocal, dispatch]);

  // --- Turn timer ----------------------------------------------------------
  // The Reaction Phase gets its own, shorter clock: half the turn timer, at least 8s.
  const reacting = state.phase === 'reaction';
  const phaseSeconds = reacting ? Math.max(8, config.turnSeconds / 2) : config.turnSeconds;
  const remaining = useCountdown(`${state.turn}:${state.phase}`, phaseSeconds, !state.winner);
  useEffect(() => {
    const s = stateRef.current;
    if (remaining > 0 || s.winner) return;
    dispatch(
      s.phase === 'reaction'
        ? { type: 'endReaction', player: s.active, reason: 'timeout' }
        : { type: 'endTurn', player: s.active, reason: 'timeout' },
    );
  }, [remaining, dispatch]);

  // --- Highlights ----------------------------------------------------------
  const highlights = useMemo<BoardHighlights>(() => {
    if (!controlling) return {};
    if (selected) {
      const targets = new Set(validTargets(state, controlling, selected).map(key));
      const impact = hover && targets.has(key(hover)) ? new Set(impactArea(state, controlling, selected, hover).map(key)) : undefined;
      return { targets, impact };
    }
    const all = reachable(state, controlling);
    const mp = state.mages[controlling].mp;
    return {
      reachable: new Set(all.keys()),
      free: new Set([...all].filter(([, cost]) => cost <= mp).map(([k]) => k)),
    };
  }, [state, controlling, selected, hover]);

  const onHexClick = (h: Hex) => {
    if (!controlling) return;
    if (selected) {
      if (highlights.targets?.has(key(h))) dispatch({ type: 'cast', player: controlling, abilityId: selected, target: h });
      else setSelected(null);
      return;
    }
    if (highlights.reachable?.has(key(h))) dispatch({ type: 'move', player: controlling, to: h });
    else if (equals(h, state.mages[controlling].pos)) setSelected(null);
  };

  const canAbsorb = !!controlling && !absorbError(state, controlling);
  const absorb = useCallback(() => {
    if (controlling) dispatch({ type: 'absorb', player: controlling });
  }, [controlling, dispatch]);

  /** Ends the Reaction Phase (attacks land) or the whole turn, whichever we're in. */
  const endTurn = useCallback(() => {
    if (!controlling) return;
    dispatch({ type: stateRef.current.phase === 'reaction' ? 'endReaction' : 'endTurn', player: controlling });
  }, [controlling, dispatch]);

  // --- Hotkeys -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!controlling) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const slot = stateRef.current.mages[controlling].abilities[n - 1];
        if (slot) setSelected((s) => (s === slot.id ? null : slot.id));
      } else if (e.key === 'Escape') setSelected(null);
      else if (e.key.toLowerCase() === 'a') absorb();
      else if (e.key === ' ' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        endTurn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlling, endTurn, absorb]);

  const barPlayer: PlayerId = mode === 'hotseat' ? state.active : 'p1';
  const winnerText =
    state.winner === 'draw' ? 'Draw' : state.winner ? `${state.mages[state.winner].name} wins` : '';

  return (
    <div className="match">
      <header className="match-top">
        <button className="ghost" onClick={onExit}>
          ← Leave
        </button>
        <div className="round">
          Round {round(state)} <span className="muted">/ {Math.ceil(config.maxTurns / 2)}</span>
        </div>
        <PhaseBanner state={state} />
        <div className="live-pill" title="Open a second window and choose Spectate to watch this match">
          ● Broadcasting
        </div>
      </header>

      <aside className="side left">
        <MageCard unit={state.mages.p1} active={state.active === 'p1'} />
      </aside>

      <main className="board-wrap">
        <HexBoard state={state} highlights={highlights} onHexClick={onHexClick} onHexHover={setHover} />
      </main>

      <aside className="side right">
        <MageCard unit={state.mages.p2} active={state.active === 'p2'} />
        <EventLog events={state.events} />
      </aside>

      <footer className="controls">
        <TurnTimer remaining={remaining} total={phaseSeconds} />
        <AbilityBar state={state} player={barPlayer} selected={selected} onSelect={setSelected} disabled={!controlling} />
        <button className="absorb" onClick={absorb} disabled={!canAbsorb} title="Absorb Mana from the Ready crystal you stand on (1 AP)">
          💎 Absorb<span className="hotkey">A</span>
        </button>
        <button className={`end-turn ${reacting ? 'resolve' : ''}`} onClick={endTurn} disabled={!controlling}>
          {!controlling ? `${state.mages[state.active].name}…` : reacting ? 'Brace & resolve' : 'End turn'}
          <span className="hotkey">Space</span>
        </button>
      </footer>

      {state.winner && (
        <div className="overlay">
          <div className="overlay-card">
            <h1>{winnerText}</h1>
            <p className="muted">
              {Math.ceil(state.turn / 2)} rounds · {record.current.actions.length} actions
            </p>
            <div className="row">
              <button onClick={onRematch}>Rematch</button>
              <button className="ghost" onClick={() => onWatchReplay(record.current)}>
                Watch replay
              </button>
              <button className="ghost" onClick={onExit}>
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
