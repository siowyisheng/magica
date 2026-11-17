import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { maxMana, roundsLeft } from '../game/engine';
import type { GameState, Mage } from '../game/types';

/** HP share below which a mage counts as injured (yellow) and critical (orange). */
export const INJURED_BELOW = 0.67;
export const CRITICAL_BELOW = 0.33;

export type HpTone = 'healthy' | 'injured' | 'critical';
export const hpTone = (hp: number, max: number): HpTone => {
  const f = max > 0 ? hp / max : 0;
  return f < CRITICAL_BELOW ? 'critical' : f < INJURED_BELOW ? 'injured' : 'healthy';
};

/** Rounds left turn yellow at 3 and 2, and red on the last one. */
export type RoundsTone = 'calm' | 'warning' | 'danger';
export const roundsTone = (left: number): RoundsTone => (left <= 1 ? 'danger' : left <= 3 ? 'warning' : 'calm');

const POP_MS = 1300;
/** How long the pale "just lost" strip waits before draining. */
const TRAIL_HOLD_MS = 450;

/**
 * Tracks HP loss for the damage effects: a trail that holds then drains, a counter that bumps on every
 * hit (to restart the impact animation) and the floating damage numbers.
 */
function useDamageEffects(hp: number) {
  const prev = useRef(hp);
  const popId = useRef(0);
  const [trail, setTrail] = useState(hp);
  const [hits, setHits] = useState(0);
  const [pops, setPops] = useState<Array<{ id: number; amount: number }>>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = hp;
    if (hp < before) {
      const id = ++popId.current;
      setHits((n) => n + 1);
      setTrail((t) => Math.max(t, before)); // the strip shows what was just lost
      setPops((p) => [...p, { id, amount: before - hp }]);
      timers.current.push(window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), POP_MS));
      timers.current.push(window.setTimeout(() => setTrail(hp), TRAIL_HOLD_MS));
    } else if (hp > before) setTrail(hp); // healed, or the replay jumped back
  }, [hp]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { trail, hits, pops };
}

function HpBar({ mage }: { mage: Mage }) {
  const { trail, hits, pops } = useDamageEffects(mage.hp);
  const pct = (v: number) => `${(100 * Math.max(0, v)) / Math.max(1, mage.maxHp)}%`;
  const tone = hpTone(mage.hp, mage.maxHp);
  const parity = hits % 2; // alternating animation names restart the effect on back-to-back hits
  return (
    <div
      className={`hp-track hp-${tone} ${hits ? `shake-${parity}` : ''}`}
      role="meter"
      aria-label={`${mage.name} HP`}
      aria-valuenow={mage.hp}
      aria-valuemax={mage.maxHp}
    >
      <div className="hp-trail" style={{ width: pct(trail) }} />
      <div className="hp-fill" style={{ width: pct(mage.hp) }} />
      {hits > 0 && <div key={hits} className={`hp-flash flash-${parity}`} />}
      <span className="hp-text">
        {mage.hp}
        <small> / {mage.maxHp}</small>
        {mage.shield > 0 && <em> +{mage.shield}🛡</em>}
      </span>
      {pops.map((p) => (
        <span key={p.id} className="hp-pop" style={{ '--edge': pct(mage.hp) } as CSSProperties}>
          −{p.amount}
        </span>
      ))}
    </div>
  );
}

function ManaBar({ mage, scaleMax }: { mage: Mage; scaleMax: number }) {
  const max = maxMana(mage);
  return (
    <div className="mana-slot">
      <div
        className="mana-track"
        style={{ width: `${(100 * max) / Math.max(1, scaleMax)}%` }}
        role="meter"
        aria-label={`${mage.name} Mana`}
        aria-valuenow={mage.mana}
        aria-valuemax={max}
      >
        <div className="mana-fill" style={{ width: `${(100 * Math.max(0, mage.mana)) / Math.max(1, max)}%` }} />
        <span className="mana-text">
          {mage.mana}
          <small> / {max}</small>
        </span>
      </div>
    </div>
  );
}

function HudSide({ mage, active, manaScale }: { mage: Mage; active: boolean; manaScale: number }) {
  return (
    <div className={`hud-side hud-${mage.owner} ${active ? 'is-turn' : 'is-waiting'}`}>
      <div className={`hud-portrait ${active ? 'is-active' : ''} ${mage.hp <= 0 ? 'is-dead' : ''}`} title={mage.name}>
        {mage.icon}
      </div>
      <div className="hud-bars">
        <div className="hud-name">
          <span>{mage.name}</span>
          {active && <span className="turn-badge">{mage.owner === 'p1' ? '◀' : ''} YOUR TURN {mage.owner === 'p2' ? '▶' : ''}</span>}
        </div>
        <HpBar mage={mage} />
        <ManaBar mage={mage} scaleMax={manaScale} />
      </div>
    </div>
  );
}

/** The number in the top centre: a big count of rounds left. */
export function RoundsLeft({ state }: { state: GameState }) {
  const left = roundsLeft(state);
  return (
    <div className={`rounds-left rl-${roundsTone(left)}`} aria-label={left === 1 ? 'Final round' : `${left} rounds left`}>
      <span className="rl-num">{left}</span>
      <span className="rl-label">{left === 1 ? 'FINAL ROUND' : 'ROUNDS LEFT'}</span>
      {state.config.freeMovement && (
        <span className="rl-rules" title="Rules variant: each Action Phase starts with Movement Points equal to Movespeed, without spending AP.">
          Free Movement
        </span>
      )}
    </div>
  );
}

/**
 * The fighting-game header: HP bars run from each side towards the centre, Mana bars beneath them
 * (the bigger Max Mana spans its whole half, the other is drawn relative to it), the rounds left in
 * the middle and the mage portraits in the top corners.
 */
export function Hud({ state }: { state: GameState }) {
  const { p1, p2 } = state.mages;
  const manaScale = Math.max(maxMana(p1), maxMana(p2));
  const turn = (p: Mage) => state.active === p.owner && !state.winner;
  return (
    <div className="hud">
      <HudSide mage={p1} active={turn(p1)} manaScale={manaScale} />
      <RoundsLeft state={state} />
      <HudSide mage={p2} active={turn(p2)} manaScale={manaScale} />
    </div>
  );
}
