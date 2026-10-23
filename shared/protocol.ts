import type { DeckMode } from './decks';
import { type GameState, type Phase, type PlayerStats, choicesFor, currentQuestion } from './engine';

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export const ROUND_OPTIONS = [5, 7, 10] as const;
export type Rounds = (typeof ROUND_OPTIONS)[number];

export const PACES = ['normal', 'relaxed', 'off'] as const;
export type Pace = (typeof PACES)[number];

/** Seconds per phase at each pace; null = no timer, the host moves things on. */
export const PACE_SECONDS: Record<Pace, Record<'write' | 'pick' | 'reveal', number> | null> = {
  normal: { write: 60, pick: 30, reveal: 15 },
  relaxed: { write: 120, pick: 60, reveal: 25 },
  off: null,
};

export const MIN_PLAYERS = 3;

export interface RoomSettings {
  deckId: string;
  rounds: Rounds;
  pace: Pace;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string; token: string; name: string }
  | { t: 'kick'; playerId: string }
  | { t: 'leave' }
  | { t: 'settings'; deckId?: string; rounds?: Rounds; pace?: Pace }
  | { t: 'start' }
  | { t: 'answer'; text: string }
  | { t: 'pick'; choiceId: string }
  /** Host: stop waiting and move to the next phase. */
  | { t: 'next' }
  | { t: 'playAgain' }
  | { t: 'toLobby' };

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
}

/** An answer as one player may see it. Authors and pickers only appear once the round is revealed. */
export interface ChoiceView {
  id: string;
  text: string;
  authors?: string[];
  pickers?: string[];
  truth?: boolean;
}

/** Everything about the game that this player may see. */
export interface PublicGame {
  deckId: string;
  mode: DeckMode;
  players: string[];
  round: number;
  rounds: number;
  phase: Phase;
  prompt: string;
  subject: string | null;
  /** Who has answered / picked this round (not what). */
  answered: string[];
  picked: string[];
  myAnswer: string | null;
  myPick: string | null;
  /** Pick phase: what you can pick from, without your own answer. Reveal and final: every answer, with authors. */
  choices: ChoiceView[];
  scores: Record<string, number>;
  gained: Record<string, number>;
  stats: Record<string, PlayerStats>;
}

export interface RoomView {
  code: string;
  you: string;
  hostId: string | null;
  status: RoomStatus;
  players: PlayerView[];
  game: PublicGame | null;
  settings: RoomSettings;
  /** When the current phase times out (server clock, ms), or null without a timer. */
  deadline: number | null;
  phaseStartedAt: number | null;
  /** Server clock when this view was sent, to correct for client clock drift. */
  serverNow: number;
}

export type ServerMsg = { t: 'state'; view: RoomView } | { t: 'error'; msg: string } | { t: 'kicked' } | { t: 'notFound' };

export function publicGame(g: GameState, you: string): PublicGame {
  const revealed = g.phase === 'reveal' || g.phase === 'final';
  const pickersOf = (choiceId: string) => Object.keys(g.picks).filter((id) => g.picks[id] === choiceId);
  const choices: ChoiceView[] = revealed
    ? g.choices.map((c) => ({ id: c.id, text: c.text, authors: c.authors, pickers: pickersOf(c.id), ...(c.truth && { truth: true }) }))
    : g.phase === 'pick'
      ? choicesFor(g, you).map((c) => ({ id: c.id, text: c.text }))
      : [];
  return {
    deckId: g.deckId,
    mode: g.mode,
    players: g.players,
    round: g.round,
    rounds: g.questions.length,
    phase: g.phase,
    prompt: currentQuestion(g).prompt,
    subject: g.subject,
    answered: Object.keys(g.answers),
    picked: Object.keys(g.picks),
    myAnswer: g.answers[you] ?? null,
    myPick: g.picks[you] ?? null,
    choices,
    scores: g.scores,
    gained: g.gained,
    stats: g.stats,
  };
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const isRoomCode = (s: string) => new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(s);
