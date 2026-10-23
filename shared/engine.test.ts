import { describe, expect, it } from 'vitest';
import {
  type GameState,
  type Question,
  PICK_POINTS,
  TRUTH_POINTS,
  addPlayer,
  advance,
  choicesFor,
  newGame,
  normalize,
  phaseComplete,
  removePlayer,
  submitAnswer,
  submitPick,
} from './engine';
import { seededRng } from './rng';

const rng = seededRng(42);
const BLUFF_QS: Question[] = [
  { id: 'q1', prompt: 'The national animal of Scotland is the _____.', answer: 'unicorn' },
  { id: 'q2', prompt: 'A group of crows is a _____.', answer: 'murder' },
];
const TRUTH_QS: Question[] = [{ id: 't1', prompt: "What's {player}'s hidden talent?" }, { id: 't2', prompt: '{player}?' }, { id: 't3', prompt: '{player}!' }];
const all = (ids: string[]) => new Set(ids);

function bluff(players = ['a', 'b', 'c']): GameState {
  return newGame('facts', 'bluff', players, BLUFF_QS, rng);
}

const choiceByText = (g: GameState, text: string) => g.choices.find((c) => c.text === text)!;
const truth = (g: GameState) => g.choices.find((c) => c.truth)!;

describe('normalize', () => {
  it('ignores case, punctuation, accents and a leading article', () => {
    expect(normalize('  The Unicorn! ')).toBe('unicorn');
    expect(normalize('Café au lait')).toBe('cafe au lait');
    expect(normalize('An  aglet')).toBe('aglet');
  });

  it('keeps answers in other scripts, or only emoji, apart', () => {
    expect(normalize('日本!')).toBe('日本');
    expect(normalize('Привет')).toBe('привет');
    expect(normalize('🍕')).not.toBe(normalize('🌮'));
    expect(normalize('🍕')).not.toBe(normalize('日本'));
  });
});

describe('writing answers', () => {
  it('rejects an answer that matches the truth', () => {
    const g = bluff();
    expect(submitAnswer(g, 'a', 'A UNICORN.')).toMatchObject({ ok: false });
    expect(submitAnswer(g, 'a', 'a lion')).toEqual({ ok: true });
  });

  it('trims, caps length and rejects empty answers', () => {
    const g = bluff();
    expect(submitAnswer(g, 'a', '   ')).toMatchObject({ ok: false });
    submitAnswer(g, 'a', `  ${'x'.repeat(200)}  `);
    expect(g.answers.a).toHaveLength(80);
  });

  it('lets a player change their answer and refuses outsiders', () => {
    const g = bluff();
    submitAnswer(g, 'a', 'lion');
    submitAnswer(g, 'a', 'stag');
    expect(g.answers.a).toBe('stag');
    expect(submitAnswer(g, 'zed', 'hi')).toMatchObject({ ok: false });
  });

  it('is complete once every connected player has answered', () => {
    const g = bluff();
    submitAnswer(g, 'a', 'lion');
    submitAnswer(g, 'b', 'stag');
    expect(phaseComplete(g, all(['a', 'b', 'c']))).toBe(false);
    // c has dropped out: no need to wait for them.
    expect(phaseComplete(g, all(['a', 'b']))).toBe(true);
    expect(phaseComplete(g, new Set())).toBe(false);
  });
});

describe('picking', () => {
  function toPick() {
    const g = bluff(['a', 'b', 'c', 'd']);
    submitAnswer(g, 'a', 'lion');
    submitAnswer(g, 'b', 'Lion!'); // Same as a's: merged.
    submitAnswer(g, 'c', 'stag');
    advance(g, rng);
    return g;
  }

  it('merges identical fakes and adds the truth', () => {
    const g = toPick();
    expect(g.phase).toBe('pick');
    expect(g.choices).toHaveLength(3);
    expect(choiceByText(g, 'lion').authors).toEqual(['a', 'b']);
    expect(truth(g).text).toBe('unicorn');
    expect(g.choices.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });

  it('hides your own answer and refuses picking it', () => {
    const g = toPick();
    expect(choicesFor(g, 'a').map((c) => c.text).sort()).toEqual(['stag', 'unicorn']);
    expect(choicesFor(g, 'd')).toHaveLength(3);
    expect(submitPick(g, 'b', choiceByText(g, 'lion').id)).toMatchObject({ ok: false });
    expect(submitPick(g, 'b', 'nope')).toMatchObject({ ok: false });
  });

  it('scores the truth and every player psyched, crediting each co-author', () => {
    const g = toPick();
    submitPick(g, 'a', truth(g).id);
    submitPick(g, 'b', choiceByText(g, 'stag').id);
    submitPick(g, 'c', choiceByText(g, 'lion').id);
    submitPick(g, 'd', choiceByText(g, 'lion').id);
    expect(phaseComplete(g, all(['a', 'b', 'c', 'd']))).toBe(true);
    advance(g, rng);
    expect(g.phase).toBe('reveal');
    expect(g.gained).toEqual({ a: TRUTH_POINTS + 2 * PICK_POINTS, b: 2 * PICK_POINTS, c: PICK_POINTS, d: 0 });
    expect(g.scores).toEqual(g.gained);
    expect(g.stats.a).toEqual({ fooled: 2, truths: 1, fellFor: 0 });
    expect(g.stats.d.fellFor).toBe(1);
  });

  it('scores no one who missed the deadline', () => {
    const g = toPick();
    submitPick(g, 'a', truth(g).id);
    advance(g, rng); // Deadline: b, c and d never picked.
    expect(g.gained).toEqual({ a: TRUTH_POINTS, b: 0, c: 0, d: 0 });
  });
});

describe('rounds', () => {
  it('runs every round and then finishes', () => {
    const g = bluff();
    for (let round = 0; round < BLUFF_QS.length; round++) {
      expect(g.round).toBe(round);
      expect(g.phase).toBe('write');
      advance(g, rng); // write → pick
      advance(g, rng); // pick → reveal
      expect(g.phase).toBe('reveal');
      advance(g, rng);
    }
    expect(g.phase).toBe('final');
    expect(g.round).toBe(BLUFF_QS.length - 1);
  });

  it('clears answers and picks between rounds', () => {
    const g = bluff();
    submitAnswer(g, 'a', 'lion');
    advance(g, rng);
    submitPick(g, 'b', truth(g).id);
    advance(g, rng);
    advance(g, rng);
    expect(g).toMatchObject({ round: 1, phase: 'write', answers: {}, picks: {}, choices: [] });
    expect(g.scores.b).toBe(TRUTH_POINTS);
  });

  it('lets people join and leave mid-game', () => {
    const g = bluff(['a', 'b']);
    addPlayer(g, 'c');
    expect(g.scores.c).toBe(0);
    submitAnswer(g, 'c', 'lion');
    removePlayer(g, 'c');
    expect(g.players).toEqual(['a', 'b']);
    expect(g.answers).toEqual({});
  });
});

describe('The Truth Comes Out', () => {
  function truthGame() {
    return newGame('truth', 'truth', ['a', 'b', 'c'], TRUTH_QS, rng);
  }

  it('gives everyone a turn as the subject', () => {
    const g = truthGame();
    const subjects: string[] = [];
    for (let i = 0; i < 3; i++) {
      subjects.push(g.subject!);
      advance(g, rng);
      advance(g, rng);
      advance(g, rng);
    }
    expect(subjects.sort()).toEqual(['a', 'b', 'c']);
  });

  it('still gives everyone a turn when someone leaves mid-game', () => {
    const g = newGame('truth', 'truth', ['a', 'b', 'c', 'd'], [...TRUTH_QS, ...TRUTH_QS], rng);
    const round = () => {
      const r = g.round;
      while (g.round === r) advance(g, rng);
    };
    const seen = [g.subject!];
    round();
    seen.push(g.subject!);
    // A player who has already had their turn leaves; the two still waiting must come next.
    removePlayer(g, seen[1]);
    round();
    seen.push(g.subject!);
    round();
    seen.push(g.subject!);
    expect(seen.slice(2).sort()).toEqual(g.players.filter((id) => !seen.slice(0, 2).includes(id)).sort());
  });

  it('has no real answer and scores a point per vote', () => {
    const g = truthGame();
    expect(submitAnswer(g, 'a', 'juggling')).toEqual({ ok: true });
    submitAnswer(g, 'b', 'yodelling');
    submitAnswer(g, 'c', 'sleeping');
    advance(g, rng);
    expect(g.choices.some((c) => c.truth)).toBe(false);
    submitPick(g, 'a', choiceByText(g, 'sleeping').id);
    submitPick(g, 'b', choiceByText(g, 'sleeping').id);
    submitPick(g, 'c', choiceByText(g, 'juggling').id);
    advance(g, rng);
    expect(g.gained).toEqual({ a: PICK_POINTS, b: 0, c: 2 * PICK_POINTS });
    expect(g.stats.c.fooled).toBe(2);
    expect(g.stats.a.fellFor).toBe(0);
  });

  it('skips straight to the reveal when nobody wrote anything', () => {
    const g = truthGame();
    advance(g, rng);
    expect(g.phase).toBe('reveal');
  });
});
