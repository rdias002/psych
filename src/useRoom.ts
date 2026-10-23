import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, RoomView, ServerMsg } from '../shared/protocol';
import { getIdentity } from './identity';

export type Connection = 'connecting' | 'open' | 'reconnecting';

export interface RoomConnection {
  view: RoomView | null;
  connection: Connection;
  /** Transient error from the last action. */
  error: string | null;
  /** Unrecoverable: room missing, kicked, game already started... */
  fatal: string | null;
  /** The server refused our name; the player should pick another and rejoin. */
  nameTaken: string | null;
  send: (msg: ClientMsg) => void;
  /** Current time on the server's clock (ms), for countdowns. */
  serverNow: () => number;
}

const FATAL_CODES: Record<number, string> = {
  4001: 'The host removed you from the room.',
  4004: "This room doesn't exist or has expired.",
};

/** Connects to a room's WebSocket, says hello, and reconnects with backoff. */
export function useRoom(code: string, name: string): RoomConnection {
  const [view, setView] = useState<RoomView | null>(null);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [nameTaken, setNameTaken] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastError = useRef<string | null>(null);
  const clockOffset = useRef(0);

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const { playerId, token } = getIdentity();

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnection('open');
        ws.send(JSON.stringify({ t: 'hello', playerId, token, name } satisfies ClientMsg));
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data) as ServerMsg;
        if (msg.t === 'state') {
          clockOffset.current = msg.view.serverNow - Date.now();
          setView(msg.view);
        } else if (msg.t === 'error') {
          lastError.current = msg.msg;
          setError(msg.msg);
        } else if (msg.t === 'notFound') {
          setFatal(FATAL_CODES[4004]);
        } else if (msg.t === 'kicked') {
          setFatal(FATAL_CODES[4001]);
        }
      };

      ws.onclose = (e) => {
        if (closed) return;
        if (e.code === 4009) return setNameTaken(lastError.current ?? 'That name is taken.');
        if (e.code === 4000) return setFatal(lastError.current ?? 'Could not join this room.');
        if (FATAL_CODES[e.code]) return setFatal(FATAL_CODES[e.code]);
        setConnection('reconnecting');
        const delay = Math.min(10_000, 500 * 2 ** attempt++);
        retryTimer = setTimeout(connect, delay);
      };
    };

    // Phones suspend background tabs; reconnect immediately when the tab comes back.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
        clearTimeout(retryTimer);
        attempt = 0;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, [code, name]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError('Reconnecting… try again in a moment');
  }, []);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  return { view, connection, error, fatal, nameTaken, send, serverNow };
}
