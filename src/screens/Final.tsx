import type { PublicGame } from '../../shared/protocol';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { Scoreboard } from './Game';
import type { ScreenProps } from './Room';

interface Award {
  emoji: string;
  title: string;
  who: string[];
  detail: string;
}

/** Players with the highest positive value of `stat`. */
function best(g: PublicGame, stat: (id: string) => number): string[] {
  const top = Math.max(0, ...g.players.map(stat));
  return top > 0 ? g.players.filter((id) => stat(id) === top) : [];
}

function awards(g: PublicGame): Award[] {
  const stats = (id: string) => g.stats[id] ?? { fooled: 0, truths: 0, fellFor: 0 };
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (g.mode === 'truth') {
    const fav = best(g, (id) => stats(id).fooled);
    return fav.length ? [{ emoji: '🎤', title: 'Crowd Favourite', who: fav, detail: plural(stats(fav[0]).fooled, 'vote') }] : [];
  }
  const list: Award[] = [];
  const master = best(g, (id) => stats(id).fooled);
  if (master.length) list.push({ emoji: '🧠', title: 'Psych Master', who: master, detail: `fooled ${plural(stats(master[0]).fooled, 'time')}` });
  const seeker = best(g, (id) => stats(id).truths);
  if (seeker.length) list.push({ emoji: '🔍', title: 'Truth Seeker', who: seeker, detail: `found the truth ${plural(stats(seeker[0]).truths, 'time')}` });
  const gullible = best(g, (id) => stats(id).fellFor);
  if (gullible.length) list.push({ emoji: '🐟', title: 'Most Gullible', who: gullible, detail: `took the bait ${plural(stats(gullible[0]).fellFor, 'time')}` });
  return list;
}

export function Final({ view, send, leave, nameOf, colorOf }: ScreenProps) {
  const g = view.game!;
  const isHost = view.hostId === view.you;
  const top = Math.max(...g.players.map((id) => g.scores[id] ?? 0));
  const winners = g.players.filter((id) => (g.scores[id] ?? 0) === top);
  const names = (ids: string[]) => ids.map(nameOf).join(' & ');

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <button onClick={leave} className="w-16 text-left text-indigo-300">
          ← Leave
        </button>
        <Logo small />
        <span className="w-16" />
      </header>

      <section className="pop-in flex flex-col items-center gap-3 rounded-3xl bg-night-2 p-6 text-center">
        <p className="text-5xl">🏆</p>
        <div className="flex -space-x-2">
          {winners.map((id) => (
            <Avatar key={id} name={nameOf(id)} color={colorOf(id)} size={56} />
          ))}
        </div>
        <h2 className="text-2xl font-black text-accent">
          {names(winners)} {winners.length > 1 ? 'tie' : 'wins'}!
        </h2>
        <p className="text-indigo-300">{top} points</p>
      </section>

      {awards(g).length > 0 && (
        <section className="grid gap-2">
          {awards(g).map((a, i) => (
            <div key={a.title} className="rise flex items-center gap-3 rounded-2xl bg-night-2 p-3" style={{ animationDelay: `${300 + i * 200}ms` }}>
              <span className="text-3xl">{a.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wider text-indigo-300 uppercase">{a.title}</p>
                <p className="truncate font-bold">{names(a.who)}</p>
                <p className="text-sm text-indigo-300">{a.detail}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <Scoreboard g={g} nameOf={nameOf} colorOf={colorOf} you={view.you} showGained={false} />

      <footer className="mt-auto flex flex-col gap-2 pt-2">
        {isHost ? (
          <>
            <button onClick={() => send({ t: 'playAgain' })} className="btn-primary">
              Play again
            </button>
            <button onClick={() => send({ t: 'toLobby' })} className="btn-secondary">
              Change deck
            </button>
          </>
        ) : (
          <p className="text-center text-indigo-300">Waiting for the host to start another game…</p>
        )}
      </footer>
    </main>
  );
}
