import { useEffect, useRef } from 'react';
import { ABILITIES } from '../game/content';
import { CIRCLE_NAME } from '../game/loadout';
import { AP_PER_TURN, apCost, castError, maxMana, mpPerAp } from '../game/engine';
import type { GameEvent, GameState, PlayerId, Mage } from '../game/types';
import { STATUS_ICON } from './HexBoard';

export function MageCard({ unit, active }: { unit: Mage; active: boolean }) {
  return (
    <div className={`unit-card card-${unit.owner} ${active ? 'is-active' : ''}`}>
      <div className="unit-card-head">
        <span className="unit-card-icon">🧙</span>
        <div>
          <div className="unit-card-name">{unit.name}</div>
          <div className="muted">
            {CIRCLE_NAME[unit.circle]} · 🔮{unit.magic} · 👣{unit.movespeed}
          </div>
        </div>
      </div>
      <Bar label="HP" value={unit.hp} max={unit.maxHp} cls="hp" extra={unit.shield ? `+${unit.shield}🛡` : ''} />
      <Bar label="Mana" value={unit.mana} max={maxMana(unit)} cls="mana" extra={`+${unit.magic}/turn`} />
      <div className="pips">
        <span className="muted">AP</span>
        {Array.from({ length: Math.max(AP_PER_TURN, unit.ap) }, (_, i) => (
          <span key={i} className={`pip ${i < unit.ap ? 'on' : ''}`} />
        ))}
      </div>
      {(unit.armor > 0 || unit.regen > 0) && (
        <div className="traits muted">
          {unit.armor > 0 && <span>🪨 {unit.armor} armor</span>}
          {unit.regen > 0 && <span>✚ {unit.regen} regen</span>}
        </div>
      )}
      <div className="pips">
        <span className="muted">Move</span>
        {Array.from({ length: unit.mp }, (_, i) => (
          <span key={i} className="pip move on" />
        ))}
        <span className="muted mp-note">
          {unit.mp > 0 ? `${unit.mp} left · ` : ''}+{mpPerAp(unit)} per AP
        </span>
      </div>
      {unit.statuses.length > 0 && (
        <div className="statuses">
          {unit.statuses.map((s) => (
            <span key={s.kind} className={`status status-${s.kind}`}>
              {STATUS_ICON[s.kind]} {s.kind} · {s.turns}
            </span>
          ))}
        </div>
      )}
      <div className="mini-abilities">
        {unit.abilities.map((a) => (
          <span key={a.id} title={ABILITIES[a.id].name} className={a.cooldown ? 'cd' : ''}>
            {ABILITIES[a.id].icon}
            {a.cooldown > 0 && <sub>{a.cooldown}</sub>}
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
  const unit = state.mages[player];
  return (
    <div className="ability-bar">
      {unit.abilities.map((slot, i) => {
        const def = ABILITIES[slot.id];
        const err = castError(state, player, slot.id);
        return (
          <button
            key={slot.id}
            className={`ability school-${def.school} ${selected === slot.id ? 'is-selected' : ''}`}
            disabled={disabled || !!err}
            onClick={() => onSelect(selected === slot.id ? null : slot.id)}
            title={`${def.name} — ${def.description}\n${def.fast ? 'Fast (0 AP)' : '1 AP'} · ${def.mana} Mana · range ${def.range}${def.aoe ? ` · AoE ${def.aoe}` : ''}${def.cooldown ? ` · CD ${def.cooldown}` : ''}${err ? `\n${err}` : ''}`}
          >
            <span className="hotkey">{i + 1}</span>
            <span className="ability-icon">{def.icon}</span>
            <span className="ability-name">{def.name}</span>
            <span className="ability-cost">
              {def.fast ? 'Fast' : `${apCost(def)} AP`}
              {def.mana > 0 && <span className="mana-cost"> · {def.mana}💧</span>}
            </span>
            {slot.cooldown > 0 && <span className="cooldown-mask">{slot.cooldown}</span>}
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
