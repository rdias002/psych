import { type FormEvent, Fragment, type ReactNode, useEffect, useState } from 'react';
import { PLAYER_TOKEN, deckInfo } from '../../shared/decks';
import { ANSWER_MAX_LENGTH, PICK_POINTS, TRUTH_POINTS } from '../../shared/engine';
import type { ChoiceView, PublicGame } from '../../shared/protocol';
import { Avatar } from '../components/Avatar';
import { TurnTimer } from '../components/TurnTimer';
import type { ScreenProps } from './Room';

export function Game(props: ScreenProps) {
  const { view, serverNow, leave } = props;
  const g = view.game!;
  const deck = deckInfo(g.deckId);
  const timer = view.deadline !== null && view.phaseStartedAt !== null && (
    <TurnTimer deadline={view.deadline} totalMs={view.deadline - view.phaseStartedAt} serverNow={serverNow} size={26} />
  );

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between gap-2 text-sm">
        <button onClick={leave} aria-label="Leave game" className="w-16 text-left text-indigo-300">
          ✕
        </button>
        <span className="truncate text-indigo-200">
          {deck?.emoji} {deck?.name} · Round {g.round + 1}/{g.rounds}
        </span>
        <span className="flex w-16 justify-end text-indigo-100">{timer}</span>
      </header>

      <PromptCard g={g} nameOf={props.nameOf} />

      {g.phase === 'write' && <WritePhase {...props} />}
      {g.phase === 'pick' && <PickPhase {...props} />}
      {g.phase === 'reveal' && <RevealPhase {...props} />}
    </main>
  );
}

/** The question, with the round's subject's name dropped in for The Truth Comes Out. */
function PromptCard({ g, nameOf }: { g: PublicGame; nameOf: (id: string) => string }) {
  const parts = g.prompt.split(PLAYER_TOKEN);
  return (
    <section key={g.round} className="pop-in rounded-3xl bg-white px-5 py-6 text-center text-xl leading-snug font-bold text-indigo-950 shadow-xl">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="rounded-md bg-psych/30 px-1 text-pink-700">{g.subject ? nameOf(g.subject) : 'someone'}</span>}
          {part}
        </Fragment>
      ))}
    </section>
  );
}

/** Who's done this phase: a tick on everyone who has answered or picked. */
function Progress({ view, done, nameOf, colorOf }: ScreenProps & { done: string[] }) {
  const g = view.game!;
  const connected = new Set(view.players.filter((p) => p.connected).map((p) => p.id));
  const waitingOn = g.players.filter((id) => !done.includes(id) && connected.has(id));
  return (
    <section className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {g.players.map((id) => (
          <Avatar key={id} name={nameOf(id)} color={colorOf(id)} dim={!done.includes(id)} badge={done.includes(id) ? '✓' : undefined} />
        ))}
      </div>
      {waitingOn.length > 0 && (
        <p className="text-center text-sm text-indigo-300">
          Waiting for {waitingOn.length > 3 ? `${waitingOn.length} players` : waitingOn.map(nameOf).join(', ')}…
        </p>
      )}
    </section>
  );
}

/** The host can stop waiting for stragglers. If the host has dropped out, anyone can. */
function NextButton({ view, send, children }: ScreenProps & { children: ReactNode }) {
  const g = view.game!;
  const host = view.players.find((p) => p.id === view.hostId);
  const canAdvance = view.hostId === view.you || !host?.connected;
  if (!canAdvance) return null;
  return (
    <button onClick={() => send({ t: 'next', phase: g.phase, round: g.round })} className="btn-secondary">
      {children}
    </button>
  );
}

function WritePhase(props: ScreenProps) {
  const { view, send } = props;
  const g = view.game!;
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(true);
  const submitted = g.myAnswer !== null && !editing;

  // A new round clears the box.
  useEffect(() => {
    setText('');
    setEditing(true);
  }, [g.round]);
  // Once the server accepts the answer, show it instead of the box.
  useEffect(() => {
    if (g.myAnswer !== null) setEditing(false);
  }, [g.myAnswer]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === g.myAnswer) setEditing(false);
    else if (text.trim()) send({ t: 'answer', text });
  };

  const hint =
    g.mode === 'truth' ? 'Write your funniest answer' : 'Write a fake answer that sounds true';

  return (
    <>
      {submitted ? (
        <section className="rise flex flex-col items-center gap-2 rounded-2xl bg-night-2 p-4 text-center">
          <p className="text-sm text-indigo-300">Your answer</p>
          <p className="text-lg font-bold">{g.myAnswer}</p>
          <button
            onClick={() => {
              setText(g.myAnswer ?? '');
              setEditing(true);
            }}
            className="text-sm text-indigo-300 underline"
          >
            Change it
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            maxLength={ANSWER_MAX_LENGTH}
            rows={2}
            autoFocus
            placeholder={hint}
            className="field resize-none"
            enterKeyHint="send"
          />
          <div className="flex items-center justify-between text-xs text-indigo-400">
            <span>{g.mode === 'bluff' ? 'Fool your friends — but no giving away the real answer!' : ''}</span>
            <span>
              {text.length}/{ANSWER_MAX_LENGTH}
            </span>
          </div>
          <button className="btn-primary" disabled={!text.trim()}>
            Submit
          </button>
        </form>
      )}
      <Progress {...props} done={g.answered} />
      <NextButton {...props}>Stop waiting · go to {g.mode === 'truth' ? 'voting' : 'picking'}</NextButton>
    </>
  );
}

function PickPhase(props: ScreenProps) {
  const { view, send } = props;
  const g = view.game!;
  const title = g.mode === 'truth' ? 'Vote for your favourite' : 'Which one is the truth?';

  return (
    <>
      <h2 className="text-center font-bold text-indigo-100">{title}</h2>
      {g.choices.length === 0 ? (
        <p className="text-center text-indigo-300">No answers for you to pick from this time.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {g.choices.map((c, i) => {
            const mine = g.myPick === c.id;
            return (
              <li key={c.id} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
                <button
                  onClick={() => send({ t: 'pick', choiceId: c.id })}
                  aria-pressed={mine}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-lg font-semibold transition active:scale-[0.98] ${
                    mine ? 'bg-accent text-indigo-950 shadow-lg' : 'bg-night-2 ring-1 ring-indigo-700'
                  }`}
                >
                  {c.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {g.myAnswer && <p className="text-center text-xs text-indigo-400">Your answer “{g.myAnswer}” isn't shown to you.</p>}
      <Progress {...props} done={g.picked} />
      <NextButton {...props}>Stop waiting · reveal answers</NextButton>
    </>
  );
}

/** Truth last, so it lands as the punchline; otherwise the most-picked first. */
function revealOrder(g: PublicGame): ChoiceView[] {
  const votes = (c: ChoiceView) => c.pickers?.length ?? 0;
  return [...g.choices].sort((a, b) => Number(!!a.truth) - Number(!!b.truth) || votes(b) - votes(a));
}

function RevealPhase(props: ScreenProps) {
  const { view, nameOf, colorOf } = props;
  const g = view.game!;
  const truthMode = g.mode === 'truth';
  const choices = revealOrder(g);
  const topVotes = Math.max(0, ...choices.map((c) => c.pickers?.length ?? 0));
  const last = g.round + 1 >= g.rounds;

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {choices.map((c, i) => {
          const pickers = c.pickers ?? [];
          const authors = c.authors ?? [];
          const favourite = truthMode && topVotes > 0 && pickers.length === topVotes;
          const psyched = !c.truth && !truthMode && pickers.length > 0;
          return (
            <li
              key={c.id}
              className={`rise relative rounded-2xl p-3.5 ${
                c.truth ? 'bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/30' : favourite ? 'bg-accent text-indigo-950' : 'bg-night-2'
              }`}
              style={{ animationDelay: `${i * 350}ms` }}
            >
              {c.truth && <p className="text-xs font-black tracking-widest uppercase">✓ The truth</p>}
              {favourite && <p className="text-xs font-black tracking-widest uppercase">👑 Favourite</p>}
              <p className="text-lg font-bold">{c.text}</p>
              {authors.length > 0 && (
                <p className={`text-sm ${favourite ? 'text-indigo-900' : 'text-indigo-300'}`}>
                  by {authors.map(nameOf).join(' & ')}
                </p>
              )}
              {pickers.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`text-xs ${c.truth || favourite ? '' : 'text-indigo-300'}`}>
                    {c.truth ? 'Found by' : truthMode ? 'Votes' : 'Fooled'}
                  </span>
                  {pickers.map((id) => (
                    <Avatar key={id} name={nameOf(id)} color={colorOf(id)} size={24} />
                  ))}
                </div>
              )}
              {psyched && (
                <span
                  className="stamp absolute top-2 right-3 rounded-md border-2 border-psych px-1.5 text-lg font-black text-psych"
                  style={{ animationDelay: `${i * 350 + 250}ms` }}
                >
                  PSYCH!
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <Scoreboard g={g} nameOf={nameOf} colorOf={colorOf} you={view.you} />

      <p className="text-center text-xs text-indigo-400">
        {truthMode
          ? `+${PICK_POINTS} for every vote you get`
          : `+${TRUTH_POINTS} for finding the truth · +${PICK_POINTS} for every player you psych`}
      </p>
      <NextButton {...props}>{last ? 'See final scores 🏆' : 'Next round →'}</NextButton>
    </>
  );
}

export function Scoreboard({
  g,
  nameOf,
  colorOf,
  you,
  showGained = true,
}: {
  g: PublicGame;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  you: string;
  showGained?: boolean;
}) {
  const ranked = [...g.players].sort((a, b) => (g.scores[b] ?? 0) - (g.scores[a] ?? 0));
  return (
    <section className="rounded-2xl bg-night-2 p-3">
      <ol className="flex flex-col gap-1">
        {ranked.map((id) => (
          <li key={id} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${id === you ? 'bg-night-3' : ''}`}>
            <Avatar name={nameOf(id)} color={colorOf(id)} size={26} />
            <span className="flex-1 truncate">{nameOf(id)}</span>
            {showGained && (g.gained[id] ?? 0) > 0 && (
              <span className="pop-in text-sm font-bold text-emerald-300">+{g.gained[id]}</span>
            )}
            <span className="w-8 text-right font-black tabular-nums">{g.scores[id] ?? 0}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
