import { useEffect, useRef } from 'react';
import { ABILITIES, PASSIVES } from '../game/content';
import { CIRCLE_NAME } from '../game/loadout';
import { AP_PER_TURN, apCost, castError, maxMana, mpPerAp } from '../game/engine';
import type { GameEvent, GameState, PlayerId, Mage } from '../game/types';
import { STATUS_ICON } from './HexBoard';
import { abilitySummary } from './LoadoutBuilder';

export function MageCard({ mage, active }: { mage: Mage; active: boolean }) {
  return (
    <div className={`mage-card card-${mage.owner} ${active ? 'is-active' : ''}`}>
      <div className="mage-card-head">
        <span className="mage-card-icon">🧙</span>
        <div>
          <div className="mage-card-name">{mage.name}</div>
          <div className="muted">
            {CIRCLE_NAME[mage.circle]} · 🔮{mage.magic} · 👣{mage.movespeed}
          </div>
        </div>
      </div>
      <Bar label="HP" value={mage.hp} max={mage.maxHp} cls="hp" extra={mage.shield ? `+${mage.shield}🛡` : ''} />
      <Bar label="Mana" value={mage.mana} max={maxMana(mage)} cls="mana" extra={`+${mage.magic + mage.manaRegen}/turn`} />
      <div className="pips">
        <span className="muted">AP</span>
        {Array.from({ length: Math.max(AP_PER_TURN, mage.ap) }, (_, i) => (
          <span key={i} className={`pip ${i < mage.ap ? 'on' : ''}`} />
        ))}
      </div>
      {mage.passiveIds.length > 0 && (
        <div className="traits muted">
          {mage.passiveIds.map((id) => (
            <span key={id} title={PASSIVES[id]?.description}>
              {PASSIVES[id]?.icon} {PASSIVES[id]?.name}
            </span>
          ))}
        </div>
      )}
      <div className="pips">
        <span className="muted">Move</span>
        {Array.from({ length: mage.mp }, (_, i) => (
          <span key={i} className="pip move on" />
        ))}
        <span className="muted mp-note">
          {mage.mp > 0 ? `${mage.mp} left · ` : ''}+{mpPerAp(mage)} per AP
        </span>
      </div>
      {mage.statuses.length > 0 && (
        <div className="statuses">
          {mage.statuses.map((s) => (
            <span key={s.kind} className={`status status-${s.kind}`}>
              {STATUS_ICON[s.kind]} {s.kind} · {s.turns}
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

function Bar({ label, value, max, cls, extra }: { label: string; value: number; max: number; cls: string; extra?: string }) {
  return (
    <div className="bar-row">
      <span className="muted">{label}</span>
      <div className={`bar bar-${cls}`}>
        <div style={{ width: `${(100 * value) / max}%` }} />
      </div>
      <span className="bar-num">
        {value}/{max} {extra}
      </span>
    </div>
  );
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
  const mage = state.mages[player];
  return (
    <div className="ability-bar">
      {mage.abilities.map((slot, i) => {
        const def = ABILITIES[slot.id];
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
              {def.fast || (state.phase === 'reaction' && def.timing && def.timing !== 'action') ? '0 AP' : `${apCost(def)} AP`}
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
      ⚠ Reaction Phase · {name} faces {incoming} incoming attack{incoming === 1 ? '' : 's'}: move out of the red
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
