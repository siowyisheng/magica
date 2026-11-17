import { useState } from 'react';
import { CIRCLE_NAME, validateLoadout } from '../game/loadout';
import { randomSeed } from '../game/rng';
import { loadSetupPrefs, saveSetupPrefs } from '../game/storage';
import type { Loadout, MatchConfig } from '../game/types';

interface Props {
  loadouts: Loadout[];
  /** `watch` runs the match as AI vs AI with you spectating. */
  onStart: (config: MatchConfig, watch: boolean) => void;
  onBack: () => void;
}

export function SetupScreen({ loadouts, onStart, onBack }: Props) {
  const valid = loadouts.filter((l) => validateLoadout(l).length === 0);
  const [p1, setP1] = useState(valid[0]?.id ?? '');
  const [p2, setP2] = useState(valid[1]?.id ?? valid[0]?.id ?? '');
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [radius, setRadius] = useState(7);
  const [watch, setWatch] = useState(false);
  const [freeMovement, setFreeMovement] = useState(() => loadSetupPrefs().freeMovement);
  const chooseRules = (on: boolean) => {
    setFreeMovement(on);
    saveSetupPrefs({ freeMovement: on });
  };

  const l1 = valid.find((l) => l.id === p1);
  const l2 = valid.find((l) => l.id === p2);

  const start = () => {
    if (!l1 || !l2) return;
    onStart(
      {
        seed: randomSeed(),
        radius,
        turnSeconds,
        maxTurns: 24, // 12 rounds
        loadouts: { p1: l1, p2: l2 },
        names: { p1: `${l1.name} ${watch ? '(AI)' : '(You)'}`, p2: `${l2.name} (AI)` },
        freeMovement,
      },
      watch,
    );
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
      <h2>{watch ? 'Watch a duel' : 'New duel'}</h2>
      {valid.length === 0 && <p className="errors">You need at least one valid loadout.</p>}

      <div className="field" role="group" aria-labelledby="setup-mode">
        <span id="setup-mode">Mode</span>
        <div className="segmented">
          <button className={!watch ? 'is-selected' : ''} onClick={() => setWatch(false)}>
            You vs AI
          </button>
          <button className={watch ? 'is-selected' : ''} onClick={() => setWatch(true)}>
            Watch AI vs AI
          </button>
        </div>
      </div>
      <label>
        {watch ? 'First AI loadout' : 'Your loadout'}
        <LoadoutSelect value={p1} onChange={setP1} />
      </label>
      <label>
        {watch ? 'Second AI loadout' : 'AI loadout'}
        <LoadoutSelect value={p2} onChange={setP2} />
      </label>
      {!watch && (
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
      )}
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
      <div className="field" role="group" aria-labelledby="setup-rules">
        <span id="setup-rules">Rules</span>
        <div className="segmented">
          <button className={!freeMovement ? 'is-selected' : ''} onClick={() => chooseRules(false)}>
            Standard
          </button>
          <button className={freeMovement ? 'is-selected' : ''} onClick={() => chooseRules(true)}>
            Free Movement
          </button>
        </div>
        {freeMovement && <small className="muted">Each turn, walk as far as your Movespeed without spending AP.</small>}
      </div>
      <button className="primary big" disabled={!l1 || !l2} onClick={start}>
        {watch ? 'Start the duel' : 'Enter the arena'}
      </button>
    </div>
  );
}
