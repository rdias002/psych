import { type FormEvent, useState } from 'react';
import { ROOM_CODE_LENGTH, isRoomCode } from '../../shared/protocol';
import { navigate } from '../App';
import { Logo } from '../components/Logo';
import { getName, setName as saveName } from '../identity';

interface Props {
  /** Set when the user opened a /r/CODE link but hasn't picked a name yet. */
  pendingCode: string | null;
  /** Shown on arrival, e.g. when the room rejected the previous name. */
  initialError?: string | null;
  onName: (name: string) => void;
}

export function Home({ pendingCode, initialError = null, onName }: Props) {
  const [name, setName] = useState(getName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const trimmed = name.trim();

  const commitName = () => {
    saveName(trimmed);
    onName(trimmed);
  };

  const create = async () => {
    if (!trimmed) return setError('Enter your name first');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const body = (await res.json()) as { code?: string; error?: string };
      if (!body.code) throw new Error(body.error ?? 'Could not create a room');
      commitName();
      navigate(`/r/${body.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a room');
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return setError('Enter your name first');
    const target = pendingCode ?? code.trim().toUpperCase();
    if (!isRoomCode(target)) return setError(`Room codes are ${ROOM_CODE_LENGTH} letters/numbers`);
    commitName();
    if (!pendingCode) navigate(`/r/${target}`);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-8 px-4 py-10">
      <Logo />

      <form onSubmit={join} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-indigo-300">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            placeholder="e.g. Sam"
            className="field"
          />
        </label>

        {pendingCode ? (
          <button className="btn-primary" disabled={busy}>
            Join room {pendingCode}
          </button>
        ) : (
          <>
            <button type="button" onClick={create} className="btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create a room'}
            </button>
            <div className="flex items-center gap-3 text-sm text-indigo-400">
              <div className="h-px flex-1 bg-indigo-800" /> or join one <div className="h-px flex-1 bg-indigo-800" />
            </div>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={ROOM_CODE_LENGTH}
                placeholder="ROOM CODE"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="field min-w-0 flex-1 text-center font-mono tracking-[0.3em] uppercase"
              />
              <button className="btn-secondary">Join</button>
            </div>
          </>
        )}

        {error && <p className="text-center text-sm text-rose-400">{error}</p>}
      </form>

      {pendingCode && (
        <button onClick={() => navigate('/')} className="text-sm text-indigo-400 underline">
          Back to home
        </button>
      )}

      <details className="rounded-2xl bg-night-2/60 p-4 text-sm text-indigo-200">
        <summary className="cursor-pointer font-semibold text-indigo-100">How to play</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Everyone gets a strange-but-true question.</li>
          <li>Write a fake answer convincing enough to fool your friends.</li>
          <li>Spot the real answer among everyone's fakes.</li>
          <li>
            Score <b>2</b> for finding the truth and <b>1</b> for every friend you <b>Psych!</b>
          </li>
        </ol>
        <p className="mt-3">
          In <b>The Truth Comes Out</b>, the questions are about the players. There's no right answer, so just vote for your favourite.
        </p>
      </details>
    </main>
  );
}
