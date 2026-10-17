// HYPERSCALE on Cloudflare: static pages come from the edge (site/), and every game
// table is its own Durable Object that holds the table, runs its bots and pushes
// updates to players over a WebSocket. Moves use the same POST API as
// server/server.js; only the update channel differs (WebSocket instead of SSE).
import { DurableObject } from 'cloudflare:workers';
import { newRoom, newCode, roomVerb, botStep, lobbyInfo, viewFor } from '../shared/rooms.js';

const BOT_DELAY = 700;
const BOT_TRADE_WAIT = 10000;
const ROOM_TTL = 1000 * 60 * 60 * 24 * 3;
const CODE_RE = /^[A-Z0-9]{5}$/;

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const newToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/healthz') return json(200, { ok: true });
    if (parts[0] !== 'api' || parts[1] !== 'rooms') return env.ASSETS.fetch(request);

    if (parts.length === 2) {
      if (request.method !== 'POST') return json(405, { error: 'method not allowed' });
      const body = await request.text();
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const res = await table(env, code).fetch(`https://table/${code}/create`, { method: 'POST', body });
        if (res.status !== 409) return res;
      }
      return json(503, { error: 'Could not create a table. Try again.' });
    }
    const code = (parts[2] || '').toUpperCase();
    if (!CODE_RE.test(code)) return json(404, { error: 'No game with that code. Check the code or create a new game.' });
    const rest = parts.slice(3).join('/');
    return table(env, code).fetch(`https://table/${code}/${rest}${url.search}`, request);
  },
};

const table = (env, code) => env.TABLES.get(env.TABLES.idFromName(code));

export class Table extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.botTimer = null;
    ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get('room')) || null; });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const [code, verb] = url.pathname.split('/').filter(Boolean);
    if (verb === 'create') {
      if (this.room) return json(409, { error: 'exists' });
      const body = await request.json().catch(() => ({}));
      const token = newToken();
      this.room = newRoom({ code, hostId: token, hostName: body.name });
      await this.save();
      return json(200, { code, token });
    }
    const room = this.room;
    if (!room) return json(404, { error: 'No game with that code. Check the code or create a new game.' });
    this.scheduleBots(); // resumes bots after this table was unloaded

    if (request.method === 'GET' && verb === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'expected a WebSocket' });
      const [client, server] = Object.values(new WebSocketPair());
      // The tag remembers whose socket it is, even after the table sleeps and wakes.
      this.ctx.acceptWebSocket(server, [url.searchParams.get('token') || '-']);
      this.broadcast(false); // everyone sees the new connection
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === 'GET' && !verb) return json(200, { code: room.code, started: !!room.game, seats: room.seats.length });
    if (request.method !== 'POST') return json(405, { error: 'method not allowed' });

    const text = await request.text();
    if (text.length > 64 * 1024) return json(400, { error: 'too large' });
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { return json(400, { error: 'bad json' }); }
    let token = body.token || '';
    if (verb === 'debugGrant') {
      // Test hook, only when HYPERSCALE_DEBUG=1: give the caller resources and R&D cards.
      const seat = room.seats.findIndex(s => s.id === token);
      if (this.env.HYPERSCALE_DEBUG !== '1' || !room.game || seat < 0) return json(404, { error: 'unknown endpoint' });
      const p = room.game.players[seat];
      for (const [r, n] of Object.entries(body.resources || {})) p.resources[r] += n;
      for (const type of body.dev || []) p.devCards.push({ type, variant: type, boughtTurn: 0 });
      await this.broadcast();
      return json(200, { ok: true });
    }
    if (verb === 'join' && !room.seats.some(s => s.id && s.id === token)) token = newToken();
    const result = roomVerb(room, token, verb, body);
    if (!result.ok) return json(400, { error: result.error });
    await this.broadcast();
    this.scheduleBots();
    return json(200, verb === 'join' ? { token } : { ok: true });
  }

  // Players only listen on the socket; moves arrive as POSTs.
  webSocketMessage() {}
  webSocketClose(ws) { try { ws.close(); } catch { /* already closed */ } this.broadcast(false); }
  webSocketError() { this.broadcast(false); }

  // Send everyone their own view. changed=false for connection changes, which are not saved.
  async broadcast(changed = true) {
    const room = this.room;
    if (!room) return;
    if (changed) { room.updatedAt = Date.now(); room.version++; }
    const open = this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN);
    const connected = new Set(open.map(ws => this.ctx.getTags(ws)[0]));
    for (const ws of open) {
      const token = this.ctx.getTags(ws)[0];
      try { ws.send(JSON.stringify({ lobby: lobbyInfo(room, token, connected), game: viewFor(room, token) })); } catch { /* closing */ }
    }
    if (changed) await this.save();
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
  }

  scheduleBots(delay = BOT_DELAY) {
    const room = this.room;
    if (this.botTimer || !room?.game || room.game.phase === 'ended') return;
    this.botTimer = setTimeout(async () => {
      this.botTimer = null;
      const r = botStep(room, Date.now(), BOT_TRADE_WAIT);
      if (r.acted) { await this.broadcast(); this.scheduleBots(); }
      else if (r.waitMs) this.scheduleBots(Math.min(1000, r.waitMs));
    }, delay);
  }

  // Idle tables are deleted after three days.
  async alarm() {
    if (this.room && Date.now() - this.room.updatedAt < ROOM_TTL) return this.ctx.storage.setAlarm(this.room.updatedAt + ROOM_TTL);
    if (this.ctx.getWebSockets().length) return this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
}
