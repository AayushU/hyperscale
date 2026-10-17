// Table (room) logic shared by the Node server and the hosted artifact version.
// A room is plain JSON: seats, options, chat and the engine state. Every change
// goes through roomVerb() so both hosts enforce the same rules.

import { createGame, applyAction, getView, MODES } from './engine.js';
import { botAction, PROFILES } from './bots.js';
import { PLAYER_COLORS } from './content.js';

export const BOT_NAMES = ['Ada', 'Turing', 'Hopper', 'Lovelace', 'Shannon', 'Babbage', 'Knuth', 'Dijkstra'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomInt(n) {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % n;
}
export function newCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return c;
}
export const cleanName = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Player';

export function newRoom({ code, hostId, hostName, now = Date.now() }) {
  return {
    code, createdAt: now, updatedAt: now, version: 0,
    hostId,
    seats: [{ id: hostId, name: cleanName(hostName), bot: null, color: PLAYER_COLORS[0] }],
    options: { mode: 'quick', headlines: true, friendlyRegulator: false },
    game: null, chat: [], gameNumber: 0, tradeOpenedAt: null,
  };
}

export const seatOf = (room, id) => (id ? room.seats.findIndex(s => s.id && s.id === id) : -1);

export function effectiveOptions(room) {
  const mode = MODES[room.options.mode] || MODES.quick;
  const { label, ...rules } = mode;
  void label;
  const o = { ...rules, headlines: room.options.headlines, friendlyRegulator: room.options.friendlyRegulator, mode: room.options.mode };
  if (room.options.mode === 'classic' && room.seats.length === 2) o.vpToWin = 8;
  return o;
}

// What a client needs about the table. `connected` is a Set of ids currently online, or null if unknown.
export function lobbyInfo(room, id, connected = null) {
  return {
    code: room.code,
    host: seatOf(room, room.hostId),
    you: seatOf(room, id),
    isHost: !!id && id === room.hostId,
    seats: room.seats.map((s, i) => ({
      name: s.name, bot: s.bot, color: s.color, seat: i,
      connected: s.bot ? true : connected ? connected.has(s.id) : true,
    })),
    options: effectiveOptions(room),
    started: !!room.game,
    gameNumber: room.gameNumber,
    chat: room.chat.slice(-50),
  };
}

export function viewFor(room, id) {
  if (!room.game) return null;
  const seat = seatOf(room, id);
  const v = getView(room.game, seat >= 0 ? seat : null);
  v.log = v.log.slice(-120);
  if (room.game.trade) v.trade.openedAt = room.tradeOpenedAt;
  return v;
}

const ok = () => ({ ok: true });
const err = error => ({ ok: false, error });
const inProgress = room => room.game && room.game.phase !== 'ended';

function usedColor(room) {
  const used = new Set(room.seats.map(s => s.color));
  return PLAYER_COLORS.find(c => !used.has(c));
}

// Apply one table action by `id`. Mutates room. Returns {ok} or {ok:false,error}.
export function roomVerb(room, id, verb, body = {}, now = Date.now()) {
  const seat = seatOf(room, id);
  const isHost = !!id && id === room.hostId;
  switch (verb) {
    case 'join': {
      if (seat >= 0) return ok();
      if (room.game) return err('That game has already started. Ask the host for a rematch to join.');
      if (room.seats.length >= 4) return err('That game is full (4 players).');
      room.seats.push({ id, name: cleanName(body.name), bot: null, color: usedColor(room) });
      return ok();
    }
    case 'leave': {
      if (seat < 0 || isHost) return err('The host cannot leave the table.');
      if (room.game) return err('Leave after the game ends.');
      room.seats.splice(seat, 1);
      return ok();
    }
    case 'addBot': {
      if (!isHost) return err('Only the host can add bots.');
      if (inProgress(room)) return err('Game in progress.');
      if (room.seats.length >= 4) return err('The table is full.');
      const profile = PROFILES[body.profile] ? body.profile : 'balanced';
      const name = BOT_NAMES.find(n => !room.seats.some(s => s.name.startsWith(n))) || 'Bot';
      room.seats.push({ id: null, name: `${name} (bot)`, bot: profile, color: usedColor(room) });
      return ok();
    }
    case 'removeSeat': {
      if (!isHost) return err('Only the host can remove players.');
      if (inProgress(room)) return err('Game in progress.');
      const i = +body.seat;
      if (!room.seats[i] || room.seats[i].id === room.hostId) return err('Cannot remove that seat.');
      room.seats.splice(i, 1);
      room.game = null;
      return ok();
    }
    case 'options': {
      if (!isHost) return err('Only the host can change options.');
      if (inProgress(room)) return err('Game in progress.');
      const o = body.options || {};
      if (o.mode !== undefined && MODES[o.mode]) room.options.mode = o.mode;
      if (o.friendlyRegulator !== undefined) room.options.friendlyRegulator = !!o.friendlyRegulator;
      if (o.headlines !== undefined) room.options.headlines = !!o.headlines;
      return ok();
    }
    case 'start': {
      if (!isHost) return err('Only the host can start.');
      if (inProgress(room)) return err('Game already running.');
      if (room.seats.length < 2) return err('Need at least 2 players (add a bot?).');
      const players = room.seats.map(s => ({ name: s.name, bot: s.bot, color: s.color }));
      room.game = createGame({ players, seed: randomInt(2 ** 31), options: effectiveOptions(room) });
      room.gameNumber++;
      room.tradeOpenedAt = null;
      return ok();
    }
    case 'action': {
      if (!room.game) return err('The game has not started.');
      if (seat < 0) return err('You are not seated in this game.');
      const r = applyAction(room.game, seat, body.action);
      if (r.ok && body.action?.type === 'offerTrade') room.tradeOpenedAt = now;
      return r;
    }
    case 'chat': {
      if (seat < 0) return err('Join the game to chat.');
      const text = String(body.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300);
      if (!text) return err('Empty message.');
      room.chat.push({ seat, name: room.seats[seat].name, text, at: now });
      if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
      return ok();
    }
    case 'rename': {
      if (seat < 0) return err('Not seated.');
      room.seats[seat].name = cleanName(body.name);
      if (room.game) room.game.players[seat].name = room.seats[seat].name;
      return ok();
    }
    case 'botify': {
      if (!isHost) return err('Only the host can do that.');
      const i = +body.seat;
      const target = room.seats[i];
      if (!room.game || !target || target.bot || target.id === room.hostId) return err('Cannot replace that seat.');
      target.bot = 'balanced';
      target.id = null;
      target.name = `${target.name} (bot)`.slice(0, 26);
      room.game.players[i].bot = 'balanced';
      room.game.players[i].name = target.name;
      return ok();
    }
  }
  return err('Unknown request.');
}

// One bot move, if any bot has one. Returns {acted:true}, or {acted:false, waitMs} when a
// bot's trade offer is waiting on humans, or {acted:false} when no bot needs to act.
export function botStep(room, now = Date.now(), tradeWaitMs = 10000) {
  const g = room.game;
  if (!g || g.phase === 'ended') return { acted: false };
  for (const [i, seat] of room.seats.entries()) {
    if (!seat.bot) continue;
    let a;
    try { a = botAction(g, i, seat.bot); } catch (e) { console.error('bot error', e); continue; }
    if (!a) continue;
    const res = applyAction(g, i, a);
    if (!res.ok) {
      console.error(`bot ${i} illegal ${JSON.stringify(a)}: ${res.error}`);
      if (g.current === i && g.turn?.stage === 'main') applyAction(g, i, { type: 'endTurn' });
    } else if (a.type === 'offerTrade') room.tradeOpenedAt = now;
    return { acted: true };
  }
  // A bot's trade offer waiting on humans: give up after a while.
  if (g.trade && room.seats[g.trade.from]?.bot) {
    const waited = now - (room.tradeOpenedAt || 0);
    if (waited >= tradeWaitMs) {
      const acc = Object.entries(g.trade.responses).find(([, r]) => r === 'accept');
      applyAction(g, g.trade.from, acc ? { type: 'acceptTrade', with: +acc[0] } : { type: 'cancelTrade' });
      return { acted: true };
    }
    return { acted: false, waitMs: tradeWaitMs - waited };
  }
  return { acted: false };
}

// Lightweight listing entry for lobbies ("open tables").
export function tableSummary(room) {
  return {
    code: room.code,
    host: room.seats.find(s => s.id === room.hostId)?.name || 'Host',
    players: room.seats.map(s => s.name),
    seatIds: room.seats.map(s => s.id).filter(Boolean),
    status: !room.game ? 'lobby' : room.game.phase === 'ended' ? 'ended' : 'playing',
    mode: room.options.mode,
    updatedAt: room.updatedAt,
  };
}
