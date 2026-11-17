import { useEffect, useState } from 'react';
import { ABILITIES } from '../game/content';
import { bidCap } from '../game/engine';
import type { GameState, PlayerId, Status } from '../game/types';

/** How a contested status reads, in the panel. */
const EFFECT_TEXT: Record<Status['kind'], string> = {
  root: "can't Move for the next few turns",
  slow: 'gets fewer Movement Points next turn',
  burn: 'burns',
  poison: 'is poisoned',
  disarmed: 'is disarmed',
  vulnerable: 'takes extra damage from every hit',
  fatigue: 'has 1 fewer AP each turn',
  armored: 'takes less damage',
  charm: 'skips their Reaction Phase and is drawn toward the caster',
  fear: 'skips their Reaction Phase and flees from the caster',
  asleep: 'falls asleep until hurt',
};

/** The result of a bid, from the event log, shown for a moment after the reveal. */
export interface BidReveal {
  abilityId: string;
  success: boolean;
  caster: PlayerId;
  target: PlayerId;
  bids: Record<PlayerId, number>;
}

interface Props {
  state: GameState;
  /** Duellists who bid on this screen: the local player, or none for spectators. */
  bidders: PlayerId[];
  /** Duellists who have locked in on this screen (others' lock-ins are never shown). */
  locked: Set<PlayerId>;
  onLock: (player: PlayerId, amount: number) => void;
  /** Seconds left in the bidding window. */
  remaining: number;
  total: number;
  /** Set after the bids are revealed. */
  reveal: BidReveal | null;
}

/** Put the panel on the half of the board away from the two mages, so the tether and result stay visible. */
export function panelPlacement(state: GameState): 'top' | 'bottom' {
  const rows = state.mages.p1.pos.r + state.mages.p2.pos.r; // r grows downwards on screen
  return rows < 0 ? 'bottom' : 'top';
}

export function BidPanel({ state, bidders, locked, onLock, remaining, total, reveal }: Props) {
  const b = state.bidding;
  const info = reveal ?? (b ? { abilityId: b.abilityId, caster: b.caster, target: b.target } : null);
  if (!info) return null;
  const def = ABILITIES[info.abilityId];
  const fx = def.effect.type === 'contest' ? def.effect : null;
  const caster = state.mages[info.caster];
  const target = state.mages[info.target];
  const role = (p: PlayerId) => (p === info.caster ? 'to land it' : 'to resist');

  return (
    <div
      className={`bid-panel at-${panelPlacement(state)} ${reveal ? (reveal.success ? 'landed' : 'resisted') : ''}`}
      role="dialog"
      aria-label={`${def.name} bidding`}
    >
      <div className="bid-head">
        <span className="bid-icon">{def.icon}</span>
        <div>
          <div className="bid-title">{def.name}</div>
          <div className="muted">
            {caster.name} → {target.name}
          </div>
        </div>
      </div>
      <p className="bid-rule">
        If <strong>{caster.name}</strong> bids at least as much Mana as <strong>{target.name}</strong>, {target.name}{' '}
        {fx ? EFFECT_TEXT[fx.status.kind] : 'is affected'}. Ties go to the caster. <em>Both bids are spent.</em>
      </p>

      <div className="bid-sides">
        {[info.caster, info.target].map((p) => (
          <div key={p} className={`bid-side side-${p}`}>
            <div className="bid-who">
              {state.mages[p].name} <span className="muted">({p === info.caster ? 'caster' : 'target'})</span>
            </div>
            {reveal ? (
              <div className="bid-amount revealed">
                {reveal.bids[p]} <span className="muted">Mana</span>
              </div>
            ) : (
              <>
                <div className="bid-mana">💧 {state.mages[p].mana} Mana</div>
                {bidders.includes(p) ? (
                  locked.has(p) ? (
                    <div className="bid-locked">Locked in ✓</div>
                  ) : (
                    <BidInput max={Math.min(state.mages[p].mana, bidCap(def))} label={`Bid ${role(p)}`} onLock={(n) => onLock(p, n)} />
                  )
                ) : (
                  <div className="bid-waiting">Deciding…</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {reveal ? (
        <div className="bid-outcome">{reveal.success ? `${def.icon} ${def.name} takes hold!` : '✨ Resisted!'}</div>
      ) : bidders.length === 0 ? (
        <div className="bid-secret">Bids stay secret until both are revealed.</div>
      ) : (
        <div className="bid-clock" aria-label={`${Math.ceil(remaining)} seconds to bid`}>
          <div style={{ width: `${Math.max(0, Math.min(1, remaining / total)) * 100}%` }} />
          <span>{Math.ceil(remaining)}s</span>
        </div>
      )}
    </div>
  );
}

/** A secret bid entry: pick an amount, then lock it in. */
function BidInput({ max, label, onLock }: { max: number; label: string; onLock: (n: number) => void }) {
  const [amount, setAmount] = useState(0);
  useEffect(() => setAmount((a) => Math.min(a, max)), [max]);
  return (
    <div className="bid-input">
      <label className="muted">
        {label}: <strong className="bid-value">{amount}</strong>
      </label>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        aria-label={label}
      />
      <div className="bid-steps">
        <button onClick={() => setAmount(Math.max(0, amount - 1))} aria-label="Bid one less">
          −
        </button>
        <button onClick={() => setAmount(Math.min(max, amount + 1))} aria-label="Bid one more">
          +
        </button>
        <button className="primary" onClick={() => onLock(amount)}>
          Lock in
        </button>
      </div>
    </div>
  );
}
