import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseAction } from '../game/ai';
import { ABILITIES } from '../game/content';
import {
  absorbError,
  applyAction,
  castError,
  createGame,
  impactArea,
  incoming,
  isTargetedReaction,
  reachable,
  round,
  validTargets,
} from '../game/engine';
import { equals, key, neighbors, type Hex } from '../game/hex';
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
  /** Hexes drawn so far when the selected Ability is a Wall. */
  const [wallPath, setWallPath] = useState<Hex[]>([]);
  useEffect(() => setWallPath([]), [selected, state.turn, state.phase]);
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
  const selectedDef = selected ? ABILITIES[selected] : null;
  /** Incoming Attacks the selected targeted Reaction Spell may be aimed at. */
  const reactTargets = useMemo(
    () =>
      controlling && selectedDef && isTargetedReaction(selectedDef)
        ? incoming(state, controlling).filter((a) => !castError(state, controlling, selectedDef.id, state.mages[controlling].pos, a.id))
        : [],
    [state, controlling, selectedDef],
  );

  const wallShape =
    selectedDef?.effect.type === 'attack' && selectedDef.effect.shape.kind === 'wall' ? selectedDef.effect.shape : null;

  const highlights = useMemo<BoardHighlights>(() => {
    if (!controlling) return {};
    if (selected && wallShape) {
      const last = wallPath[wallPath.length - 1];
      const taken = new Set(wallPath.map(key));
      const next = last
        ? neighbors(last).filter((n) => state.tiles[key(n)]?.terrain === 'plain' && !taken.has(key(n)))
        : validTargets(state, controlling, selected);
      const preview = hover && next.some((n) => equals(n, hover)) ? [...wallPath, hover] : wallPath;
      return { targets: new Set(next.map(key)), impact: new Set(preview.map(key)) };
    }
    if (selected && reactTargets.length) {
      const hovered = hover && reactTargets.find((a) => a.area.includes(key(hover)));
      return { targets: new Set(reactTargets.flatMap((a) => a.area)), impact: hovered ? new Set(hovered.area) : undefined };
    }
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
  }, [state, controlling, selected, hover, reactTargets, wallShape, wallPath]);

  const onHexClick = (h: Hex) => {
    if (!controlling) return;
    if (selected && reactTargets.length) {
      const atk = reactTargets.find((a) => a.area.includes(key(h)));
      if (atk) castAt(selected, state.mages[controlling].pos, atk.id);
      else setSelected(null);
      return;
    }
    if (selected && wallShape) {
      const last = wallPath[wallPath.length - 1];
      if (last && equals(last, h)) setWallPath(wallPath.slice(0, -1)); // click the end again to undo
      else if (highlights.targets?.has(key(h))) {
        const path = [...wallPath, h];
        if (path.length === wallShape.length) {
          dispatch({ type: 'cast', player: controlling, abilityId: selected, target: path[0], path });
          setWallPath([]);
        } else setWallPath(path);
      } else if (!wallPath.length) setSelected(null);
      return;
    }
    if (selected) {
      if (highlights.targets?.has(key(h))) castAt(selected, h);
      else setSelected(null);
      return;
    }
    if (highlights.reachable?.has(key(h))) dispatch({ type: 'move', player: controlling, to: h });
    else if (equals(h, state.mages[controlling].pos)) setSelected(null);
  };

  const castAt = useCallback(
    (abilityId: string, target: Hex, attackId?: number) => {
      if (controlling) dispatch({ type: 'cast', player: controlling, abilityId, target, attackId });
    },
    [controlling, dispatch],
  );

  /** Self-targeted Spells (Ward, Mend, …) go off as soon as they're picked. */
  const select = useCallback(
    (id: string | null) => {
      const def = id ? ABILITIES[id] : null;
      if (controlling && def && def.targeting === 'self' && def.effect.type !== 'attack' && !isTargetedReaction(def)) {
        castAt(def.id, stateRef.current.mages[controlling].pos);
        return;
      }
      setSelected(id);
    },
    [controlling, castAt],
  );

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
        if (slot) select(selected === slot.id ? null : slot.id);
      } else if (e.key === 'Escape') setSelected(null);
      else if (e.key.toLowerCase() === 'a') absorb();
      else if (e.key === ' ' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        endTurn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlling, endTurn, absorb, select, selected]);

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
        <AbilityBar state={state} player={barPlayer} selected={selected} onSelect={select} disabled={!controlling} />
        {wallShape && (
          <div className="react-targets">
            <span className="muted">
              Draw the wall: {wallPath.length}/{wallShape.length} hexes · click the end to undo · Esc cancels
            </span>
          </div>
        )}
        {reactTargets.length > 0 && (
          <div className="react-targets">
            <span className="muted">{selectedDef!.name} which attack?</span>
            {reactTargets.map((a) => (
              <button key={a.id} onClick={() => castAt(selectedDef!.id, state.mages[controlling!].pos, a.id)}>
                {ABILITIES[a.abilityId].icon} {ABILITIES[a.abilityId].name}
              </button>
            ))}
          </div>
        )}
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
