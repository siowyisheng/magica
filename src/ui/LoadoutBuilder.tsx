import { useState } from 'react';
import { ABILITIES, PASSIVES, SCHOOLS, STAFF_STRIKE } from '../game/content';
import {
  CIRCLE_NAME,
  CIRCLE_POINTS,
  MAX_ABILITIES,
  STAT_KEYS,
  STAT_NAME,
  STAT_STEP_GAIN,
  loadoutCost,
  pointsLeft,
  statStepCost,
  statValue,
  validateLoadout,
} from '../game/loadout';
import { newId } from '../game/storage';
import type { AbilityDef, Circle, Loadout, School, StatKey } from '../game/types';

interface Props {
  loadouts: Loadout[];
  onChange: (l: Loadout[]) => void;
  onBack: () => void;
}

const CIRCLES: Circle[] = [1, 2, 3];
const STAT_ICON: Record<StatKey, string> = { hp: '❤', magic: '🔮', movespeed: '👣' };

export function LoadoutBuilder({ loadouts, onChange, onBack }: Props) {
  const [editingId, setEditingId] = useState<string | null>(loadouts[0]?.id ?? null);
  const editing = loadouts.find((l) => l.id === editingId) ?? null;

  const update = (patch: Partial<Loadout>) => {
    if (!editing) return;
    onChange(loadouts.map((l) => (l.id === editing.id ? { ...l, ...patch } : l)));
  };

  const create = () => {
    const l: Loadout = {
      id: newId(),
      name: 'New loadout',
      circle: 2,
      stats: { hp: 0, magic: 0, movespeed: 0 },
      abilityIds: [STAFF_STRIKE],
      passiveIds: [],
    };
    onChange([...loadouts, l]);
    setEditingId(l.id);
  };

  const duplicate = () => {
    if (!editing) return;
    const l = { ...editing, id: newId(), name: `${editing.name} copy` };
    onChange([...loadouts, l]);
    setEditingId(l.id);
  };

  const remove = () => {
    if (!editing || loadouts.length <= 1) return;
    const rest = loadouts.filter((l) => l.id !== editing.id);
    onChange(rest);
    setEditingId(rest[0].id);
  };

  return (
    <div className="page builder">
      <div className="builder-list">
        <button className="ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Loadouts</h2>
        {loadouts.map((l) => (
          <button
            key={l.id}
            className={`list-item ${l.id === editingId ? 'is-selected' : ''} ${validateLoadout(l).length ? 'invalid' : ''}`}
            onClick={() => setEditingId(l.id)}
          >
            {l.name} <span className="muted">· {CIRCLE_NAME[l.circle]}</span>
          </button>
        ))}
        <button onClick={create}>+ New loadout</button>
      </div>

      {editing && (
        <Editor loadout={editing} update={update} onDuplicate={duplicate} onDelete={remove} canDelete={loadouts.length > 1} />
      )}
    </div>
  );
}

function Editor({
  loadout,
  update,
  onDuplicate,
  onDelete,
  canDelete,
}: {
  loadout: Loadout;
  update: (p: Partial<Loadout>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [filter, setFilter] = useState<School | 'all'>('all');
  const errors = validateLoadout(loadout);
  const left = pointsLeft(loadout);
  const budget = CIRCLE_POINTS[loadout.circle];
  const full = loadout.abilityIds.length >= MAX_ABILITIES;

  const setSteps = (k: StatKey, steps: number) => update({ stats: { ...loadout.stats, [k]: Math.max(0, steps) } });
  const toggleAbility = (id: string) => {
    if (id === STAFF_STRIKE) return;
    const has = loadout.abilityIds.includes(id);
    update({ abilityIds: has ? loadout.abilityIds.filter((x) => x !== id) : [...loadout.abilityIds, id] });
  };
  const togglePassive = (id: string) => {
    const has = loadout.passiveIds.includes(id);
    update({ passiveIds: has ? loadout.passiveIds.filter((x) => x !== id) : [...loadout.passiveIds, id] });
  };

  const shown = Object.values(ABILITIES).filter((a) => a.id !== STAFF_STRIKE && (filter === 'all' || a.school === filter));
  const schools = (Object.keys(SCHOOLS) as School[]).filter((sc) => Object.values(ABILITIES).some((a) => a.school === sc));

  return (
    <div className="builder-editor">
      <div className="row">
        <input className="name-input" value={loadout.name} onChange={(e) => update({ name: e.target.value })} />
        <button className="ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="ghost danger" onClick={onDelete} disabled={!canDelete}>
          Delete
        </button>
      </div>

      <div className={`budget ${left < 0 ? 'over' : ''}`}>
        <div className="budget-bar">
          <div style={{ width: `${Math.min(100, (100 * loadoutCost(loadout)) / budget)}%` }} />
        </div>
        <span>
          <strong>{left}</strong> / {budget} Loadout Points left
        </span>
      </div>

      <section>
        <h3>Circle</h3>
        <div className="segmented">
          {CIRCLES.map((c) => (
            <button key={c} className={loadout.circle === c ? 'is-selected' : ''} onClick={() => update({ circle: c })}>
              {CIRCLE_NAME[c]} <span className="muted">· {CIRCLE_POINTS[c]} pts</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Stats</h3>
        <div className="stat-rows">
          {STAT_KEYS.map((k) => {
            const steps = loadout.stats[k];
            const next = statStepCost(k, steps + 1);
            return (
              <div key={k} className="stat-row">
                <span className="stat-label">
                  {STAT_ICON[k]} {STAT_NAME[k]}
                </span>
                <button className="ghost" disabled={steps <= 0} onClick={() => setSteps(k, steps - 1)}>
                  −
                </button>
                <strong className="stat-value">{statValue(k, steps)}</strong>
                <button disabled={next > left} onClick={() => setSteps(k, steps + 1)}>
                  +{STAT_STEP_GAIN[k]} <span className="muted">({next} pts)</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3>
          Abilities <span className="muted">{loadout.abilityIds.length}/{MAX_ABILITIES}</span>
        </h3>
        <div className="slots">
          {Array.from({ length: MAX_ABILITIES }, (_, i) => {
            const id = loadout.abilityIds[i];
            const a = id ? ABILITIES[id] : null;
            return (
              <button
                key={i}
                className={`slot ${a ? `school-${a.school}` : 'empty'}`}
                disabled={!a || id === STAFF_STRIKE}
                onClick={() => id && toggleAbility(id)}
                title={a ? (id === STAFF_STRIKE ? 'Every mage has Staff Strike' : 'Click to remove') : 'Empty slot'}
              >
                {a ? (
                  <>
                    <span>{a.icon}</span>
                    <span className="slot-name">{a.name}</span>
                  </>
                ) : (
                  <span className="muted">{i + 1}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="filters">
          <button className={filter === 'all' ? 'is-selected' : ''} onClick={() => setFilter('all')}>
            All
          </button>
          {schools.map((sc) => (
            <button key={sc} className={`school-chip school-${sc} ${filter === sc ? 'is-selected' : ''}`} onClick={() => setFilter(sc)}>
              {SCHOOLS[sc].icon} {SCHOOLS[sc].name}
            </button>
          ))}
        </div>
        <div className="cards small">
          {shown.map((a) => {
            const on = loadout.abilityIds.includes(a.id);
            return (
              <button
                key={a.id}
                className={`pick-card school-${a.school} ${on ? 'is-selected' : ''}`}
                disabled={!on && (full || a.points > left)}
                onClick={() => toggleAbility(a.id)}
              >
                <span className="pick-head">
                  <span className="pick-icon">{a.icon}</span>
                  <span className="price">{a.points} pts</span>
                </span>
                <strong>{a.name}</strong>
                <span className="muted">{a.description}</span>
                <span className="stats">{abilitySummary(a)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {Object.keys(PASSIVES).length > 0 && (
        <section>
          <h3>Passives</h3>
          <div className="cards small">
            {Object.values(PASSIVES).map((p) => {
              const on = loadout.passiveIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  className={`pick-card ${on ? 'is-selected' : ''}`}
                  disabled={!on && p.points > left}
                  onClick={() => togglePassive(p.id)}
                >
                  <span className="pick-head">
                    <span className="pick-icon">{p.icon}</span>
                    <span className="price">{p.points} pts</span>
                  </span>
                  <strong>{p.name}</strong>
                  <span className="muted">{p.description}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function abilitySummary(a: AbilityDef): string {
  const parts = [a.kind === 'technique' ? 'Technique' : `Spell · ${a.mana} Mana`, a.fast ? 'Fast' : '1 AP'];
  if (a.range) parts.push(`rng ${a.range}`);
  if (a.aoe) parts.push(`AoE ${a.aoe}`);
  return parts.join(' · ');
}
