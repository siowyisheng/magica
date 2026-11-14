import type { Action, MatchRecord } from '../game/types';

// ---------------------------------------------------------------------------
// Spectating protocol. Because the engine is deterministic, the host only ever
// broadcasts the match config once (`sync`) and then each action. Spectators
// rebuild the state locally with `replay()`.
//
// The transport is pluggable. BroadcastChannelTransport works across tabs /
// windows on the same machine (open a second window → Spectate). For online
// spectating, implement SpectateTransport over a WebSocket relay.
// ---------------------------------------------------------------------------

export interface LiveMatchInfo {
  matchId: string;
  title: string;
  turn: number;
}

export type SpectateMessage =
  | { type: 'discover' }
  | { type: 'announce'; info: LiveMatchInfo }
  | { type: 'request-sync'; matchId: string }
  | { type: 'sync'; record: MatchRecord }
  | { type: 'action'; matchId: string; index: number; action: Action }
  | { type: 'ended'; matchId: string };

export interface SpectateTransport {
  send(msg: SpectateMessage): void;
  subscribe(handler: (msg: SpectateMessage) => void): () => void;
  close(): void;
}

export class BroadcastChannelTransport implements SpectateTransport {
  private channel: BroadcastChannel | null;

  constructor(name = 'magica-spectate') {
    this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
  }

  send(msg: SpectateMessage) {
    this.channel?.postMessage(msg);
  }

  subscribe(handler: (msg: SpectateMessage) => void) {
    const listener = (e: MessageEvent<SpectateMessage>) => handler(e.data);
    this.channel?.addEventListener('message', listener);
    return () => this.channel?.removeEventListener('message', listener);
  }

  close() {
    this.channel?.close();
    this.channel = null;
  }
}

/** Host side: answers discovery and sync requests for one live match. */
export class SpectateHost {
  private unsubscribe: () => void;

  constructor(
    private transport: SpectateTransport,
    private getRecord: () => MatchRecord,
    private title: string,
  ) {
    this.unsubscribe = transport.subscribe((msg) => {
      const rec = this.getRecord();
      if (msg.type === 'discover') this.announce();
      if (msg.type === 'request-sync' && msg.matchId === rec.id) transport.send({ type: 'sync', record: rec });
    });
    this.announce();
  }

  announce() {
    const rec = this.getRecord();
    this.transport.send({ type: 'announce', info: { matchId: rec.id, title: this.title, turn: rec.actions.length } });
  }

  publish(index: number, action: Action) {
    this.transport.send({ type: 'action', matchId: this.getRecord().id, index, action });
  }

  end() {
    this.transport.send({ type: 'ended', matchId: this.getRecord().id });
    this.unsubscribe();
  }
}
