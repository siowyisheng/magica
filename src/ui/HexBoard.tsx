import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES } from '../game/content';
import { fromKey, hexPoints, key, toPixel, type Hex } from '../game/hex';
import { CRYSTAL_STATE_NAME } from '../game/crystals';
import { PLAYERS, type GameState, type PlayerId, type StatusKind } from '../game/types';

const SIZE = 30;
/** Time a walking mage spends on each hex. */
const STEP_MS = 120;
export const STATUS_ICON: Record<StatusKind, string> = { burn: '🔥', poison: '🦠', slow: '🐌', root: '⛓️', vulnerable: '🎯' };
const TERRAIN_ICON: Record<string, string> = { rock: '🪨' };

export interface BoardHighlights {
  reachable?: Set<string>;
  /** Reachable with leftover Movement Points, without spending AP. */
  free?: Set<string>;
  /** Reachable only by spending 2 AP on movement. */
  twoAp?: Set<string>;
  targets?: Set<string>;
  impact?: Set<string>;
  path?: Set<string>;
}

interface Props {
  state: GameState;
  highlights?: BoardHighlights;
  onHexClick?: (h: Hex) => void;
  onHexHover?: (h: Hex | null) => void;
}

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: string;
}

export function HexBoard({ state, highlights = {}, onHexClick, onHexHover }: Props) {
  const tiles = useMemo(() => Object.values(state.tiles), [state.tiles]);
  const viewBox = useMemo(() => {
    const pts = tiles.map((t) => toPixel(t, SIZE));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = SIZE * 1.4;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
  }, [tiles]);
  const poly = useMemo(() => hexPoints(SIZE - 1.5), []);

  // Floating combat text for newly appended events.
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seen = useRef(state.events.length);
  useEffect(() => {
    if (state.events.length < seen.current) seen.current = 0; // replay scrubbed backwards
    const fresh = state.events.slice(seen.current).filter((e) => e.at && e.amount !== undefined);
    seen.current = state.events.length;
    if (!fresh.length) return;
    const add = fresh.map((e, i) => {
      const p = toPixel(e.at!, SIZE);
      const sign = e.kind === 'damage' ? '−' : '+';
      return { id: Date.now() + i + Math.random(), x: p.x, y: p.y, text: `${sign}${e.amount}`, kind: e.kind };
    });
    setFloaters((f) => [...f, ...add]);
    const ids = new Set(add.map((a) => a.id));
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => !ids.has(x.id))), 1100);
    return () => clearTimeout(t);
  }, [state.events]);

  // A Move is drawn hex by hex along the walked path rather than as a straight slide through rocks.
  const [walking, setWalking] = useState<Partial<Record<PlayerId, Hex>>>({});
  const walkSeen = useRef(state.events.length);
  const walkTimers = useRef<Partial<Record<PlayerId, number[]>>>({});
  useLayoutEffect(() => {
    if (state.events.length < walkSeen.current) {
      // Scrubbed backwards: drop any walk in progress.
      Object.values(walkTimers.current).forEach((ts) => ts?.forEach(clearTimeout));
      walkTimers.current = {};
      setWalking({});
      walkSeen.current = state.events.length;
      return;
    }
    const fresh = state.events.slice(walkSeen.current);
    walkSeen.current = state.events.length;
    if (fresh.length > 12) return; // a jump, not a turn: no animation
    for (const e of fresh) {
      if (!e.player || !e.path || e.path.length < 2) continue;
      const p = e.player;
      const path = e.path;
      walkTimers.current[p]?.forEach(clearTimeout);
      setWalking((w) => ({ ...w, [p]: path[0] }));
      walkTimers.current[p] = path.slice(1).map((h, i) =>
        window.setTimeout(() => {
          setWalking((w) => {
            if (i === path.length - 2) {
              const { [p]: _done, ...rest } = w;
              return rest;
            }
            return { ...w, [p]: h };
          });
        }, (i + 1) * STEP_MS),
      );
    }
  }, [state.events]);
  useEffect(() => () => Object.values(walkTimers.current).forEach((ts) => ts?.forEach(clearTimeout)), []);

  return (
    <svg className="board" viewBox={viewBox} onMouseLeave={() => onHexHover?.(null)}>
      <defs>
        <radialGradient id="glow-p1">
          <stop offset="0%" stopColor="var(--p1)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--p1)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow-p2">
          <stop offset="0%" stopColor="var(--p2)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--p2)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {tiles.map((t) => {
        const k = key(t);
        const { x, y } = toPixel(t, SIZE);
        const cls = [
          'tile',
          `terrain-${t.terrain}`,
          highlights.reachable?.has(k) && 'is-reachable',
          highlights.reachable?.has(k) && !highlights.free?.has(k) && !highlights.twoAp?.has(k) && 'costs-ap',
          highlights.twoAp?.has(k) && !highlights.free?.has(k) && 'costs-2ap',
          highlights.targets?.has(k) && 'is-target',
          highlights.impact?.has(k) && 'is-impact',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={k}
            transform={`translate(${x} ${y})`}
            className={cls}
            onClick={() => onHexClick?.(t)}
            onMouseEnter={() => onHexHover?.(t)}
          >
            <polygon points={poly} />
            {TERRAIN_ICON[t.terrain] && (
              <text className="terrain-icon" textAnchor="middle" dominantBaseline="central">
                {TERRAIN_ICON[t.terrain]}
              </text>
            )}
          </g>
        );
      })}

      {state.pending.filter((a) => a.area.length > 0).map((a) => (
        <g key={a.id} className={`threat threat-${a.caster}`}>
          {a.area.map((k) => {
            const { x, y } = toPixel(fromKey(k), SIZE);
            return <polygon key={k} points={poly} transform={`translate(${x} ${y})`} />;
          })}
          {(() => {
            const mid = toPixel(fromKey(a.area[Math.floor(a.area.length / 2)]), SIZE);
            return (
              <text className="threat-icon" x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central">
                {ABILITIES[a.abilityId]?.icon}
              </text>
            );
          })()}
        </g>
      ))}

      {state.crystals.map((c) => {
        const { x, y } = toPixel(c.pos, SIZE);
        return (
          <g
            key={c.size}
            className={`crystal crystal-${c.size} crystal-${c.state}`}
            transform={`translate(${x} ${y})`}
            onClick={() => onHexClick?.(c.pos)}
            onMouseEnter={() => onHexHover?.(c.pos)}
          >
            <title>{`${c.size === 'large' ? 'Large' : 'Small'} Mana Crystal · ${CRYSTAL_STATE_NAME[c.state]}`}</title>
            <polygon points={c.size === 'large' ? '0,-17 12,-3 0,17 -12,-3' : '0,-12 8,-2 0,12 -8,-2'} />
            {c.state === 'almostReady' && (
              <text className="crystal-pip" y={SIZE * 0.78} textAnchor="middle">
                1
              </text>
            )}
            {c.state === 'spawning' && (
              <text className="crystal-pip" y={SIZE * 0.78} textAnchor="middle">
                2
              </text>
            )}
          </g>
        );
      })}

      {PLAYERS.map((p) => {
        const u = state.mages[p];
        const shown = walking[p];
        const { x, y } = toPixel(shown ?? u.pos, SIZE);
        const hpW = SIZE * 1.4;
        const active = state.active === p && !state.winner;
        return (
          <g
            key={p}
            className={`mage mage-${p} ${shown ? 'is-walking' : ''} ${active ? 'is-active' : ''} ${u.hp <= 0 ? 'is-dead' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => onHexClick?.(u.pos)}
            onMouseEnter={() => onHexHover?.(u.pos)}
          >
            {active && <circle r={SIZE * 1.1} fill={`url(#glow-${p})`} className="mage-glow" />}
            <circle r={SIZE * 0.68} className="mage-body" />
            <text className="mage-icon" textAnchor="middle" dominantBaseline="central">
              🧙
            </text>
            <g transform={`translate(${-hpW / 2} ${-SIZE * 1.05})`}>
              <rect width={hpW} height={5} rx={2} className="hp-bg" />
              <rect width={(hpW * u.hp) / u.maxHp} height={5} rx={2} className="hp-fill" />
              {u.shield > 0 && <rect width={Math.min(hpW, (hpW * u.shield) / u.maxHp)} height={2} y={-3} className="shield-fill" />}
            </g>
            {u.statuses.length > 0 && (
              <text y={SIZE * 0.95} className="mage-status" textAnchor="middle">
                {u.statuses.map((s) => STATUS_ICON[s.kind]).join('')}
              </text>
            )}
          </g>
        );
      })}

      {floaters.map((f) => (
        <text key={f.id} x={f.x} y={f.y - SIZE * 0.4} className={`floater floater-${f.kind}`} textAnchor="middle">
          {f.text}
        </text>
      ))}
    </svg>
  );
}
