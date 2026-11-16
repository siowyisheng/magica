import { useEffect, useRef, type CSSProperties } from 'react';
import { ABILITIES, PASSIVES, WEAPONS } from '../game/content';
import { CIRCLE_NAME } from '../game/loadout';
import { AP_PER_TURN, apCost, castError, effectiveManaRegen, maxMana, timing } from '../game/engine';
import { PERMANENT, type GameEvent, type GameState, type PlayerId, type Mage } from '../game/types';
import { STATUS_ICON } from './HexBoard';
import { abilitySummary } from './LoadoutBuilder';

/** Shared scale for both mages' bars, so a bigger maximum draws a longer bar. */
export interface BarScale {
  hp: number;
  mana: number;
}

export const barScale = (state: GameState): BarScale => ({
  hp: Math.max(state.mages.p1.maxHp, state.mages.p2.maxHp),
  mana: Math.max(maxMana(state.mages.p1), maxMana(state.mages.p2)),
});

/** HP shows one segment per point; Mana one segment per this much. */
const MANA_PER_SEGMENT = 3;

export function MageCard({ mage, active, scale }: { mage: Mage; active: boolean; scale: BarScale }) {
  return (
    <div className={`mage-card card-${mage.owner} ${active ? 'is-active' : ''}`}>
      <div className="mage-card-head">
        <span className="mage-card-icon">🧙</span>
        <div>
          <div className="mage-card-name">{mage.name}</div>
          <div className="muted">
            {CIRCLE_NAME[mage.circle]} · {WEAPONS[mage.weapon].icon}{WEAPONS[mage.weapon].name} · 🔮{mage.maxMana} (+{effectiveManaRegen(mage)}) · 👣{mage.movespeed}
          </div>
        </div>
      </div>
      <SegmentBar
        label="HP"
        cls="hp"
        value={mage.hp}
        max={mage.maxHp}
        scaleMax={scale.hp}
        perSegment={1}
        extra={mage.shield ? `+${mage.shield}🛡` : undefined}
      />
      <SegmentBar
        label="Mana"
        cls="mana"
        value={mage.mana}
        max={maxMana(mage)}
        scaleMax={scale.mana}
        perSegment={MANA_PER_SEGMENT}
      />
      {mage.passiveIds.length > 0 && (
        <div className="traits muted">
          {mage.passiveIds.map((id) => (
            <span key={id} title={PASSIVES[id]?.description}>
              {PASSIVES[id]?.icon} {PASSIVES[id]?.name}
            </span>
          ))}
        </div>
      )}
      {mage.statuses.length > 0 && (
        <div className="statuses">
          {mage.statuses.map((s) => (
            <span key={s.kind} className={`status status-${s.kind}`}>
              {STATUS_ICON[s.kind]} {s.kind} · {s.turns >= PERMANENT ? 'permanent' : s.turns}
            </span>
          ))}
        </div>
      )}
      <div className="mini-abilities">
        {mage.abilities.map((a) => (
          <span key={a.id} title={ABILITIES[a.id].name}>
            {ABILITIES[a.id].icon}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A bar split into equal segments of `perSegment` points, drawn at a length
 * proportional to `max / scaleMax` so both mages' bars share one scale.
 * The fill is continuous, so partial segments show exact values.
 */
function SegmentBar({
  label,
  cls,
  value,
  max,
  scaleMax,
  perSegment,
  extra,
}: {
  label: string;
  cls: string;
  value: number;
  max: number;
  scaleMax: number;
  perSegment: number;
  extra?: string;
}) {
  const length = max > 0 && scaleMax > 0 ? (100 * max) / scaleMax : 100;
  const style: CSSProperties = { width: `${length}%` };
  // One divider at every segment boundary inside the bar (the last segment may be partial).
  const dividers: number[] = [];
  for (let at = perSegment; at < max; at += perSegment) dividers.push((100 * at) / max);
  return (
    <div className="bar-row">
      <span className="muted">{label}</span>
      <div className="bar-slot">
        <div className={`seg-bar bar-${cls}`} style={style} role="meter" aria-label={label} aria-valuenow={value} aria-valuemax={max}>
          <div className="seg-fill" style={{ width: `${(100 * Math.max(0, value)) / Math.max(1, max)}%` }} />
          {dividers.map((left) => (
            <span key={left} className="seg-divider" style={{ left: `${left}%` }} />
          ))}
          <span className="seg-text">
            <span>
              {value} / {max}
            </span>
          </span>
        </div>
      </div>
      <span className="bar-extra muted">{extra}</span>
    </div>
  );
}

/** AP and Movement Points left, for the action bar on the player's own turn. */
export function TurnResources({ mage }: { mage: Mage }) {
  return (
    <div className="turn-resources">
      <div className="pips" title="Action Points left this turn">
        <span className="muted">AP</span>
        {Array.from({ length: Math.max(AP_PER_TURN, mage.ap) }, (_, i) => (
          <span key={i} className={`pip ${i < mage.ap ? 'on' : ''}`} />
        ))}
      </div>
      {mage.mp > 0 && (
        <div className="pips" title="Movement Points left this turn">
          <span className="muted">Move</span>
          <strong className="mp-left">{mage.mp}</strong>
        </div>
      )}
    </div>
  );
}

/**
 * The Abilities on the bar right now, in loadout order. Each phase shows only what can be used in it:
 * Reaction-only Abilities leave the bar in the Action Phase, and action-only ones in the Reaction Phase.
 * A hotkey is an Ability's position in this list, so the first Ability on the bar is always key 1.
 */
export function barAbilityIds(state: GameState, player: PlayerId): string[] {
  const hidden = state.phase === 'action' ? 'reaction' : 'action';
  return state.mages[player].abilities.map((s) => s.id).filter((id) => timing(ABILITIES[id]) !== hidden);
}

export function AbilityBar({
  state,
  player,
  selected,
  onSelect,
  disabled,
}: {
  state: GameState;
  player: PlayerId;
  selected: string | null;
  onSelect: (id: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="ability-bar">
      {barAbilityIds(state, player).map((id, i) => {
        const def = ABILITIES[id];
        const slot = { id };
        const err = castError(state, player, slot.id);
        return (
          <button
            key={slot.id}
            className={`ability school-${def.school} ${selected === slot.id ? 'is-selected' : ''}`}
            disabled={disabled || !!err}
            onClick={() => onSelect(selected === slot.id ? null : slot.id)}
            title={`${def.name} — ${def.description}\n${abilitySummary(def)}${err ? `\n${err}` : ''}`}
          >
            <span className="hotkey">{i + 1}</span>
            {def.timing === 'reaction' && <span className="badge reaction">React</span>}
            {def.timing === 'both' && <span className="badge both">React · Act</span>}
            {def.fast && <span className="badge fast">Fast</span>}
            <span className="ability-icon">{def.icon}</span>
            <span className="ability-name">{def.name}</span>
            <span className="ability-cost">
              {apCost(def)} AP
              {def.mana > 0 && <span className="mana-cost"> · {def.mana}💧</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EventLog({ events }: { events: GameEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [events.length]);
  return (
    <div className="event-log" ref={ref}>
      {events.slice(-80).map((e, i) => (
        <div key={i} className={`event event-${e.kind}`}>
          <span className="muted">R{Math.ceil(e.turn / 2)}</span> {e.text}
        </div>
      ))}
    </div>
  );
}

export function PhaseBanner({ state }: { state: GameState }) {
  if (state.winner) return null;
  const name = state.mages[state.active].name;
  const incoming = state.pending.filter((a) => a.caster !== state.active).length;
  return state.phase === 'reaction' ? (
    <div className="phase-banner reaction">
      ⚠ Reaction Phase · {name} faces {incoming} incoming attack{incoming === 1 ? '' : 's'}: use a Reaction to dodge or block
    </div>
  ) : (
    <div className="phase-banner action">Action Phase · {name}</div>
  );
}

export function TurnTimer({ remaining, total }: { remaining: number; total: number }) {
  const frac = Math.max(0, Math.min(1, remaining / total));
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`turn-timer ${remaining < 5 ? 'urgent' : ''}`} viewBox="0 0 56 56" width={56} height={56}>
      <circle cx={28} cy={28} r={r} className="timer-bg" />
      <circle cx={28} cy={28} r={r} className="timer-fg" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 28 28)" />
      <text x={28} y={29} textAnchor="middle" dominantBaseline="middle">
        {Math.ceil(remaining)}
      </text>
    </svg>
  );
}
