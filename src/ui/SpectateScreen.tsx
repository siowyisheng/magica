import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { replay } from '../game/engine';
import { loadReplays } from '../game/storage';
import type { Action, MatchRecord } from '../game/types';
import { BroadcastChannelTransport, type LiveMatchInfo } from '../net/spectate';
import { HexBoard } from './HexBoard';
import { EventLog, MageCard } from './Panels';

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
                · {new Date(r.createdAt).toLocaleString()} · {r.actions.length} actions
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
        <span className="muted">
          {index}/{total}
        </span>
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

function Viewer({
  record,
  upTo,
  badge,
  onBack,
  children,
}: {
  record: MatchRecord;
  upTo: number;
  badge: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  const actions: Action[] = record.actions;
  const state = useMemo(() => replay(record.config, actions, upTo), [record.config, actions, upTo]);
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
        <MageCard unit={state.mages.p1} active={state.active === 'p1'} />
      </aside>
      <main className="board-wrap">
        <HexBoard state={state} />
      </main>
      <aside className="side right">
        <MageCard unit={state.mages.p2} active={state.active === 'p2'} />
        <EventLog events={state.events} />
      </aside>
      <footer className="controls">{children ?? <span className="muted">Spectating — controls disabled</span>}</footer>
    </div>
  );
}
