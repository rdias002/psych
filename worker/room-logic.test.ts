import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '../shared/protocol';
import { seededRng } from '../shared/rng';
import { type RoomState, MAX_PLAYERS, createRoomState, handleMessage, settle, tick, viewFor } from './room-logic';

const rng = seededRng(7);
const hello = (id: string, name = id): ClientMsg => ({ t: 'hello', playerId: id, token: `tok-${id}`, name });

function lobby(ids: string[]): RoomState {
  const room = createRoomState('ABCDEF');
  for (const id of ids) expect(handleMessage(room, null, hello(id), rng, new Set())).toMatchObject({ ok: true, joinedAs: id });
  return room;
}

/** Send as `from`, with everyone in the room connected. */
const as = (room: RoomState, from: string, msg: ClientMsg, now = 1000) =>
  handleMessage(room, from, msg, rng, new Set(room.players.map((p) => p.id)), now);

function started(ids = ['a', 'b', 'c'], settings: Partial<RoomState['settings']> = {}) {
  const room = lobby(ids);
  Object.assign(room.settings, { deckId: 'facts', rounds: 5 }, settings);
  expect(as(room, 'a', { t: 'start' })).toEqual({ ok: true });
  return room;
}

/** A fake that can't collide with any real answer. */
const fake = (id: string) => `fake answer from ${id} zq`;

describe('lobby', () => {
  it('makes the first player host', () => {
    expect(lobby(['a', 'b']).hostId).toBe('a');
  });

  it('rejects a reconnect with the wrong token', () => {
    const room = lobby(['a']);
    const r = handleMessage(room, null, { t: 'hello', playerId: 'a', token: 'nope', name: 'x' }, rng, new Set());
    expect(r).toMatchObject({ ok: false, fatal: true });
  });

  it('rejects a name already in the room, ignoring case', () => {
    const room = lobby(['a']);
    room.players[0].name = 'Grandma Jo';
    const r = handleMessage(room, null, { t: 'hello', playerId: 'b', token: 't', name: '  grandma   JO ' }, rng, new Set());
    expect(r).toMatchObject({ ok: false, fatal: true, nameTaken: true });
  });

  it('caps the room size', () => {
    const room = lobby(Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`));
    expect(handleMessage(room, null, hello('late'), rng, new Set())).toMatchObject({ ok: false, error: 'This room is full' });
  });

  it('only lets the host change settings, kick and start', () => {
    const room = lobby(['a', 'b', 'c']);
    expect(as(room, 'b', { t: 'settings', deckId: 'truth' }).ok).toBe(false);
    expect(as(room, 'a', { t: 'settings', deckId: 'truth', rounds: 10, pace: 'off' }).ok).toBe(true);
    expect(room.settings).toEqual({ deckId: 'truth', rounds: 10, pace: 'off' });
    expect(as(room, 'a', { t: 'settings', deckId: 'nope' }).ok).toBe(false);
    expect(as(room, 'a', { t: 'settings', rounds: 4 as never }).ok).toBe(false);
    expect(as(room, 'b', { t: 'start' }).ok).toBe(false);
    expect(as(room, 'b', { t: 'kick', playerId: 'c' }).ok).toBe(false);
    expect(as(room, 'a', { t: 'kick', playerId: 'c' })).toEqual({ ok: true, kicked: 'c' });
  });

  it('needs three players to start', () => {
    const room = lobby(['a', 'b']);
    expect(as(room, 'a', { t: 'start' })).toMatchObject({ ok: false });
  });

  it('passes the host on when the host leaves', () => {
    const room = lobby(['a', 'b']);
    expect(as(room, 'a', { t: 'leave' })).toEqual({ ok: true, left: 'a' });
    expect(room.hostId).toBe('b');
  });
});

describe('a round', () => {
  it('starts with the chosen deck and number of rounds', () => {
    const room = started();
    expect(room.status).toBe('playing');
    expect(room.game).toMatchObject({ deckId: 'facts', mode: 'bluff', phase: 'write', round: 0 });
    expect(room.game!.questions).toHaveLength(5);
    expect(room.deadline).toBe(1000 + 60_000);
  });

  it('moves to picking once everyone has answered, then to the reveal once everyone has picked', () => {
    const room = started();
    for (const id of ['a', 'b', 'c']) expect(as(room, id, { t: 'answer', text: fake(id) })).toEqual({ ok: true });
    expect(room.game!.phase).toBe('pick');
    expect(room.deadline).toBe(1000 + 30_000);
    for (const id of ['a', 'b', 'c']) {
      const truth = room.game!.choices.find((c) => c.truth)!;
      expect(as(room, id, { t: 'pick', choiceId: truth.id })).toEqual({ ok: true });
    }
    expect(room.game!.phase).toBe('reveal');
    expect(room.game!.scores).toEqual({ a: 2, b: 2, c: 2 });
  });

  it('turns away fakes that match the real answer', () => {
    const room = started();
    const answer = room.game!.questions[0].answer!;
    expect(as(room, 'a', { t: 'answer', text: answer.toUpperCase() })).toMatchObject({ ok: false });
  });

  it("doesn't wait for players who have disconnected", () => {
    const room = started();
    as(room, 'a', { t: 'answer', text: fake('a') });
    as(room, 'b', { t: 'answer', text: fake('b') });
    expect(room.game!.phase).toBe('write');
    // c drops out.
    expect(settle(room, new Set(['a', 'b']), rng)).toBe(true);
    expect(room.game!.phase).toBe('pick');
  });

  it('moves on when the timer runs out', () => {
    const room = started();
    const everyone = new Set(['a', 'b', 'c']);
    expect(tick(room, everyone, rng, 1000 + 59_000)).toBe(false);
    expect(tick(room, everyone, rng, 1000 + 60_000)).toBe(true);
    expect(room.game!.phase).toBe('pick');
  });

  it('has no timer when the pace is off; the host moves things on', () => {
    const room = started(undefined, { pace: 'off' });
    expect(room.deadline).toBeNull();
    expect(as(room, 'b', { t: 'next' }).ok).toBe(false);
    expect(as(room, 'a', { t: 'next' }).ok).toBe(true);
    expect(room.game!.phase).toBe('pick');
  });

  it('lets anyone move on if the host has disconnected', () => {
    const room = started(undefined, { pace: 'off' });
    expect(handleMessage(room, 'b', { t: 'next' }, rng, new Set(['b', 'c'])).ok).toBe(true);
  });

  it('lets late arrivals join mid-game', () => {
    const room = started();
    expect(handleMessage(room, null, hello('d'), rng, new Set())).toMatchObject({ ok: true });
    expect(room.game!.players).toContain('d');
    expect(room.game!.scores.d).toBe(0);
  });

  it('ends after the last round, then plays again without repeating questions', () => {
    const room = started();
    const firstIds = room.game!.questions.map((q) => q.id);
    for (let i = 0; i < 5 * 3; i++) as(room, 'a', { t: 'next' });
    expect(room.status).toBe('ended');
    expect(room.game!.phase).toBe('final');
    expect(room.deadline).toBeNull();
    expect(as(room, 'a', { t: 'playAgain' })).toEqual({ ok: true });
    expect(room.status).toBe('playing');
    expect(room.game!.questions.some((q) => firstIds.includes(q.id))).toBe(false);
    for (let i = 0; i < 5 * 3; i++) as(room, 'a', { t: 'next' });
    expect(as(room, 'a', { t: 'toLobby' })).toEqual({ ok: true });
    expect(room).toMatchObject({ status: 'lobby', game: null });
  });
});

describe('what each player sees', () => {
  it('never reveals the real answer, or who wrote what, before the reveal', () => {
    const room = started();
    const everyone = new Set(['a', 'b', 'c']);
    const answer = room.game!.questions[0].answer!;
    for (const id of ['a', 'b', 'c']) as(room, id, { t: 'answer', text: fake(id) });

    const view = viewFor(room, 'a', everyone);
    const json = JSON.stringify(view);
    expect(view.game!.choices.every((c) => c.authors === undefined && c.truth === undefined)).toBe(true);
    // Your own fake is left out of what you pick from.
    expect(view.game!.choices.map((c) => c.text)).not.toContain(fake('a'));
    expect(view.game!.choices).toHaveLength(3);
    expect(view.game!.myAnswer).toBe(fake('a'));
    // The truth is there to pick, but nothing marks it out, and no future questions leak.
    expect(view.game!.choices.map((c) => c.text)).toContain(answer);
    expect(json).not.toContain(room.game!.questions[1].prompt);
  });

  it('hides answers while players are still writing', () => {
    const room = started();
    as(room, 'b', { t: 'answer', text: fake('b') });
    const view = viewFor(room, 'a', new Set(['a', 'b', 'c']));
    expect(JSON.stringify(view)).not.toContain(fake('b'));
    expect(JSON.stringify(view)).not.toContain(room.game!.questions[0].answer!);
    expect(view.game!.answered).toEqual(['b']);
  });

  it('shows authors, pickers and the truth at the reveal', () => {
    const room = started();
    for (const id of ['a', 'b', 'c']) as(room, id, { t: 'answer', text: fake(id) });
    const bChoice = room.game!.choices.find((c) => c.text === fake('b'))!;
    as(room, 'a', { t: 'pick', choiceId: bChoice.id });
    as(room, 'a', { t: 'next' });
    const view = viewFor(room, 'c', new Set(['a', 'b', 'c']));
    const shown = view.game!.choices.find((c) => c.id === bChoice.id)!;
    expect(shown).toMatchObject({ authors: ['b'], pickers: ['a'] });
    expect(view.game!.choices.filter((c) => c.truth)).toHaveLength(1);
  });
});
