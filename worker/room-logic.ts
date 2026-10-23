import { deckInfo } from '../shared/decks';
import { type GameState, addPlayer, advance, newGame, phaseComplete, removePlayer, submitAnswer, submitPick } from '../shared/engine';
import {
  type ClientMsg,
  MIN_PLAYERS,
  PACES,
  PACE_SECONDS,
  ROUND_OPTIONS,
  type RoomSettings,
  type RoomStatus,
  type RoomView,
  publicGame,
} from '../shared/protocol';
import type { Rng } from '../shared/rng';
import { drawQuestions } from './decks';

export const MAX_PLAYERS = 12;

export interface RoomPlayer {
  id: string;
  name: string;
  /** Secret the browser keeps so it can reclaim this seat after reconnecting. */
  token: string;
}

export interface RoomState {
  code: string;
  hostId: string | null;
  status: RoomStatus;
  players: RoomPlayer[];
  game: GameState | null;
  settings: RoomSettings;
  /** Question ids already played this session, per deck, so a rematch brings new ones. */
  used: Record<string, string[]>;
  /** When the current phase times out, or null without a timer. */
  deadline: number | null;
  phaseStartedAt: number | null;
}

export type Outcome =
  | { ok: true; joinedAs?: string; kicked?: string; left?: string }
  | { ok: false; error: string; fatal?: boolean; nameTaken?: boolean };

const fail = (error: string, fatal = false): Outcome => ({ ok: false, error, fatal });

export function createRoomState(code: string): RoomState {
  return migrate({ code, hostId: null, status: 'lobby', players: [], game: null } as unknown as RoomState);
}

/** Fill in fields added after a room was first stored. */
export function migrate(room: RoomState): RoomState {
  room.settings ??= { deckId: 'mix', rounds: 7, pace: 'normal' };
  room.used ??= {};
  room.deadline ??= null;
  room.phaseStartedAt ??= null;
  return room;
}

const cleanName = (name: unknown) =>
  String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);

/** Another player (not `exceptId`) already uses this name, ignoring case and spacing. */
function nameTaken(room: RoomState, name: string, exceptId: string) {
  const key = name.toLowerCase();
  return room.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === key);
}

/** Restart the phase clock for whatever phase the game is now in. */
function startPhase(room: RoomState, now: number) {
  const g = room.game;
  const secs = PACE_SECONDS[room.settings.pace];
  if (room.status !== 'playing' || !g || g.phase === 'final') {
    room.deadline = room.phaseStartedAt = null;
    return;
  }
  room.phaseStartedAt = now;
  room.deadline = secs ? now + secs[g.phase] * 1000 : null;
}

function step(room: RoomState, rng: Rng, now: number) {
  const g = room.game!;
  advance(g, rng);
  if (g.phase === 'final') room.status = 'ended';
  startPhase(room, now);
}

function startGame(room: RoomState, rng: Rng, now: number) {
  const { deckId, rounds } = room.settings;
  const mode = deckInfo(deckId)?.mode ?? 'bluff';
  const questions = drawQuestions(deckId, rounds, room.used, rng);
  room.game = newGame(deckId, mode, room.players.map((p) => p.id), questions, rng);
  room.status = 'playing';
  startPhase(room, now);
}

function removeFromRoom(room: RoomState, id: string) {
  room.players = room.players.filter((p) => p.id !== id);
  if (room.game) removePlayer(room.game, id);
  if (room.hostId === id) room.hostId = room.players[0]?.id ?? null;
}

/**
 * Move on from writing or picking once everyone still connected is done. Returns true if the phase changed.
 * Call after anything that could finish a phase: an answer, a pick, someone leaving or disconnecting.
 */
export function settle(room: RoomState, connected: Set<string>, rng: Rng, now = Date.now()): boolean {
  let changed = false;
  while (room.status === 'playing' && room.game && phaseComplete(room.game, connected)) {
    step(room, rng, now);
    changed = true;
  }
  return changed;
}

/** Hand the host role to the first connected player if the host has gone. Returns true if it changed. */
export function reassignHost(room: RoomState, connected: Set<string>): boolean {
  if (room.hostId && connected.has(room.hostId)) return false;
  const next = room.players.find((p) => connected.has(p.id));
  if (!next) return false;
  room.hostId = next.id;
  return true;
}

/** Called when the phase clock may have run out. Returns true if the game moved on. */
export function tick(room: RoomState, connected: Set<string>, rng: Rng, now = Date.now()): boolean {
  if (room.status !== 'playing' || !room.game || room.deadline === null || now < room.deadline) return false;
  step(room, rng, now);
  settle(room, connected, rng, now);
  return true;
}

/**
 * Apply a client message. `senderId` is the player bound to the socket (null before hello);
 * `connected` is everyone with an open socket. Mutates `room`.
 */
export function handleMessage(
  room: RoomState,
  senderId: string | null,
  msg: ClientMsg,
  rng: Rng,
  connected: Set<string>,
  now = Date.now(),
): Outcome {
  if (msg.t === 'hello') return hello(room, msg);
  if (!senderId) return fail('Say hello first');
  const isHost = room.hostId === senderId;

  switch (msg.t) {
    case 'kick': {
      if (!isHost) return fail('Only the host can remove players');
      if (msg.playerId === senderId) return fail("You can't remove yourself");
      if (!room.players.some((p) => p.id === msg.playerId)) return fail('No such player');
      removeFromRoom(room, msg.playerId);
      settle(room, connected, rng, now);
      return { ok: true, kicked: msg.playerId };
    }
    case 'leave': {
      removeFromRoom(room, senderId);
      connected.delete(senderId);
      settle(room, connected, rng, now);
      return { ok: true, left: senderId };
    }
    case 'settings': {
      if (!isHost) return fail('Only the host can change settings');
      if (room.status !== 'lobby') return fail('Settings can only be changed in the lobby');
      if (msg.deckId !== undefined && !deckInfo(msg.deckId)) return fail('Unknown deck');
      if (msg.rounds !== undefined && !ROUND_OPTIONS.includes(msg.rounds)) return fail('Unknown number of rounds');
      if (msg.pace !== undefined && !PACES.includes(msg.pace)) return fail('Unknown timer setting');
      if (msg.deckId !== undefined) room.settings.deckId = msg.deckId;
      if (msg.rounds !== undefined) room.settings.rounds = msg.rounds;
      if (msg.pace !== undefined) room.settings.pace = msg.pace;
      return { ok: true };
    }
    case 'start': {
      if (!isHost) return fail('Only the host can start');
      if (room.status !== 'lobby') return fail('Game already started');
      if (room.players.length < MIN_PLAYERS) return fail(`You need at least ${MIN_PLAYERS} players`);
      startGame(room, rng, now);
      return { ok: true };
    }
    case 'answer': {
      if (room.status !== 'playing' || !room.game) return fail('No game in progress');
      const r = submitAnswer(room.game, senderId, msg.text);
      if (!r.ok) return fail(r.error);
      settle(room, connected, rng, now);
      return { ok: true };
    }
    case 'pick': {
      if (room.status !== 'playing' || !room.game) return fail('No game in progress');
      const r = submitPick(room.game, senderId, String(msg.choiceId));
      if (!r.ok) return fail(r.error);
      settle(room, connected, rng, now);
      return { ok: true };
    }
    case 'next': {
      // Anyone can move things on if the host has dropped out.
      const hostAway = !room.hostId || !connected.has(room.hostId);
      if (!isHost && !hostAway) return fail('Only the host can move on');
      if (room.status !== 'playing' || !room.game) return fail('No game in progress');
      // A double tap, or two players stopping the wait at once: only the first one counts.
      if (msg.phase !== room.game.phase || msg.round !== room.game.round) return { ok: true };
      step(room, rng, now);
      settle(room, connected, rng, now);
      return { ok: true };
    }
    case 'playAgain': {
      if (!isHost) return fail('Only the host can start a new game');
      if (room.status !== 'ended') return fail('The game is not over');
      if (room.players.length < MIN_PLAYERS) return fail(`You need at least ${MIN_PLAYERS} players`);
      startGame(room, rng, now);
      return { ok: true };
    }
    case 'toLobby': {
      if (!isHost) return fail('Only the host can do that');
      if (room.status !== 'ended') return fail('Finish the game first');
      room.game = null;
      room.status = 'lobby';
      startPhase(room, now);
      return { ok: true };
    }
    default:
      return fail('Unknown message');
  }
}

function hello(room: RoomState, msg: Extract<ClientMsg, { t: 'hello' }>): Outcome {
  const id = String(msg.playerId ?? '');
  const token = String(msg.token ?? '');
  if (!id || !token) return fail('Missing identity', true);

  const existing = room.players.find((p) => p.id === id);
  if (existing) {
    if (existing.token !== token) return fail('That seat belongs to someone else', true);
    // Keep the old name rather than blocking the seat if the new one is taken.
    const name = cleanName(msg.name);
    if (name && room.status === 'lobby' && !nameTaken(room, name, id)) existing.name = name;
    return { ok: true, joinedAs: id };
  }

  if (room.players.length >= MAX_PLAYERS) return fail('This room is full', true);
  const name = cleanName(msg.name);
  if (!name) return fail('Pick a name first', true);
  if (nameTaken(room, name, id)) {
    return { ok: false, error: `Someone in this room is already called ${name}. Pick another name.`, fatal: true, nameTaken: true };
  }

  room.players.push({ id, name, token });
  // Late arrivals jump straight into the game in progress.
  if (room.status === 'playing' && room.game) addPlayer(room.game, id);
  room.hostId ??= id;
  return { ok: true, joinedAs: id };
}

/** Build what one player is allowed to see. */
export function viewFor(room: RoomState, playerId: string, connected: Set<string>, now = Date.now()): RoomView {
  return {
    code: room.code,
    you: playerId,
    hostId: room.hostId,
    status: room.status,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: connected.has(p.id) })),
    game: room.game ? publicGame(room.game, playerId) : null,
    settings: room.settings,
    deadline: room.deadline,
    phaseStartedAt: room.phaseStartedAt,
    serverNow: now,
  };
}
