import type { Hex } from '../game/hex';
import type { CrystalSize, GameEvent, PlayerId } from '../game/types';

// ---------------------------------------------------------------------------
// Turning the engine's event stream into a timed list of sounds. Pure: no audio,
// no clocks. The same plan plays for live games, AI turns, spectating and replays.
// ---------------------------------------------------------------------------

/** One sound the synth can make. */
export type Sound =
  | { id: 'cast' | 'launch' | 'resolve'; abilityId: string }
  | { id: 'damage'; amount: number }
  | { id: 'crystalAbsorb'; size: CrystalSize }
  | { id: 'absorbed' | 'step' | 'crystalReady' | 'actionStart' | 'reactionStart' | 'bidStart' | 'fizzle' }
  | { id: 'win' | 'lose' | 'fanfare' }
  | { id: 'click' | 'confirm' | 'select' };

export interface ScheduledSound {
  sound: Sound;
  /** Seconds from now. */
  delay: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number;
}

/**
 * Who is listening. A player id when one person plays that side (the other is an AI or remote);
 * 'both' for hotseat; null for a spectator or replay viewer, who has no side.
 */
export type Viewer = PlayerId | 'both' | null;

/** Attacks landing in one Resolution are spaced out, one after another in launch order. */
export const RESOLVE_GAP_S = 0.35;
/** A damage sound follows its Attack's sound by this long. */
export const DAMAGE_LAG_S = 0.09;
/** A long Resolution is squeezed to fit in this many seconds. */
export const MAX_SEQUENCE_S = 2;
/** Gap between footsteps, and the most that are played for one Move. */
export const STEP_GAP_S = 0.11;
export const MAX_STEPS = 6;
/** More events than this from one update means the viewer jumped around a replay: stay silent. */
const JUMP_EVENTS = 40;

/** Stereo position of a hex: lightly panned by board column, never more than 0.5 either way. */
export function panFor(at: Hex | undefined, radius: number): number {
  if (!at || radius <= 0) return 0;
  const x = at.q + at.r / 2; // -radius .. radius across the board
  return Math.max(-0.5, Math.min(0.5, (0.5 * x) / radius));
}

/**
 * The events added since `seen`, or none when the log was rewound or jumped across.
 * Scrubbing a replay must not blast out every sound it skipped.
 */
export function newEvents(events: GameEvent[], seen: number): { fresh: GameEvent[]; seen: number } {
  if (events.length < seen) return { fresh: [], seen: events.length }; // rewound
  const fresh = events.slice(seen);
  const turns = new Set(fresh.map((e) => e.turn));
  const jumped = fresh.length > JUMP_EVENTS || turns.size > 2;
  return { fresh: jumped ? [] : fresh, seen: events.length };
}

/** Which sound ends the match, for this listener. */
function resultSound(winner: PlayerId | 'draw', viewer: Viewer): Sound {
  if (viewer === 'p1' || viewer === 'p2') return { id: winner === 'draw' ? 'fanfare' : winner === viewer ? 'win' : 'lose' };
  return { id: 'fanfare' };
}

/** Whether `player`'s phase-start cues are for this listener. A spectator hears neither. */
const hearsPhaseOf = (player: PlayerId, viewer: Viewer) => viewer === 'both' || viewer === player;

/** Plans the sounds for a batch of new events (normally everything one action produced). */
export function planSounds(events: GameEvent[], viewer: Viewer, radius: number): ScheduledSound[] {
  const out: ScheduledSound[] = [];
  // `cursor` is where the next Attack lands; later sounds wait until the whole sequence is done.
  let cursor = 0;
  let lastResolve = 0;
  let damageIndex = 0;
  let sequenced = false;
  const add = (sound: Sound, delay: number, at?: Hex) => out.push({ sound, delay, pan: panFor(at, radius) });

  for (const e of events) {
    const c = e.cue;
    if (!c) continue;
    switch (c.kind) {
      case 'cast':
      case 'launch':
        add({ id: c.kind, abilityId: c.abilityId }, cursor, e.at);
        break;
      case 'resolve':
        lastResolve = cursor;
        damageIndex = 0;
        sequenced = true;
        add({ id: 'resolve', abilityId: c.abilityId }, cursor, e.at);
        cursor += RESOLVE_GAP_S;
        break;
      case 'damage':
      case 'absorbed': {
        const delay = lastResolve + DAMAGE_LAG_S + 0.05 * damageIndex++;
        add(c.kind === 'damage' ? { id: 'damage', amount: c.amount } : { id: 'absorbed' }, delay, e.at);
        break;
      }
      case 'move':
        for (let i = 0; i < Math.min(c.hexes, MAX_STEPS); i++) add({ id: 'step' }, cursor + i * STEP_GAP_S, e.at);
        break;
      case 'crystalAbsorb':
        add({ id: 'crystalAbsorb', size: c.size }, cursor, e.at);
        break;
      case 'crystalReady':
        add({ id: 'crystalReady' }, cursor, e.at);
        break;
      case 'actionStart':
        if (hearsPhaseOf(c.player, viewer)) add({ id: 'actionStart' }, cursor);
        break;
      case 'reactionStart':
        if (hearsPhaseOf(c.player, viewer)) add({ id: 'reactionStart' }, cursor);
        break;
      case 'result':
        add(resultSound(c.winner, viewer), sequenced ? cursor + 0.25 : cursor);
        break;
      case 'bidStart':
        add({ id: 'bidStart' }, cursor, e.at);
        break;
      case 'contest':
        // The same for everyone, and only once the bids are revealed: nothing before then may hint at them.
        add(c.success ? { id: 'cast', abilityId: c.abilityId } : { id: 'fizzle' }, cursor, e.at);
        break;
    }
  }

  // Squeeze a long Resolution so a big turn never drags on. Results keep their place at the end.
  const sequenceEnd = Math.max(0, ...out.filter((s) => s.sound.id === 'resolve' || s.sound.id === 'damage' || s.sound.id === 'absorbed').map((s) => s.delay));
  if (sequenceEnd > MAX_SEQUENCE_S) {
    const k = MAX_SEQUENCE_S / sequenceEnd;
    for (const s of out) s.delay *= k;
  }
  return out;
}
