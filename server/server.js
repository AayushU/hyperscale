// HYPERSCALE server: zero dependencies. Serves the web client and runs game rooms.
// Clients receive state over Server-Sent Events and send actions with POST.
//   node server/server.js            (PORT=3000 by default)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newRoom, newCode, roomVerb, botStep, lobbyInfo, viewFor } from '../shared/rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const BOT_DELAY = +(process.env.BOT_DELAY_MS ?? 700);
const BOT_TRADE_WAIT = +(process.env.BOT_TRADE_WAIT_MS ?? 10000);
const ROOM_TTL = 1000 * 60 * 60 * 24 * 3;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json',
};

/** code -> room (plain JSON, see shared/rooms.js) */
const rooms = new Map();
/** code -> { clients: Set<{res, token}>, botTimer } (runtime only, never saved) */
const live = new Map();
const liveOf = code => { let l = live.get(code); if (!l) { l = { clients: new Set(), botTimer: null }; live.set(code, l); } return l; };

// ------------------------------------------------------------ persistence
const saveFile = () => path.join(DATA_DIR, 'rooms.json');
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(saveFile() + '.tmp', JSON.stringify([...rooms.values()]));
      fs.renameSync(saveFile() + '.tmp', saveFile());
    } catch (e) { console.error('save failed', e.message); }
  }, 500);
}
function loadRooms() {
  try {
    for (const r of JSON.parse(fs.readFileSync(saveFile(), 'utf8'))) {
      if (!r.seats?.every(s => 'id' in s)) continue; // pre-1.1 save format
      if (Date.now() - r.updatedAt > ROOM_TTL) continue;
      rooms.set(r.code, r);
    }
    console.log(`Restored ${rooms.size} room(s).`);
  } catch { /* first run */ }
}

const newToken = () => crypto.randomBytes(16).toString('hex');
function connectedIds(code) { return new Set([...liveOf(code).clients].map(c => c.token)); }

function broadcast(room) {
  room.updatedAt = Date.now();
  room.version++;
  for (const c of liveOf(room.code).clients) send(c, room);
  scheduleSave();
}
function send(c, room) {
  const payload = JSON.stringify({ lobby: lobbyInfo(room, c.token, connectedIds(room.code)), game: viewFor(room, c.token) });
  c.res.write(`data: ${payload}\n\n`);
}

function scheduleBots(room, delay = BOT_DELAY) {
  const l = liveOf(room.code);
  if (l.botTimer || !room.game || room.game.phase === 'ended') return;
  l.botTimer = setTimeout(() => {
    l.botTimer = null;
    const r = botStep(room, Date.now(), BOT_TRADE_WAIT);
    if (r.acted) { broadcast(room); scheduleBots(room); }
    else if (r.waitMs) scheduleBots(room, Math.min(1000, r.waitMs));
  }, delay);
}

// ------------------------------------------------------------ HTTP
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel.startsWith('/r/')) rel = '/index.html';
  let base = path.join(ROOT, 'public');
  if (rel.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = rel.slice('/shared'.length); }
  else if (['/RULES.md', '/CARDS.md', '/PLAYTEST.md'].includes(rel)) base = ROOT;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return json(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

async function handleApi(req, res, parts, url) {
  if (parts[1] !== 'rooms') return json(res, 404, { error: 'not found' });
  if (req.method === 'POST' && parts.length === 2) {
    const body = await readBody(req);
    let code; do code = newCode(); while (rooms.has(code));
    const token = newToken();
    rooms.set(code, newRoom({ code, hostId: token, hostName: body.name }));
    scheduleSave();
    return json(res, 200, { code, token });
  }
  const code = (parts[2] || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return json(res, 404, { error: 'No game with that code. Check the code or create a new game.' });
  const verb = parts[3];

  if (req.method === 'GET' && verb === 'events') {
    const token = url.searchParams.get('token') || '';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const client = { res, token };
    const l = liveOf(code);
    l.clients.add(client);
    broadcast(room); // everyone sees the new connection
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); l.clients.delete(client); broadcast(room); });
    return;
  }
  if (req.method === 'GET' && !verb) return json(res, 200, { code: room.code, started: !!room.game, seats: room.seats.length });
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

  const body = await readBody(req);
  let token = body.token || '';
  if (verb === 'debugGrant') {
    // Test hook, only when HYPERSCALE_DEBUG=1: give the caller resources and R&D cards.
    const seat = room.seats.findIndex(s => s.id === token);
    if (process.env.HYPERSCALE_DEBUG !== '1' || !room.game || seat < 0) return json(res, 404, { error: 'unknown endpoint' });
    const p = room.game.players[seat];
    for (const [r, n] of Object.entries(body.resources || {})) p.resources[r] += n;
    for (const type of body.dev || []) p.devCards.push({ type, variant: type, boughtTurn: 0 });
    broadcast(room);
    return json(res, 200, { ok: true });
  }
  if (verb === 'join' && !room.seats.some(s => s.id && s.id === token)) token = newToken();
  const result = roomVerb(room, token, verb, body);
  if (!result.ok) return json(res, 400, { error: result.error });
  broadcast(room);
  scheduleBots(room);
  return json(res, 200, verb === 'join' ? { token } : { ok: true });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') return await handleApi(req, res, parts, url);
    if (url.pathname === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.message === 'bad json' || e.message === 'too large' ? 400 : 500, { error: e.message });
  }
});

// Drop idle rooms
setInterval(() => {
  for (const [code, r] of rooms) if (Date.now() - r.updatedAt > ROOM_TTL && !liveOf(code).clients.size) { rooms.delete(code); live.delete(code); }
}, 60 * 60 * 1000).unref();

loadRooms();
for (const r of rooms.values()) scheduleBots(r);
server.listen(PORT, HOST, () => {
  console.log(`HYPERSCALE running at http://localhost:${PORT}  (share your LAN/public address with friends)`);
});
