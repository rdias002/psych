import { DurableObject } from 'cloudflare:workers';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import type { Rng } from '../shared/rng';
import { type RoomState, createRoomState, handleMessage, migrate, settle, tick, viewFor } from './room-logic';

const IDLE_TTL_MS = 24 * 60 * 60 * 1000;

interface Attachment {
  playerId: string | null;
}

/** Crypto-backed RNG for shuffling and drawing questions. */
const cryptoRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** One instance per room. Holds the authoritative game; real answers and authorship never leave it before the reveal. */
export class GameRoom extends DurableObject<Env> {
  private room: RoomState | null | undefined;
  private idleExpiry = 0;

  private async load(): Promise<RoomState | null> {
    if (this.room === undefined) {
      const stored = await this.ctx.storage.get<RoomState>('room');
      this.room = stored ? migrate(stored) : null;
      this.idleExpiry = (await this.ctx.storage.get<number>('idleExpiry')) ?? Date.now() + IDLE_TTL_MS;
    }
    return this.room;
  }

  /** Persist the room. `activity` pushes back the idle cleanup (player actions, not timer moves). */
  private async save(activity = true) {
    if (activity) this.idleExpiry = Date.now() + IDLE_TTL_MS;
    await this.ctx.storage.put({ room: this.room, idleExpiry: this.idleExpiry });
    await this.scheduleAlarm();
  }

  /** One alarm serves the phase timer and idle cleanup: arm it for whichever comes first. */
  private async scheduleAlarm() {
    const room = this.connectedIds().size > 0 ? this.room : null;
    await this.ctx.storage.setAlarm(Math.min(room?.deadline ?? Infinity, this.idleExpiry));
  }

  /** Called once by the Worker when creating a room. Returns false if the code is taken. */
  async init(code: string): Promise<boolean> {
    if (await this.load()) return false;
    this.room = createRoomState(code);
    await this.save();
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const room = await this.load();
    if (!room) {
      send(ws, { t: 'notFound' });
      ws.close(4004, 'Room not found');
      return;
    }

    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return send(ws, { t: 'error', msg: 'Bad message' });
    }

    const att = ws.deserializeAttachment() as Attachment;
    const result = handleMessage(room, att.playerId, msg, cryptoRng, this.connectedIds());
    if (!result.ok) {
      send(ws, { t: 'error', msg: result.error });
      if (result.fatal) ws.close(result.nameTaken ? 4009 : 4000, 'Rejected');
      return;
    }

    if (result.joinedAs) ws.serializeAttachment({ playerId: result.joinedAs } satisfies Attachment);
    if (result.left) for (const s of this.socketsFor(result.left)) s.serializeAttachment({ playerId: null } satisfies Attachment);
    if (result.kicked) {
      for (const s of this.socketsFor(result.kicked)) {
        send(s, { t: 'kicked' });
        s.serializeAttachment({ playerId: null } satisfies Attachment);
        s.close(4001, 'Removed by host');
      }
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws: WebSocket) {
    ws.serializeAttachment({ playerId: null } satisfies Attachment);
    const room = await this.load();
    if (!room) return;
    // The last straggler in a phase may have just left.
    if (settle(room, this.connectedIds(), cryptoRng)) await this.save(false);
    this.broadcast(ws);
    await this.scheduleAlarm();
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const room = await this.load();
    if (!room) return;
    const now = Date.now();
    const connected = this.connectedIds();

    // The phase clock ran out: move on, but only while someone is around to see it.
    if (connected.size > 0 && tick(room, connected, cryptoRng, now)) {
      await this.save(false);
      this.broadcast();
      return;
    }

    if (now >= this.idleExpiry) {
      // Idle for a day: forget the room.
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.scheduleAlarm();
  }

  private boundSockets(except?: WebSocket) {
    return this.ctx
      .getWebSockets()
      .filter((s) => s !== except)
      .map((s) => ({ s, id: (s.deserializeAttachment() as Attachment)?.playerId }))
      .filter((x): x is { s: WebSocket; id: string } => !!x.id);
  }

  private connectedIds(except?: WebSocket) {
    return new Set(this.boundSockets(except).map((x) => x.id));
  }

  private socketsFor(playerId: string) {
    return this.boundSockets()
      .filter((x) => x.id === playerId)
      .map((x) => x.s);
  }

  /** Send every connected player their own view. */
  private broadcast(except?: WebSocket) {
    const room = this.room;
    if (!room) return;
    const bound = this.boundSockets(except);
    const connected = new Set(bound.map((x) => x.id));
    const now = Date.now();
    for (const { s, id } of bound) send(s, { t: 'state', view: viewFor(room, id, connected, now) });
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Socket already closing.
  }
}
