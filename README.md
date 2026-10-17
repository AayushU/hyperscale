# HYPERSCALE

*Build the compute. Win the future.*

A Catan-style board game about building AI data centers, plus a website so you can play it online with friends (and bots).

- 🧠 GPUs, ⚡ Power, 💧 Water, 🏗️ Steel and 🧑‍💻 Talent instead of brick and sheep
- Fiber Lines, Data Centers and Hyperscale Campuses instead of roads, settlements and cities
- Lobbyists move the Regulator (the robber), R&D cards, Largest Network and Most Influence
- A **Headlines** event deck that changes the economy every round (Heat Wave, Export Controls, GPU Glut…)
- **Quick mode** (default, 30 to 40 minutes) or **Classic** (60 to 90 minutes)
- Balanced with about 140,000 simulated games and browser-tested end to end: see [PLAYTEST.md](PLAYTEST.md)

| Document | What's in it |
|---|---|
| [RULES.md](RULES.md) | The full rulebook (also at `/rules.html` on the server) |
| [CARDS.md](CARDS.md) | Every card with its text (printable versions at `/cards.html`) |
| [PLAYTEST.md](PLAYTEST.md) | How the game was playtested and what changed because of it |

## Host it on Cloudflare (recommended)

The fastest way to play online. Pages are served and cached at Cloudflare's edge, and each game table runs in its own Durable Object (a tiny server close to the players) that holds the table, runs its bots and pushes updates over a WebSocket. Everything fits in Cloudflare's free plan.

**One-time setup (about two minutes):**

1. Sign in at <https://dash.cloudflare.com> (a free account is fine).
2. Go to **Workers & Pages** → **Create** → **Import a repository**, connect GitHub, and pick this repository.
3. Keep the defaults (deploy command `npx wrangler deploy`) and click **Deploy**.

Cloudflare reads `wrangler.jsonc`, builds the site with `node scripts/build-site.mjs`, and gives you a `https://hyperscale.<your-subdomain>.workers.dev` address. Every push to `main` redeploys automatically. To use your own domain, add it under the Worker's **Settings → Domains & Routes**.

From a terminal instead: `npm install && npx wrangler login && npm run deploy`. Run it locally with `npm run dev` (<http://localhost:8787>).

Idle tables are deleted after three days.

## Play online without a server

`dist/hyperscale.html` is a single-page build of the whole game for hosting as a claude.ai artifact. Tables live in the artifact's shared storage, so there is nothing to run. Rebuild it after any change:

```bash
node scripts/build-artifact.mjs      # writes dist/hyperscale.html
```

Publish it with the `db`, `user` and `room` capabilities, and RULES.md as a supporting file. Players need a claude.ai account and access that lets them use the page, not just view it (set this in the Share menu); view-only visitors can watch.

## Run your own server

You need [Node.js](https://nodejs.org) 18 or newer. The server has **no dependencies to install** (the `wrangler` dev dependency is only for Cloudflare).

```bash
node server/server.js        # or: npm start
```

Open <http://localhost:3000>, enter your name, click **Create a game**, and send the link to your friends. Empty seats can be filled with bots (four personalities: Balanced, Expander, Campus, Researcher).

## Play with friends

The server has to be reachable from your friends' browsers. Pick one:

1. **Same Wi-Fi / house:** start the server and share `http://<your computer's local IP>:3000` (for example `http://192.168.1.20:3000`). On macOS the IP is in System Settings → Wi-Fi → Details; on Windows run `ipconfig`.
2. **Over the internet, from your laptop (quickest):** run a tunnel in a second terminal and share the URL it prints.
   - Cloudflare (free, no account): `cloudflared tunnel --url http://localhost:3000`
   - or ngrok: `ngrok http 3000`
3. **Always-on hosting:** deploy to any host that runs Node or Docker.
   - **Docker:** `docker build -t hyperscale . && docker run -p 3000:3000 -v hyperscale-data:/data hyperscale`
   - **Render / Railway / Fly.io:** point it at this folder, start command `node server/server.js`. They set `PORT` automatically. Attach a disk at `/data` and set `DATA_DIR=/data` if you want games to survive redeploys.

Games are saved to `data/rooms.json` every few seconds, so restarting the server resumes games in progress. Players who close the tab can reopen the same link and keep their seat (the seat is remembered in their browser).

### Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind |
| `DATA_DIR` | `./data` | Where games are saved |
| `BOT_DELAY_MS` | `700` | Pause between bot moves, so humans can follow along |
| `BOT_TRADE_WAIT_MS` | `10000` | How long a bot's trade offer waits for human answers |

## How it works

```
shared/engine.js    Rules engine: pure, seeded, deterministic. Used by the server, the bots, the tests and the browser (for move highlighting).
shared/content.js   All names, costs and card text (single source of truth for the game, CARDS.md and /cards.html).
shared/bots.js      Heuristic bot players (also the playtesters).
shared/rooms.js     Table logic (lobby, seats, chat, bots) shared by the Node server and the hosted build.
server/server.js    Zero-dependency Node server: rooms, lobby, Server-Sent Events for live updates, POST for moves.
worker/index.js     Cloudflare Worker + Durable Object version of the server (WebSocket updates, same POST API).
public/             The web client. transport-server.js talks to the Node server; transport-artifact.js to claude.ai shared storage.
sim/simulate.js     Balance simulator: plays thousands of bot games and reports metrics.
test/               Rule tests (node:test).
scripts/            gen-cards.mjs regenerates CARDS.md; build-artifact.mjs builds the hosted single-page version.
```

The server is authoritative: every move is validated by the engine, and each player only receives what they are allowed to see (other players' hands and R&D cards are hidden; the deck order and dice seed never leave the server).

The hosted build has no server: each player's browser runs the same engine and table logic under a short lock on the table's shared document, and the screen shows each player only their own hand. The full table document is readable by anyone with edit access, so hidden information there works on the honor system.

## Develop

```bash
npm test                              # 23 tests, including a 60-game bot fuzz test
node sim/simulate.js 2000 4 mixed     # balance report: 2000 four-player games, mixed bot strategies
node sim/simulate.js 2000 4 solo:expander   # one strategy vs three Balanced bots
node scripts/gen-cards.mjs            # after editing card text in shared/content.js
```
