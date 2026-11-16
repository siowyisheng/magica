import { useState } from 'react';
import { CIRCLE_NAME, validateLoadout } from '../game/loadout';
import { randomSeed } from '../game/rng';
import type { Loadout, MatchConfig } from '../game/types';

interface Props {
  loadouts: Loadout[];
  onStart: (config: MatchConfig) => void;
  onBack: () => void;
}

export function SetupScreen({ loadouts, onStart, onBack }: Props) {
  const valid = loadouts.filter((l) => validateLoadout(l).length === 0);
  const [p1, setP1] = useState(valid[0]?.id ?? '');
  const [p2, setP2] = useState(valid[1]?.id ?? valid[0]?.id ?? '');
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [radius, setRadius] = useState(7);

  const l1 = valid.find((l) => l.id === p1);
  const l2 = valid.find((l) => l.id === p2);

  const start = () => {
    if (!l1 || !l2) return;
    onStart({
      seed: randomSeed(),
      radius,
      turnSeconds,
      maxTurns: 60, // 30 rounds
      loadouts: { p1: l1, p2: l2 },
      names: { p1: `${l1.name} (You)`, p2: `${l2.name} (AI)` },
    });
  };

  const LoadoutSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {valid.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} · {CIRCLE_NAME[l.circle]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="page setup">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>
      <h2>New duel</h2>
      {valid.length === 0 && <p className="errors">You need at least one valid loadout.</p>}

      <label>
        Your loadout
        <LoadoutSelect value={p1} onChange={setP1} />
      </label>
      <label>
        AI loadout
        <LoadoutSelect value={p2} onChange={setP2} />
      </label>
      <div className="field" role="group" aria-labelledby="setup-timer">
        <span id="setup-timer">Turn timer</span>
        <div className="segmented">
          {[10, 20, 30, 60].map((s) => (
            <button key={s} className={turnSeconds === s ? 'is-selected' : ''} onClick={() => setTurnSeconds(s)}>
              {s}s
            </button>
          ))}
        </div>
      </div>
      <div className="field" role="group" aria-labelledby="setup-arena">
        <span id="setup-arena">Arena size</span>
        <div className="segmented">
          {[
            [6, 'Small'],
            [7, 'Medium'],
            [8, 'Large'],
          ].map(([r, name]) => (
            <button key={r} className={radius === r ? 'is-selected' : ''} onClick={() => setRadius(r as number)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <button className="primary big" disabled={!l1 || !l2} onClick={start}>
        Enter the arena
      </button>
    </div>
  );
}
