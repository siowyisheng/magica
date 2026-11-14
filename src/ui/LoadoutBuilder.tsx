import { useState } from 'react';
import { ABILITIES, ARCHETYPES, RELICS } from '../game/content';
import { buildUnit, validateLoadout } from '../game/loadout';
import { newId } from '../game/storage';
import type { Loadout } from '../game/types';

interface Props {
  loadouts: Loadout[];
  onChange: (l: Loadout[]) => void;
  onBack: () => void;
}

export function LoadoutBuilder({ loadouts, onChange, onBack }: Props) {
  const [editingId, setEditingId] = useState<string | null>(loadouts[0]?.id ?? null);
  const editing = loadouts.find((l) => l.id === editingId) ?? null;

  const update = (patch: Partial<Loadout>) => {
    if (!editing) return;
    onChange(loadouts.map((l) => (l.id === editing.id ? { ...l, ...patch } : l)));
  };

  const create = () => {
    const l: Loadout = { id: newId(), name: 'New loadout', archetypeId: 'arcanist', abilityIds: [], relicIds: [] };
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

  const toggle = (field: 'abilityIds' | 'relicIds', id: string, max: number) => {
    if (!editing) return;
    const cur = editing[field];
    if (cur.includes(id)) update({ [field]: cur.filter((x) => x !== id) });
    else if (cur.length < max) update({ [field]: [...cur, id] });
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
            {ARCHETYPES[l.archetypeId]?.icon} {l.name}
          </button>
        ))}
        <button onClick={create}>+ New loadout</button>
      </div>

      {editing && <Editor loadout={editing} update={update} toggle={toggle} onDuplicate={duplicate} onDelete={remove} canDelete={loadouts.length > 1} />}
    </div>
  );
}

function Editor({
  loadout,
  update,
  toggle,
  onDuplicate,
  onDelete,
  canDelete,
}: {
  loadout: Loadout;
  update: (p: Partial<Loadout>) => void;
  toggle: (f: 'abilityIds' | 'relicIds', id: string, max: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const arch = ARCHETYPES[loadout.archetypeId];
  const errors = validateLoadout(loadout);
  const preview = buildUnit('p1', loadout.name, loadout, { q: 0, r: 0 });

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

      <section>
        <h3>Archetype</h3>
        <div className="cards">
          {Object.values(ARCHETYPES).map((a) => (
            <button
              key={a.id}
              className={`pick-card ${a.id === loadout.archetypeId ? 'is-selected' : ''}`}
              onClick={() =>
                update({
                  archetypeId: a.id,
                  abilityIds: loadout.abilityIds.slice(0, a.abilitySlots),
                  relicIds: loadout.relicIds.slice(0, a.relicSlots),
                })
              }
            >
              <span className="pick-icon">{a.icon}</span>
              <strong>{a.name}</strong>
              <span className="muted">{a.description}</span>
              <span className="stats">
                ❤ {a.hp} · ⚡ {a.ap} AP · 👣 {a.move} · {a.abilitySlots} spells · {a.relicSlots} relics
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>
          Abilities <span className="muted">{loadout.abilityIds.length}/{arch.abilitySlots}</span>
        </h3>
        <div className="cards small">
          {Object.values(ABILITIES).map((a) => {
            const on = loadout.abilityIds.includes(a.id);
            return (
              <button
                key={a.id}
                className={`pick-card school-${a.school} ${on ? 'is-selected' : ''}`}
                disabled={!on && loadout.abilityIds.length >= arch.abilitySlots}
                onClick={() => toggle('abilityIds', a.id, arch.abilitySlots)}
              >
                <span className="pick-icon">{a.icon}</span>
                <strong>{a.name}</strong>
                <span className="muted">{a.description}</span>
                <span className="stats">
                  {a.apCost} AP · rng {a.range}
                  {a.aoe ? ` · AoE ${a.aoe}` : ''}
                  {a.cooldown ? ` · CD ${a.cooldown}` : ''}
                  {a.needsLOS ? ' · LOS' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3>
          Relics <span className="muted">{loadout.relicIds.length}/{arch.relicSlots}</span>
        </h3>
        <div className="cards small">
          {Object.values(RELICS).map((r) => {
            const on = loadout.relicIds.includes(r.id);
            return (
              <button
                key={r.id}
                className={`pick-card ${on ? 'is-selected' : ''}`}
                disabled={!on && loadout.relicIds.length >= arch.relicSlots}
                onClick={() => toggle('relicIds', r.id, arch.relicSlots)}
              >
                <span className="pick-icon">{r.icon}</span>
                <strong>{r.name}</strong>
                <span className="muted">{r.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="preview">
        <h3>Final stats</h3>
        <div className="stats big">
          ❤ {preview.maxHp} HP · ⚡ {preview.maxAp} AP · 👣 {preview.move} move · 💥 +{preview.power} power · 🎯 +{preview.rangeBonus} range
        </div>
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
