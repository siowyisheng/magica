import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { chooseAction } from '../game/ai';
import { applyAction, createGame, replay } from '../game/engine';
import { loadReplays, newId, saveReplay } from '../game/storage';
import type { Action, GameState, MatchConfig, MatchRecord, PlayerId } from '../game/types';
import { BroadcastChannelTransport, SpectateHost, type LiveMatchInfo } from '../net/spectate';
import { BidPanel, type BidReveal } from './BidPanel';
import { HexBoard } from './HexBoard';
import { barScale, EventLog, MageCard } from './Panels';
import { useSfx } from './useSfx';

/** Lobby: live matches (from other windows) + saved replays. */
export function SpectateLobby({
  onWatchLive,
  onWatchReplay,
  onBack,
}: {
  onWatchLive: (matchId: string) => void;
  onWatchReplay: (rec: MatchRecord) => void;
  onBack: () => void;
}) {
  const [live, setLive] = useState<Record<string, LiveMatchInfo>>({});
  const replays = useMemo(() => loadReplays(), []);

  useEffect(() => {
    const t = new BroadcastChannelTransport();
    const unsub = t.subscribe((msg) => {
      if (msg.type === 'announce') setLive((l) => ({ ...l, [msg.info.matchId]: msg.info }));
      if (msg.type === 'ended')
        setLive((l) => {
          const { [msg.matchId]: _gone, ...rest } = l;
          void _gone;
          return rest;
        });
    });
    t.send({ type: 'discover' });
    const poll = setInterval(() => t.send({ type: 'discover' }), 3000);
    return () => {
      clearInterval(poll);
      unsub();
      t.close();
    };
  }, []);

  return (
    <div className="page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>
      <h2>Live duels</h2>
      {Object.values(live).length === 0 ? (
        <p className="muted">No live matches found. Start a match in another window — it will appear here automatically.</p>
      ) : (
        <div className="list">
          {Object.values(live).map((m) => (
            <button key={m.matchId} className="list-item" onClick={() => onWatchLive(m.matchId)}>
              <span className="live-dot">●</span> {m.title} <span className="muted">· {m.turn} actions</span>
            </button>
          ))}
        </div>
      )}
      <h2>Replays</h2>
      {replays.length === 0 ? (
        <p className="muted">Finished matches are saved here.</p>
      ) : (
        <div className="list">
          {replays.map((r) => (
            <button key={r.id} className="list-item" onClick={() => onWatchReplay(r)}>
              {r.config.names.p1} vs {r.config.names.p2}{' '}
              <span className="muted">
                · {new Date(r.createdAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Watches a match being played in another window, in real time. */
export function LiveViewer({ matchId, onBack }: { matchId: string; onBack: () => void }) {
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const t = new BroadcastChannelTransport();
    const unsub = t.subscribe((msg) => {
      if (msg.type === 'sync' && msg.record.id === matchId) setRecord(structuredClone(msg.record));
      if (msg.type === 'ended' && msg.matchId === matchId) setEnded(true);
      if (msg.type === 'action' && msg.matchId === matchId) {
        setRecord((rec) => {
          if (!rec) return rec;
          if (msg.index === rec.actions.length) return { ...rec, actions: [...rec.actions, msg.action] };
          if (msg.index > rec.actions.length) t.send({ type: 'request-sync', matchId }); // missed some, resync
          return rec;
        });
      }
    });
    t.send({ type: 'request-sync', matchId });
    return () => {
      unsub();
      t.close();
    };
  }, [matchId]);

  if (!record) return <div className="page">Connecting to match…</div>;
  return <Viewer record={record} upTo={record.actions.length} badge={ended ? 'Ended' : '● LIVE'} onBack={onBack} />;
}

/** Scrub through a finished match. */
export function ReplayViewer({ record, onBack }: { record: MatchRecord; onBack: () => void }) {
  const total = record.actions.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!playing) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), 500 / speed);
    return () => clearTimeout(t);
  }, [playing, index, total, speed]);

  return (
    <Viewer record={record} upTo={index} badge="Replay" onBack={onBack}>
      <div className="replay-controls">
        <button onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={total} value={index} onChange={(e) => setIndex(Number(e.target.value))} />
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </Viewer>
  );
}

const NO_LOCKS = new Set<PlayerId>();

/** Spectators see a bid's result until the next few things happen after it. */
function recentReveal(state: GameState): BidReveal | null {
  if (state.bidding) return null;
  const tail = state.events.slice(-4);
  const e = [...tail].reverse().find((x) => x.cue?.kind === 'contest');
  if (!e || e.cue?.kind !== 'contest') return null;
  const c = e.cue;
  return { abilityId: c.abilityId, success: c.success, target: c.target, caster: c.target === 'p1' ? 'p2' : 'p1', bids: c.bids };
}

function Viewer({
  record,
  upTo,
  badge,
  onBack,
  liveState,
  children,
}: {
  record: MatchRecord;
  upTo: number;
  badge: string;
  onBack: () => void;
  /** The current state, when the caller already has it (saves replaying every action). */
  liveState?: GameState;
  children?: ReactNode;
}) {
  const actions: Action[] = record.actions;
  const replayed = useMemo(
    () => (liveState ? null : replay(record.config, actions, upTo)),
    [liveState, record.config, actions, upTo],
  );
  const state = liveState ?? replayed!;
  useSfx(state, null); // a spectator has no side
  return (
    <div className="match spectating">
      <header className="match-top">
        <button className="ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="round">
          {record.config.names.p1} vs {record.config.names.p2} · Round {Math.ceil(state.turn / 2)}
        </div>
        <div className="live-pill">{badge}</div>
      </header>
      <aside className="side left">
        <MageCard mage={state.mages.p1} active={state.active === 'p1'} scale={barScale(state)} />
      </aside>
      <main className="board-wrap">
        <BidPanel state={state} bidders={[]} locked={NO_LOCKS} onLock={() => {}} remaining={0} total={1} reveal={recentReveal(state)} />
        <HexBoard state={state} />
      </main>
      <aside className="side right">
        <MageCard mage={state.mages.p2} active={state.active === 'p2'} scale={barScale(state)} />
        <EventLog events={state.events} />
      </aside>
      <footer className="controls">{children ?? <span className="muted">Spectating — controls disabled</span>}</footer>
    </div>
  );
}

const AI_STEP_MS = 500;
/** Safety net for "skip to end": a real match is a few hundred actions. */
const MAX_SKIP_ACTIONS = 5000;

/**
 * An AI vs AI duel played out live. Both sides are the bot; you only watch, so there are no
 * controls beyond pause, speed and skipping to the result. It is broadcast like any other match.
 */
export function AiDuelViewer({
  config,
  onExit,
  onRematch,
  onWatchReplay,
}: {
  config: MatchConfig;
  onExit: () => void;
  onRematch: () => void;
  onWatchReplay: (rec: MatchRecord) => void;
}) {
  const [state, setState] = useState<GameState>(() => createGame(config));
  const stateRef = useRef(state);
  const record = useRef<MatchRecord>({ id: newId(), createdAt: Date.now(), config, actions: [] });
  const hostRef = useRef<SpectateHost | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const transport = new BroadcastChannelTransport();
    hostRef.current = new SpectateHost(transport, () => record.current, `${config.names.p1} vs ${config.names.p2}`);
    return () => {
      hostRef.current?.end();
      transport.close();
      if (record.current.actions.length) saveReplay(record.current);
    };
  }, [config]);

  /** Plays the bot's next action for whoever is up (bids included: the bot drives both sides). */
  const step = useCallback(() => {
    const prev = stateRef.current;
    if (prev.winner) return;
    const action = chooseAction(prev, prev.active);
    const next = applyAction(prev, action);
    if (next === prev) return;
    stateRef.current = next;
    record.current.actions.push(action);
    hostRef.current?.publish(record.current.actions.length - 1, action);
    if (action.type === 'endTurn') hostRef.current?.announce();
    if (next.winner) saveReplay(record.current);
    setState(next);
  }, []);

  useEffect(() => {
    if (!playing || state.winner) return;
    const t = setTimeout(step, AI_STEP_MS / speed);
    return () => clearTimeout(t);
  }, [playing, speed, state, step]);

  const skipToEnd = () => {
    for (let i = 0; i < MAX_SKIP_ACTIONS && !stateRef.current.winner; i++) {
      const before = stateRef.current;
      step();
      if (stateRef.current === before) break;
    }
  };

  const winnerText = state.winner === 'draw' ? 'Draw' : state.winner ? `${state.mages[state.winner].name} wins` : '';
  return (
    <>
      <Viewer record={record.current} upTo={record.current.actions.length} liveState={state} badge="● AI duel" onBack={onExit}>
        <div className="replay-controls">
          <button onClick={() => setPlaying((p) => !p)} disabled={!!state.winner} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <span className="muted">{record.current.actions.length} actions</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <button onClick={skipToEnd} disabled={!!state.winner}>
            Skip to result ⏭
          </button>
        </div>
      </Viewer>
      {state.winner && (
        <div className="overlay">
          <div className="overlay-card">
            <h1>{winnerText}</h1>
            <p className="muted">
              {Math.ceil(state.turn / 2)} rounds · {record.current.actions.length} actions
            </p>
            <div className="row">
              <button onClick={onRematch}>Another duel</button>
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
    </>
  );
}
