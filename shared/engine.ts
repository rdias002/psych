import type { DeckMode } from './decks';
import { type Rng, shuffle } from './rng';

// The Psych rules engine: pure functions over GameState, used by the server.

export const ANSWER_MAX_LENGTH = 80;
/** Points for picking the real answer (bluff decks). */
export const TRUTH_POINTS = 2;
/** Points per player who picks your answer: fooled by your fake, or voted for your Truth Comes Out answer. */
export const PICK_POINTS = 1;

export type Phase = 'write' | 'pick' | 'reveal' | 'final';

export interface Question {
  id: string;
  /** Truth Comes Out prompts contain PLAYER_TOKEN. */
  prompt: string;
  /** The real answer. Absent in Truth Comes Out. */
  answer?: string;
  /** Other spellings of the real answer that count as "too close". */
  alts?: string[];
}

export interface Choice {
  id: string;
  text: string;
  /** Players who wrote this answer. Identical answers are merged into one choice. */
  authors: string[];
  truth?: true;
}

export interface PlayerStats {
  /** Picks your fakes drew (bluff) or votes your answers got (truth). */
  fooled: number;
  /** Real answers found. */
  truths: number;
  /** Times you picked someone's fake. */
  fellFor: number;
}

export interface GameState {
  deckId: string;
  mode: DeckMode;
  /** Ids playing, in join order. */
  players: string[];
  /** One question per round, drawn up front. Never sent to clients. */
  questions: Question[];
  round: number;
  phase: Phase;
  /** Truth Comes Out: who this round's question is about. */
  subject: string | null;
  /** Offset into `players` for choosing subjects, so everyone gets a turn. */
  subjectOffset: number;
  answers: Record<string, string>;
  /** Built when writing ends, already shuffled. */
  choices: Choice[];
  picks: Record<string, string>;
  scores: Record<string, number>;
  /** Points won in the last scored round. */
  gained: Record<string, number>;
  stats: Record<string, PlayerStats>;
}

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

/** Lowercase, no accents, punctuation or leading article: what "the same answer" means. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(a|an|the) /, '');
}

export const cleanAnswer = (text: unknown) =>
  String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ANSWER_MAX_LENGTH);

const emptyStats = (): PlayerStats => ({ fooled: 0, truths: 0, fellFor: 0 });

export function newGame(deckId: string, mode: DeckMode, players: string[], questions: Question[], rng: Rng): GameState {
  const g: GameState = {
    deckId,
    mode,
    players: [...players],
    questions,
    round: 0,
    phase: 'write',
    subject: null,
    subjectOffset: Math.floor(rng() * players.length),
    answers: {},
    choices: [],
    picks: {},
    scores: Object.fromEntries(players.map((id) => [id, 0])),
    gained: {},
    stats: Object.fromEntries(players.map((id) => [id, emptyStats()])),
  };
  startRound(g);
  return g;
}

export const currentQuestion = (g: GameState): Question => g.questions[g.round];
export const isLastRound = (g: GameState) => g.round >= g.questions.length - 1;

function startRound(g: GameState) {
  g.phase = 'write';
  g.answers = {};
  g.choices = [];
  g.picks = {};
  g.subject = g.mode === 'truth' && g.players.length ? g.players[(g.subjectOffset + g.round) % g.players.length] : null;
}

/** Someone joined mid-game: they play from the current phase on. */
export function addPlayer(g: GameState, id: string) {
  if (g.players.includes(id)) return;
  g.players.push(id);
  g.scores[id] ??= 0;
  g.stats[id] ??= emptyStats();
}

export function removePlayer(g: GameState, id: string) {
  g.players = g.players.filter((p) => p !== id);
  delete g.answers[id];
  delete g.picks[id];
}

/** Would this fake give the real answer away? */
export function tooCloseToTruth(q: Question, text: string): boolean {
  if (!q.answer) return false;
  const n = normalize(text);
  return [q.answer, ...(q.alts ?? [])].some((a) => normalize(a) === n);
}

export function submitAnswer(g: GameState, id: string, raw: unknown): Result {
  if (g.phase !== 'write') return fail('Answers are closed for this round');
  if (!g.players.includes(id)) return fail("You're not in this game");
  const text = cleanAnswer(raw);
  if (!text) return fail('Write something first');
  if (tooCloseToTruth(currentQuestion(g), text)) return fail("That's too close to the real answer! Try another fib.");
  g.answers[id] = text;
  return { ok: true };
}

/** The choices `id` may pick from: everything except answers they wrote. */
export const choicesFor = (g: GameState, id: string) => g.choices.filter((c) => !c.authors.includes(id));

export function submitPick(g: GameState, id: string, choiceId: string): Result {
  if (g.phase !== 'pick') return fail('Picking is closed for this round');
  if (!g.players.includes(id)) return fail("You're not in this game");
  const choice = g.choices.find((c) => c.id === choiceId);
  if (!choice) return fail('No such answer');
  if (choice.authors.includes(id)) return fail("You can't pick your own answer");
  g.picks[id] = choiceId;
  return { ok: true };
}

/** Everyone in `active` (the players still connected) has done their part this phase. */
export function phaseComplete(g: GameState, active: Set<string>): boolean {
  const here = g.players.filter((id) => active.has(id));
  if (here.length === 0) return false;
  if (g.phase === 'write') return here.every((id) => id in g.answers);
  if (g.phase === 'pick') return here.every((id) => id in g.picks || choicesFor(g, id).length === 0);
  return false;
}

/** Move to the next phase: write → pick → reveal → next round's write, or final after the last round. */
export function advance(g: GameState, rng: Rng) {
  switch (g.phase) {
    case 'write':
      g.choices = buildChoices(g, rng);
      g.phase = 'pick';
      // Nothing anyone could pick (e.g. nobody wrote anything in Truth Comes Out).
      if (g.players.every((id) => choicesFor(g, id).length === 0)) score(g);
      return;
    case 'pick':
      score(g);
      return;
    case 'reveal':
      if (isLastRound(g)) {
        g.phase = 'final';
      } else {
        g.round++;
        startRound(g);
      }
      return;
    case 'final':
      return;
  }
}

/** Merge identical answers, add the truth (bluff decks), shuffle, and number them in shuffled order. */
function buildChoices(g: GameState, rng: Rng): Choice[] {
  const byText = new Map<string, Omit<Choice, 'id'>>();
  for (const id of g.players) {
    const text = g.answers[id];
    if (text === undefined) continue;
    const key = normalize(text);
    const existing = byText.get(key);
    if (existing) existing.authors.push(id);
    else byText.set(key, { text, authors: [id] });
  }
  const list: Omit<Choice, 'id'>[] = [...byText.values()];
  const q = currentQuestion(g);
  if (g.mode === 'bluff' && q.answer) list.push({ text: q.answer, authors: [], truth: true });
  return shuffle(list, rng).map((c, i) => ({ id: `c${i}`, ...c }));
}

function score(g: GameState) {
  g.gained = Object.fromEntries(g.players.map((id) => [id, 0]));
  for (const [picker, choiceId] of Object.entries(g.picks)) {
    const choice = g.choices.find((c) => c.id === choiceId);
    if (!choice || !g.players.includes(picker)) continue;
    if (choice.truth) {
      g.gained[picker] += TRUTH_POINTS;
      g.stats[picker].truths++;
      continue;
    }
    if (g.mode === 'bluff') g.stats[picker].fellFor++;
    for (const author of choice.authors) {
      if (!g.players.includes(author)) continue;
      g.gained[author] += PICK_POINTS;
      g.stats[author].fooled++;
    }
  }
  for (const [id, pts] of Object.entries(g.gained)) g.scores[id] = (g.scores[id] ?? 0) + pts;
  g.phase = 'reveal';
}

/** Players with the top score (several on a tie). */
export function leaders(g: GameState): string[] {
  const best = Math.max(...g.players.map((id) => g.scores[id] ?? 0));
  return g.players.filter((id) => (g.scores[id] ?? 0) === best);
}
