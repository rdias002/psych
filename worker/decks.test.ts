import { describe, expect, it } from 'vitest';
import { DECKS, PLAYER_TOKEN } from '../shared/decks';
import { ANSWER_MAX_LENGTH, normalize } from '../shared/engine';
import { seededRng } from '../shared/rng';
import { QUESTIONS, drawQuestions } from './decks';

describe('question bank', () => {
  it('has enough questions in every deck for the longest game', () => {
    for (const d of DECKS) expect(QUESTIONS[d.id].length, d.id).toBeGreaterThanOrEqual(40);
  });

  it('has unique ids and prompts', () => {
    const all = Object.entries(QUESTIONS).filter(([id]) => id !== 'mix').flatMap(([, qs]) => qs);
    expect(new Set(all.map((q) => q.id)).size).toBe(all.length);
    expect(new Set(all.map((q) => normalize(q.prompt))).size).toBe(all.length);
  });

  it('gives every bluff question a real answer short enough to pass as a fake', () => {
    for (const d of DECKS.filter((x) => x.mode === 'bluff')) {
      for (const q of QUESTIONS[d.id]) {
        expect(q.answer, q.id).toBeTruthy();
        expect(q.answer!.length, q.id).toBeLessThanOrEqual(ANSWER_MAX_LENGTH);
        expect(q.prompt, q.id).not.toContain(PLAYER_TOKEN);
      }
    }
  });

  it('puts a player in every Truth Comes Out question', () => {
    for (const q of QUESTIONS.truth) {
      expect(q.prompt, q.id).toContain(PLAYER_TOKEN);
      expect(q.answer, q.id).toBeUndefined();
    }
  });
});

describe('drawQuestions', () => {
  it("doesn't repeat questions until the deck runs out", () => {
    const rng = seededRng(1);
    const used: Record<string, string[]> = {};
    const size = QUESTIONS.laws.length;
    const seen = new Set<string>();
    for (let i = 0; i < Math.floor(size / 10); i++) {
      for (const q of drawQuestions('laws', 10, used, rng)) {
        expect(seen.has(q.id)).toBe(false);
        seen.add(q.id);
      }
    }
    // Not enough left for another full game: starts over.
    const next = drawQuestions('laws', 10, used, rng);
    expect(next).toHaveLength(10);
    expect(used.laws).toHaveLength(10);
  });
});
