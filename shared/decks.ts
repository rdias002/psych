// Deck metadata, safe to ship to the browser. The questions (and their real answers) live in worker/decks.

/** `bluff`: write a fake answer to a real question, then spot the truth. `truth`: questions about a player; vote for your favourite answer. */
export type DeckMode = 'bluff' | 'truth';

export interface DeckInfo {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  mode: DeckMode;
}

export const DECKS: DeckInfo[] = [
  { id: 'mix', name: 'Mix It Up', emoji: '🎲', blurb: 'A bit of every trivia deck', mode: 'bluff' },
  { id: 'facts', name: 'Is That a Fact?', emoji: '🤓', blurb: 'Fill in the blank of a strange-but-true fact', mode: 'bluff' },
  { id: 'words', name: 'Word Up!', emoji: '📖', blurb: 'Real words. Invent the definition.', mode: 'bluff' },
  { id: 'movies', name: 'Movie Bluff', emoji: '🎬', blurb: 'Real films. Invent the plot.', mode: 'bluff' },
  { id: 'laws', name: "It's the Law", emoji: '⚖️', blurb: 'Odd laws from around the world', mode: 'bluff' },
  { id: 'animals', name: 'Animal Kingdom', emoji: '🦥', blurb: 'Wild facts about wildlife', mode: 'bluff' },
  { id: 'truth', name: 'The Truth Comes Out', emoji: '🙊', blurb: 'Questions about each other. Vote for the best answer.', mode: 'truth' },
];

export const DEFAULT_DECK = 'mix';
export const deckInfo = (id: string): DeckInfo | undefined => DECKS.find((d) => d.id === id);

/** Placeholder in Truth Comes Out prompts, replaced by the round's subject. */
export const PLAYER_TOKEN = '{player}';
