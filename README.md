# Psych Online

A party game of bluffing, inspired by *Psych! Outwit Your Friends*. One person creates a room and shares the link, and everyone plays from their own phone.

- **Frontend:** React + TypeScript + Tailwind, built with Vite (`src/`)
- **Backend:** a Cloudflare Worker with one Durable Object per room (`worker/`). The server keeps the questions, the real answers and who wrote what. A player only ever receives what they're allowed to see.
- **Rules engine:** pure TypeScript (`shared/engine.ts`)
- **Question bank:** original questions in `worker/decks/`. It's server-only, so the answers never ship to the browser.

Everything runs on Cloudflare's free tier.

## Develop

Needs Node 20 or newer. On this machine, use `export PATH=/opt/homebrew/bin:$PATH`.

```sh
npm install
npm run dev        # http://localhost:5173 — runs the Worker + Durable Objects locally too
npm test           # engine, room logic and question bank tests
npm run typecheck
```

To try multiplayer locally, open the room link in several browser profiles or incognito windows. Each window gets its own player identity.

## Deploy

```sh
npx wrangler login   # once, with a free Cloudflare account
npm run deploy       # builds and deploys to https://psych.rdias002.workers.dev
```

## How a round works

1. **Write:** everyone sees the same question and writes a convincing fake answer. A fake that matches the real answer is rejected.
2. **Pick:** all the fakes and the real answer are shuffled together. You never see your own. Pick what you think is the truth.
3. **Reveal:** see who wrote what and who fell for it. Then the truth is revealed.

**Scoring:** +2 for picking the truth, and +1 for every player who picks your fake. If two players write the same fake, both get the points.

**The Truth Comes Out:** each question is about a player in the room ("What's Sam's hidden talent?"), and everyone takes a turn as the subject. There's no real answer, so everyone votes for their favourite and gets +1 per vote.

At the end there's a podium and three awards: Psych Master (fooled the most players), Truth Seeker (found the truth most often) and Most Gullible.

## Rooms

- **Players:** 3–12. Friends can join mid-game, and anyone can leave.
- **Host settings:** deck, rounds (5 / 7 / 10) and timer. Normal is 60s to write and 30s to pick. Relaxed is 120s and 60s. Off means the host moves things on.
- **No waiting on dropouts:** a phase ends as soon as every connected player is done. If the host drops out, anyone can press Next.
- **Play again:** you get fresh questions; nothing repeats until the deck runs out.
- **Cleanup:** rooms are deleted after 24 hours of inactivity.

## Adding questions

Add rows to the deck files in `worker/decks/`. Bluff decks use `[prompt, real answer, ...other spellings]`, with `_____` marking the blank. Truth Comes Out prompts use `{player}` where the subject's name goes. `npm test` checks that every deck is valid.
