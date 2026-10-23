import { useRef } from 'react';
import { DECKS } from '../../shared/decks';
import { MIN_PLAYERS, PACES, type Pace, ROUND_OPTIONS } from '../../shared/protocol';
import { Avatar } from '../components/Avatar';
import { CopyIcon } from '../components/Icons';
import { Logo } from '../components/Logo';
import { useCopy } from '../useCopy';
import type { ScreenProps } from './Room';

const PACE_LABEL: Record<Pace, string> = { normal: 'Normal', relaxed: 'Relaxed', off: 'No timer' };

export function Lobby({ view, send, leave, colorOf }: ScreenProps) {
  const isHost = view.hostId === view.you;
  const [linkCopied, copyLink] = useCopy();
  const [codeCopied, copyCode] = useCopy();
  const codeRef = useRef<HTMLParagraphElement>(null);
  const link = `${location.origin}/r/${view.code}`;
  const short = MIN_PLAYERS - view.players.length;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Play Psych! with me', url: link });
      else await copyLink(link);
    } catch {
      // Share sheet dismissed.
    }
  };

  const onCopyCode = async () => {
    if (await copyCode(view.code)) return;
    // Clipboard blocked: select the code so it can be copied by hand.
    const el = codeRef.current;
    if (el) getSelection()?.selectAllChildren(el);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <button onClick={leave} aria-label="Leave room" className="w-16 text-left text-indigo-300">
          ← Leave
        </button>
        <Logo small />
        <span className="w-16" />
      </header>

      <section className="rounded-2xl bg-night-2 p-4 text-center">
        <p className="text-sm text-indigo-300">Room code</p>
        <div className="my-1 flex items-center justify-center gap-2">
          <p ref={codeRef} className="font-mono text-4xl font-black tracking-[0.25em] select-all">
            {view.code}
          </p>
          <button
            onClick={onCopyCode}
            aria-label="Copy room code"
            className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-xl bg-night-3 px-2.5 text-sm font-semibold active:bg-indigo-700"
          >
            {codeCopied ? <>✓ Copied</> : <CopyIcon className="size-5" />}
          </button>
        </div>
        <button onClick={share} className="btn-secondary mt-2 w-full">
          {linkCopied ? 'Link copied!' : 'Invite players'}
        </button>
      </section>

      <section className="rounded-2xl bg-night-2 p-3">
        <h2 className="mb-2 px-1 font-bold">
          Players <span className="font-normal text-indigo-300">({view.players.length})</span>
        </h2>
        <ul className="flex flex-col gap-1">
          {view.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 rounded-lg bg-night px-3 py-2">
              <Avatar name={p.name} color={colorOf(p.id)} size={28} dim={!p.connected} />
              <span className={`truncate ${p.connected ? '' : 'text-indigo-400'}`}>
                {p.name}
                {p.id === view.you && <span className="text-indigo-400"> (you)</span>}
              </span>
              {p.id === view.hostId && <span title="Host">👑</span>}
              {isHost && p.id !== view.you && (
                <button
                  onClick={() => send({ t: 'kick', playerId: p.id })}
                  aria-label={`Remove ${p.name}`}
                  className="ml-auto size-6 rounded-full bg-night-3 text-sm leading-6 text-indigo-200"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-bold">Deck</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Deck">
          {DECKS.map((d) => {
            const active = view.settings.deckId === d.id;
            return (
              <button
                key={d.id}
                role="radio"
                aria-checked={active}
                disabled={!isHost && !active}
                onClick={() => isHost && send({ t: 'settings', deckId: d.id })}
                className={`flex flex-col items-start gap-0.5 rounded-xl p-3 text-left ring-2 transition ${
                  active ? 'bg-night-3 ring-accent' : 'bg-night-2 ring-transparent'
                } ${d.mode === 'truth' ? 'col-span-2' : ''} ${isHost ? 'active:scale-[0.98]' : 'cursor-default disabled:opacity-50'}`}
              >
                <span className="text-lg font-bold">
                  {d.emoji} {d.name}
                </span>
                <span className="text-xs leading-snug text-indigo-300">{d.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Segmented
        label="🔁 Rounds"
        options={ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
        value={view.settings.rounds}
        disabled={!isHost}
        onChange={(rounds) => send({ t: 'settings', rounds })}
      />
      <Segmented
        label="⏱ Timer"
        options={PACES.map((p) => ({ value: p, label: PACE_LABEL[p] }))}
        value={view.settings.pace}
        disabled={!isHost}
        onChange={(pace) => send({ t: 'settings', pace })}
      />

      <footer className="mt-auto flex flex-col gap-2 pt-2">
        {isHost ? (
          <>
            <button onClick={() => send({ t: 'start' })} disabled={short > 0} className="btn-primary">
              Start game
            </button>
            <p className="text-center text-sm text-indigo-300">
              {short > 0 ? `Invite ${short} more player${short > 1 ? 's' : ''} to start` : 'Best with 4 or more. Friends can join mid-game too.'}
            </p>
          </>
        ) : (
          <p className="text-center text-indigo-300">Waiting for the host to start…</p>
        )}
      </footer>
    </main>
  );
}

interface SegmentedProps<T> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}

function Segmented<T extends string | number>({ label, options, value, disabled, onChange }: SegmentedProps<T>) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-2xl bg-night-2 p-3">
      <span className="font-bold">{label}</span>
      <div className="flex rounded-full bg-night p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                active ? 'bg-accent text-indigo-950' : 'text-indigo-300'
              } ${disabled ? 'cursor-default' : ''}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
