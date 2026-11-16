import { useState } from 'react';
import { ABILITIES, PASSIVES, SCHOOLS, WEAPONS, WEAPON_IDS } from '../game/content';
import {
  abilityIdsFor,
  CIRCLE_NAME,
  CIRCLE_POINTS,
  MAX_ABILITIES,
  STAT_KEYS,
  STAT_NAME,
  statStepGain,
  loadoutCost,
  pointsLeft,
  statStepCost,
  statValue,
  validateLoadout,
} from '../game/loadout';
import { timing } from '../game/engine';
import { newId } from '../game/storage';
import { SHAPE_NAME } from '../game/threat';
import { UNLIMITED, type AbilityDef, type Circle, type Loadout, type School, type StatKey, type WeaponId } from '../game/types';

interface Props {
  loadouts: Loadout[];
  onChange: (l: Loadout[]) => void;
  onBack: () => void;
}

const CIRCLES: Circle[] = [1, 2, 3];
const STAT_ICON: Record<StatKey, string> = { hp: '❤', maxMana: '🔮', manaRegen: '💧', movespeed: '👣' };

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
      stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed: 0 },
      weapon: 'unarmed',
      abilityIds: [],
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
  const owned = abilityIdsFor(loadout);
  const full = owned.length >= MAX_ABILITIES;
  const ownTechnique = WEAPONS[loadout.weapon]?.defaultTechnique;
  /** Each weapon's free technique, which is never picked by hand. */
  const defaultTechniques = new Set(WEAPON_IDS.map((w) => WEAPONS[w].defaultTechnique));
  const setWeapon = (w: WeaponId) =>
    update({ weapon: w, abilityIds: loadout.abilityIds.filter((id) => !ABILITIES[id]?.weapon || ABILITIES[id].weapon === w) });

  const setSteps = (k: StatKey, steps: number) => update({ stats: { ...loadout.stats, [k]: Math.max(0, steps) } });
  const toggleAbility = (id: string) => {
    if (id === ownTechnique) return;
    const has = loadout.abilityIds.includes(id);
    update({ abilityIds: has ? loadout.abilityIds.filter((x) => x !== id) : [...loadout.abilityIds, id] });
  };
  const togglePassive = (id: string) => {
    const has = loadout.passiveIds.includes(id);
    update({ passiveIds: has ? loadout.passiveIds.filter((x) => x !== id) : [...loadout.passiveIds, id] });
  };

  const equipped = owned.filter((id) => ABILITIES[id]);
  const renderCard = (a: AbilityDef) => {
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
          <span className="pick-costs">
            {/* Mana always sits in the same place, so costs are easy to scan down the list. */}
            <span className={`mana-cost ${a.mana ? '' : 'none'}`} title={a.mana ? `${a.mana} Mana` : 'No Mana cost'}>
              {a.mana ? `💧 ${a.mana}` : '—'}
            </span>
            <span className="price">{a.points} pts</span>
          </span>
        </span>
        <strong>{a.name}</strong>
        <span className="muted">{a.description}</span>
        <span className="stats">{abilitySummary(a)}</span>
      </button>
    );
  };
  const SlotButton = ({ id, onClick }: { id: string; onClick: () => void }) => {
    const a = ABILITIES[id];
    return (
      <button
        className={`slot school-${a.school}`}
        disabled={id === ownTechnique}
        onClick={onClick}
        title={id === ownTechnique ? `Comes with your ${WEAPONS[loadout.weapon].name}` : 'Click to remove'}
      >
        <span>{a.icon}</span>
        <span className="slot-name">{a.name}</span>
      </button>
    );
  };

  const shown = Object.values(ABILITIES).filter(
    (a) => !defaultTechniques.has(a.id) && (!a.weapon || a.weapon === loadout.weapon) && (filter === 'all' || a.school === filter),
  );
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
                  +{statStepGain(k, steps + 1)} <span className="muted">({next} pts)</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3>
          Weapon <span className="muted">choose one</span>
        </h3>
        <div className="cards small">
          {WEAPON_IDS.map((w) => {
            const def = WEAPONS[w];
            const on = loadout.weapon === w;
            const swing = left + (WEAPONS[loadout.weapon]?.points ?? 0) - def.points;
            const technique = def.defaultTechnique ? ABILITIES[def.defaultTechnique] : null;
            return (
              <button key={w} className={`pick-card ${on ? 'is-selected' : ''}`} disabled={!on && swing < 0} onClick={() => setWeapon(w)}>
                <span className="pick-head">
                  <span className="pick-icon">{def.icon}</span>
                  <span className="price">{def.points} pts</span>
                </span>
                <strong>{def.name}</strong>
                <span className="muted">{def.description}</span>
                {technique && <span className="stats">{abilitySummary(technique)}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>
          Abilities <span className="muted">{owned.length}/{MAX_ABILITIES}</span>
        </h3>
        <div className="slot-groups">
          <div className="slot-group">
            <h4>Action</h4>
            <div className="slots">
              {equipped.filter((id) => !canReact(ABILITIES[id])).map((id) => (
                <SlotButton key={id} id={id} onClick={() => toggleAbility(id)} />
              ))}
              {Array.from({ length: Math.max(0, MAX_ABILITIES - owned.length) }, (_, i) => (
                <button key={`empty-${i}`} className="slot empty" disabled title="Empty slot">
                  <span className="muted">·</span>
                </button>
              ))}
            </div>
          </div>
          <div className="slot-group reaction">
            <h4>Reaction</h4>
            <div className="slots">
              {equipped.filter((id) => canReact(ABILITIES[id])).map((id) => (
                <SlotButton key={id} id={id} onClick={() => toggleAbility(id)} />
              ))}
              {!equipped.some((id) => canReact(ABILITIES[id])) && <span className="muted">None yet</span>}
            </div>
          </div>
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
        <div className="cards small">{shown.filter((a) => !canReact(a)).map(renderCard)}</div>
        {shown.some(canReact) && (
          <>
            <h4 className="category-head reaction">Reaction Abilities</h4>
            <p className="muted">Used in the Reaction Phase, in answer to incoming Attacks. Each costs 1 AP.</p>
            <div className="cards small reaction">{shown.filter(canReact).map(renderCard)}</div>
          </>
        )}
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

/** Abilities usable in the Reaction Phase, shown in their own category. */
const canReact = (a: AbilityDef) => timing(a) !== 'action';

/** Everything about an Ability except its Mana cost, which has its own place on the card. Every non-Fast Ability costs 1 AP, so that is left unsaid. */
export function abilitySummary(a: AbilityDef): string {
  const parts: string[] = [];
  if (a.weapon) parts.push(`${WEAPONS[a.weapon].name} technique`);
  else if (a.kind === 'technique') parts.push('Technique');
  if (a.fast) parts.push(a.multi ? 'Fast · Multi' : 'Fast');
  if (a.timing === 'reaction') parts.push('Reaction');
  if (a.timing === 'both') parts.push('Reaction or Action');
  if (a.effect.type === 'attack') {
    const s = a.effect.shape;
    parts.push(SHAPE_NAME[s.kind]);
    if ('range' in s && s.range && s.range < UNLIMITED) parts.push(`rng ${s.range}`);
    if (a.effect.hit.damage) parts.push(`${a.effect.hit.damage} dmg`);
  } else if (a.targeting === 'tile') parts.push(`rng ${a.range}`);
  else if (a.targeting === 'enemy') parts.push(`enemy · rng ${a.range} · line of sight`);
  if (a.effect.type === 'contest') parts.push('secret bid');
  // A Fast Ability is once per turn unless it is Multi, so only the other cases are worth saying.
  if (a.perTurn === 1 && !a.fast) parts.push('once per turn');
  return parts.join(' · ');
}
