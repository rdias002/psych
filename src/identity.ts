// The browser's identity: a stable id plus a secret token that lets it reclaim its seat.
const KEY = 'psych.identity';
const NAME_KEY = 'psych.name';

export interface Identity {
  playerId: string;
  token: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: identity lasts for this tab only.
  }
}

let cached: Identity | null = null;

export function getIdentity(): Identity {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(safeGet(KEY) ?? 'null');
    if (parsed?.playerId && parsed?.token) return (cached = parsed);
  } catch {
    // Fall through and make a new one.
  }
  cached = { playerId: crypto.randomUUID(), token: crypto.randomUUID() };
  safeSet(KEY, JSON.stringify(cached));
  return cached;
}

export const getName = () => safeGet(NAME_KEY) ?? '';
export const setName = (name: string) => safeSet(NAME_KEY, name.trim());
