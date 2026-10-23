import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from '../shared/protocol';

export { GameRoom } from './game-room';

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const created = await env.ROOMS.get(env.ROOMS.idFromName(code)).init(code);
        if (created) return Response.json({ code });
      }
      return Response.json({ error: 'Could not allocate a room' }, { status: 503 });
    }

    const ws = url.pathname.match(/^\/ws\/([A-Z0-9]+)$/);
    if (ws) {
      const code = ws[1];
      if (!isRoomCode(code)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
