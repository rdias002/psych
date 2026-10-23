import { DECKS } from '../../shared/decks';
import type { Question } from '../../shared/engine';
import { type Rng, shuffle } from '../../shared/rng';
import { ANIMALS } from './animals';
import { FACTS } from './facts';
import { LAWS } from './laws';
import { MOVIE_ROWS } from './movies';
import { TRUTH } from './truth';
import { WORD_ROWS } from './words';

// The question bank. Server only: the browser never sees a real answer before the reveal.

/** [prompt, real answer, ...other spellings of it]. Truth Comes Out rows have just the prompt. */
export type Row = [prompt: string, answer?: string, ...alts: string[]];

const toQuestions = (prefix: string, rows: Row[]): Question[] =>
  rows.map(([prompt, answer, ...alts], i) => ({ id: `${prefix}-${i}`, prompt, ...(answer && { answer }), ...(alts.length && { alts }) }));

const BLUFF: Record<string, Question[]> = {
  facts: toQuestions('facts', FACTS),
  words: toQuestions('words', WORD_ROWS),
  movies: toQuestions('movies', MOVIE_ROWS),
  laws: toQuestions('laws', LAWS),
  animals: toQuestions('animals', ANIMALS),
};

export const QUESTIONS: Record<string, Question[]> = {
  ...BLUFF,
  mix: Object.values(BLUFF).flat(),
  truth: toQuestions('truth', TRUTH),
};

// Every deck the browser can pick must have questions.
for (const d of DECKS) if (!QUESTIONS[d.id]?.length) throw new Error(`Deck ${d.id} has no questions`);

/**
 * Draw `n` questions from a deck, skipping ones already played this session (`used`, updated in place).
 * Once a deck runs out, it starts over.
 */
export function drawQuestions(deckId: string, n: number, used: Record<string, string[]>, rng: Rng): Question[] {
  const pool = QUESTIONS[deckId] ?? QUESTIONS.mix;
  const seen = new Set(used[deckId] ?? []);
  let fresh = pool.filter((q) => !seen.has(q.id));
  if (fresh.length < n) {
    used[deckId] = [];
    fresh = [...pool];
  }
  const drawn = shuffle(fresh, rng).slice(0, n);
  used[deckId] = [...(used[deckId] ?? []), ...drawn.map((q) => q.id)];
  return drawn;
}
