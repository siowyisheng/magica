import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ABILITIES } from '../game/content';
import { fromKey, hexPoints, key, neighbors, toPixel, type Hex } from '../game/hex';
import { CRYSTAL_STATE_NAME } from '../game/crystals';
import { other, PLAYERS, type GameState, type PlayerId, type StatusKind } from '../game/types';

const SIZE = 30;
/** Time a walking mage spends on each hex. */
const STEP_MS = 120;
export const STATUS_ICON: Record<StatusKind, string> = { burn: '🔥', poison: '🦠', slow: '🐌', root: '⛓️', vulnerable: '🎯', disarmed: '🚫', fatigue: '😮‍💨', armored: '🔰', charm: '💘', fear: '😱', asleep: '💤' };
const TERRAIN_ICON: Record<string, string> = {};

export interface BoardHighlights {
  reachable?: Set<string>;
  /** Reachable with leftover Movement Points, without spending AP. */
  free?: Set<string>;
  /** Reachable only by spending 2 AP on movement. */
  twoAp?: Set<string>;
  targets?: Set<string>;
  /** The hex being aimed at, drawn apart from the rest of the Threat Area it would create. */
  aim?: string;
  impact?: Set<string>;
  /** The Ability being aimed: its icon is drawn on every hex of the preview. */
  impactIcon?: string;
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
  // Rocks are discs, and neighbouring rocks are joined by a bar of the same width: two make a flat-sided
  // wall with rounded ends, three that touch make a rounded triangle, and so on.
  const rocks = useMemo(() => {
    const rock = new Set(tiles.filter((t) => t.terrain === 'rock').map(key));
    const discs = [...rock].map((k) => toPixel(fromKey(k), SIZE));
    const bars = [...rock].flatMap((k) =>
      neighbors(fromKey(k))
        .filter((n) => rock.has(key(n)) && key(n) > k)
        .map((n) => ({ a: toPixel(fromKey(k), SIZE), b: toPixel(n, SIZE) })),
    );
    return { discs, bars };
  }, [tiles]);

  // Removal timers for flashes and floaters. They run to completion even when more events arrive
  // (cancelling them on every update would leave old marks behind); only unmounting clears them.
  const removals = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      removals.current.delete(t);
      fn();
    }, ms);
    removals.current.add(t);
  };
  useEffect(() => {
    const pending = removals.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // A big, clear mark on the target when a contested Spell's bids are revealed: it took hold, or was Resisted.
  const [flashes, setFlashes] = useState<Array<{ id: number; x: number; y: number; success: boolean; icon: string; name: string }>>([]);
  const flashSeen = useRef(state.events.length);
  useEffect(() => {
    if (state.events.length < flashSeen.current) flashSeen.current = 0;
    const fresh = state.events.slice(flashSeen.current);
    flashSeen.current = state.events.length;
    const add = fresh.flatMap((e) => {
      if (e.cue?.kind !== 'contest' || !e.at) return [];
      const p = toPixel(e.at, SIZE);
      const def = ABILITIES[e.cue.abilityId];
      return [{ id: Date.now() + Math.random(), x: p.x, y: p.y, success: e.cue.success, icon: def?.icon ?? '', name: def?.name ?? '' }];
    });
    if (!add.length) return;
    setFlashes((f) => [...f, ...add]);
    const ids = new Set(add.map((a) => a.id));
    later(() => setFlashes((f) => f.filter((x) => !ids.has(x.id))), 1800);
  }, [state.events]);

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
    later(() => setFloaters((f) => f.filter((x) => !ids.has(x.id))), 1100);
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
          highlights.aim === k && 'is-aim',
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
            {highlights.aim === k && (
              <g className="aim-reticle">
                <circle r={SIZE * 0.4} />
                <path d={`M0 ${-SIZE * 0.62}V${-SIZE * 0.2}M0 ${SIZE * 0.62}V${SIZE * 0.2}M${-SIZE * 0.62} 0H${-SIZE * 0.2}M${SIZE * 0.62} 0H${SIZE * 0.2}`} />
              </g>
            )}
            {highlights.impact?.has(k) && highlights.impactIcon && (
              <text className="threat-icon impact-icon" textAnchor="middle" dominantBaseline="central">
                {highlights.impactIcon}
              </text>
            )}
            {TERRAIN_ICON[t.terrain] && (
              <text className="terrain-icon" textAnchor="middle" dominantBaseline="central">
                {TERRAIN_ICON[t.terrain]}
              </text>
            )}
          </g>
        );
      })}

      {rocks.discs.length > 0 && (
        <g className="rocks" pointerEvents="none">
          {[
            ['rock-edge', SIZE * 0.87],
            ['rock-face', SIZE * 0.87 - 3],
          ].map(([cls, r]) => (
            <g key={cls as string} className={cls as string}>
              {rocks.bars.map(({ a, b }, i) => (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={(r as number) * 2} strokeLinecap="round" />
              ))}
              {rocks.discs.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={r as number} />
              ))}
            </g>
          ))}
        </g>
      )}

      {state.pending.filter((a) => a.area.length > 0).map((a) => {
        // A homing Attack is aimed at the mage, so it is drawn wherever they stand now.
        const area = a.homing ? [key(state.mages[other(a.caster)].pos)] : a.area;
        return (
        <g key={a.id} className={`threat threat-${a.caster}`}>
          {area.map((k) => {
            const { x, y } = toPixel(fromKey(k), SIZE);
            return <polygon key={k} points={poly} transform={`translate(${x} ${y})`} />;
          })}
          {/* The Ability's icon on every threatened hex. */}
          {area.map((k) => {
            const { x, y } = toPixel(fromKey(k), SIZE);
            return (
              <text key={`i${k}`} className="threat-icon" x={x} y={y} textAnchor="middle" dominantBaseline="central">
                {ABILITIES[a.abilityId]?.icon}
              </text>
            );
          })}
        </g>
        );
      })}

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
              {u.icon}
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

      {state.bidding &&
        (() => {
          const a = toPixel(state.mages[state.bidding.caster].pos, SIZE);
          const t = toPixel(state.mages[state.bidding.target].pos, SIZE);
          return (
            <g className="bid-tether" pointerEvents="none">
              <line x1={a.x} y1={a.y} x2={t.x} y2={t.y} />
              <text x={t.x} y={t.y - SIZE * 1.5} textAnchor="middle">
                {ABILITIES[state.bidding.abilityId]?.icon} ?
              </text>
            </g>
          );
        })()}

      {flashes.map((f) => (
        <g key={f.id} className={`contest-flash ${f.success ? 'landed' : 'resisted'}`} transform={`translate(${f.x} ${f.y})`} pointerEvents="none">
          <circle className="flash-ring" r={SIZE * 0.9} />
          {f.success ? (
            <>
              <circle className="flash-ring second" r={SIZE * 0.9} />
              <text className="flash-icon" textAnchor="middle" dominantBaseline="central">
                {f.icon}
              </text>
            </>
          ) : (
            [0, 60, 120, 180, 240, 300].map((deg) => (
              <line key={deg} className="flash-shard" x1={0} y1={-SIZE * 0.5} x2={0} y2={-SIZE * 1.1} transform={`rotate(${deg})`} />
            ))
          )}
          <text className="flash-label" y={-SIZE * 1.35} textAnchor="middle">
            {f.success ? f.name.toUpperCase() : 'RESISTED'}
          </text>
        </g>
      ))}

      {floaters.map((f) => (
        <text key={f.id} x={f.x} y={f.y - SIZE * 0.4} className={`floater floater-${f.kind}`} textAnchor="middle">
          {f.text}
        </text>
      ))}
    </svg>
  );
}
