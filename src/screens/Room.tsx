import { useCallback, useEffect, useState } from 'react';
import type { ClientMsg, RoomView } from '../../shared/protocol';
import { navigate } from '../App';
import { playerColor } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLeaveGuard } from '../useLeaveGuard';
import { useRoom } from '../useRoom';
import { Final } from './Final';
import { Game } from './Game';
import { Lobby } from './Lobby';

interface Props {
  code: string;
  name: string;
  /** Called when the server refuses this name, so the app can ask for another. */
  onNameRejected: (msg: string) => void;
}

/** What every screen inside a room gets. */
export interface ScreenProps {
  view: RoomView;
  send: (msg: ClientMsg) => void;
  serverNow: () => number;
  /** Ask before leaving, then leave the room. */
  leave: () => void;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
}

export function Room({ code, name, onNameRejected }: Props) {
  const room = useRoom(code, name);
  const { view, connection, error, fatal, nameTaken, send } = room;
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (nameTaken) onNameRejected(nameTaken);
  }, [nameTaken, onNameRejected]);

  // Mid-game, back and refresh ask first instead of dropping you out.
  const inGame = view?.status === 'playing';
  const release = useLeaveGuard(inGame && !fatal, () => setConfirmLeave(true));

  const leaveNow = useCallback(() => {
    release();
    send({ t: 'leave' });
    navigate('/');
  }, [release, send]);

  if (fatal) {
    return (
      <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="text-lg">{fatal}</p>
        <button onClick={() => navigate('/')} className="btn-primary w-full">
          Back to home
        </button>
      </main>
    );
  }

  const nameOf = (id: string) => view?.players.find((p) => p.id === id)?.name ?? 'Someone';
  const colorOf = (id: string) => playerColor(view?.players.findIndex((p) => p.id === id) ?? 0);
  const props: ScreenProps | null = view && {
    view,
    send,
    serverNow: room.serverNow,
    leave: inGame ? () => setConfirmLeave(true) : leaveNow,
    nameOf,
    colorOf,
  };

  return (
    <>
      {connection === 'reconnecting' && (
        <div className="fixed inset-x-0 top-0 z-50 bg-amber-400 py-1 text-center text-sm font-semibold text-indigo-950">
          Connection lost — reconnecting…
        </div>
      )}
      {error && (
        <div className="pointer-events-none fixed inset-x-0 top-12 z-50 flex justify-center px-4">
          <div className="rise rounded-full bg-rose-600 px-4 py-2 text-center text-sm font-semibold shadow-lg">{error}</div>
        </div>
      )}
      {!props ? (
        <main className="flex min-h-full items-center justify-center text-indigo-300">Joining room {code}…</main>
      ) : props.view.status === 'lobby' ? (
        <Lobby {...props} />
      ) : props.view.status === 'ended' ? (
        <Final {...props} />
      ) : (
        <Game {...props} />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title="Leave the game?"
          body="You'll lose your score, but you can rejoin with the room link."
          cancelLabel="Keep playing"
          confirmLabel="Leave"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={leaveNow}
        />
      )}
    </>
  );
}
