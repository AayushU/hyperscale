import {
  TOPO, PIPS, legalSettlementVertices, legalRoadEdges, legalCityVertices, tradeRatio, canAfford, costOf,
  isBanned, playableDevCards, protectedHex, handSize,
} from '/shared/engine.js';
import { RESOURCES, RESOURCE_INFO, TERRAIN_INFO, BUILDINGS, DEV_CARDS, SPECIAL_CARDS } from '/shared/content.js';
import { serverTransport } from '/transport-server.js';
import { artifactTransport } from '/transport-artifact.js';
import { renderMarkdown } from '/md.js';
import { cardsHTML, CARD_CSS } from '/cardgallery.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = r => RESOURCE_INFO[r].icon;
const costIcons = cost => Object.entries(cost).map(([r, n]) => ICON(r).repeat(n)).join('');
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
// Only touch the DOM when a panel's markup changed, so clicks are never lost to a re-render.
const htmlCache = new Map();
function setHTML(id, html) {
  if (htmlCache.get(id) === html) return false;
  htmlCache.set(id, html);
  $(id).innerHTML = html;
  return true;
}

const T = globalThis.HYPERSCALE_HOSTED ? artifactTransport() : serverTransport();
let lobby = null, game = null;
const ui = {
  mode: null, tradeTab: 'market', bankGive: null, bankGet: null,
  offer: { give: {}, get: {} }, discard: {}, modal: null, pick: [], logTab: 'log',
  seenChat: 0, dismissedEnd: -1, lastLogN: -1,
};

// ------------------------------------------------------------ networking
const call = (verb, body = {}) => T.call(verb, body).catch(e => toast(e.message));
const act = action => call('action', { action });
function toast(msg, info = false) {
  const t = $('toast');
  t.textContent = msg; t.className = `toast${info ? ' info' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3500);
}
function savedName() { try { return localStorage.getItem('hyperscale:name') || ''; } catch { return ''; } }
function saveName(n) { try { localStorage.setItem('hyperscale:name', n); } catch { /* ignore */ } }
function onUpdate(data) { lobby = data.lobby; game = data.game; render(); }

// ------------------------------------------------------------ routing
function show(id) {
  for (const s of ['home', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id);
}

let tablesUnsub = null;
function showHome() {
  lobby = null; game = null;
  show('home');
  $('home-tables').classList.toggle('hidden', !T.watchTables);
  if (T.watchTables && !tablesUnsub) tablesUnsub = T.watchTables(renderTables);
}
function renderTables({ mine, open }) {
  const row = (t, label) => `<li><span class="grow"><b>${esc(t.host)}'s table</b> <span class="code small">${esc(t.code)}</span><br>
    <span class="muted">${t.players.map(esc).join(', ')} · ${t.mode === 'classic' ? 'Classic' : 'Quick'} · ${t.status === 'playing' ? 'in progress' : 'waiting to start'}</span></span>
    <button class="small primary" data-table="${esc(t.code)}">${label}</button></li>`;
  setHTML('tables-mine', mine.length ? mine.map(t => row(t, 'Return')).join('') : '<li class="muted">None yet.</li>');
  setHTML('tables-open', open.length ? open.map(t => row(t, 'Join')).join('') : '<li class="muted">No open tables right now. Create one and invite your friends.</li>');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-table]');
  if (!b) return;
  $('home-code').value = b.dataset.table;
  $('btn-join').click();
});

async function boot() {
  $('home-name').value = savedName();
  document.body.classList.toggle('hosted', !!T.hosted);
  if (T.hosted) for (const l of document.querySelectorAll('a[href^="/"]')) l.setAttribute('href', l.getAttribute('href').slice(1));
  let r;
  try { r = await T.init(onUpdate); } catch (e) { r = { screen: 'error', error: e.message }; }
  if (r.screen === 'room') return;
  showHome();
  if (r.code) { $('home-code').value = r.code; $('home-name').focus(); }
  if (r.screen === 'error') {
    $('home-error').textContent = r.error;
    for (const id of ['btn-create', 'btn-join']) $(id).disabled = true;
  }
}

$('btn-create').onclick = async () => {
  const name = $('home-name').value.trim();
  if (!name) { $('home-error').textContent = 'Enter your name first.'; return; }
  saveName(name);
  $('btn-create').disabled = true;
  try { await T.create(name); } catch (e) { $('home-error').textContent = e.message; }
  $('btn-create').disabled = false;
};
$('btn-join').onclick = async () => {
  const name = $('home-name').value.trim();
  const c = $('home-code').value.trim().toUpperCase();
  if (!name) { $('home-error').textContent = 'Enter your name first.'; $('home-name').focus(); return; }
  if (c.length !== 5) { $('home-error').textContent = 'Room codes are 5 characters.'; return; }
  saveName(name);
  try { await T.join(c, name); }
  catch (e) {
    if (e.spectating) { toast('That game already started: you are watching.', true); return; }
    $('home-error').textContent = e.message;
  }
};
$('home-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
window.addEventListener('popstate', () => { if (!T.hosted) location.reload(); });

// ------------------------------------------------------------ lobby
$('btn-copy').onclick = async () => {
  const link = $('lobby-link').value;
  try { await navigator.clipboard.writeText(link); toast('Copied', true); }
  catch { $('lobby-link').select(); }
};
$('btn-addbot').onclick = () => call('addBot', { profile: $('bot-profile').value });
$('btn-start').onclick = () => call('start');
$('opt-mode').onchange = () => call('options', { options: { mode: $('opt-mode').value } });
$('opt-headlines').onchange = () => call('options', { options: { headlines: $('opt-headlines').checked } });
$('opt-friendly').onchange = () => call('options', { options: { friendlyRegulator: $('opt-friendly').checked } });
$('lobby-seats').onclick = e => {
  const b = e.target.closest('[data-remove]');
  if (b) call('removeSeat', { seat: +b.dataset.remove });
};
for (const id of ['btn-leave', 'btn-home']) $(id).onclick = async () => {
  if (lobby && lobby.you >= 0 && !lobby.isHost && !lobby.started) await T.call('leave').catch(() => {});
  T.leaveTable();
  showHome();
};

function renderLobby() {
  show('lobby');
  $('lobby-code').textContent = lobby.code;
  const link = T.shareLink ? T.shareLink(lobby.code) : `Join code ${lobby.code}`;
  $('lobby-link').value = link;
  $('share-hint').textContent = T.shareLink
    ? 'Send this link to friends. Up to 4 players; fill empty seats with bots.'
    : 'Friends open this same page, enter the code (or pick your table from the list), and join. Up to 4 players; fill empty seats with bots.';
  setHTML('lobby-seats', lobby.seats.map(s => `
    <li><span class="dot" style="background:${s.color}"></span>
      <span class="grow">${esc(s.name)} ${s.seat === lobby.you ? '<span class="badge on">you</span>' : ''} ${s.seat === lobby.host ? '<span class="badge">host</span>' : ''}
      ${s.bot ? `<span class="badge">${esc(s.bot)}</span>` : (s.connected ? '' : '<span class="badge">offline</span>')}</span>
      ${lobby.isHost && s.seat !== lobby.host ? `<button class="small danger" data-remove="${s.seat}">Remove</button>` : ''}
    </li>`).join('') + Array.from({ length: 4 - lobby.seats.length }, () => `<li class="muted"><span class="dot" style="background:transparent"></span>Empty seat</li>`).join(''));
  $('lobby-host').classList.toggle('hidden', !lobby.isHost);
  $('lobby-wait').classList.toggle('hidden', lobby.isHost);
  $('opt-mode').value = lobby.options.mode;
  $('opt-mode-note').textContent = `First to ${lobby.options.vpToWin} points.`;
  $('opt-headlines').checked = lobby.options.headlines;
  $('opt-friendly').checked = lobby.options.friendlyRegulator;
  $('btn-addbot').disabled = lobby.seats.length >= 4;
  $('btn-start').disabled = lobby.seats.length < 2;
}

// ------------------------------------------------------------ helpers
const me = () => (game && lobby.you >= 0 ? game.players[lobby.you] : null);
const isMyTurn = () => game && game.phase !== 'ended' && game.current === lobby.you;
const P = id => game.players[id];
const pn = id => `<b style="color:${P(id).color}">${esc(P(id).name)}</b>`;
function stageLabel() {
  const g = game, you = lobby.you;
  if (g.phase === 'ended') return `🏆 ${pn(g.winner)} wins the race to hyperscale!`;
  if (g.phase === 'setup') {
    const what = g.setup.step === 'settlement' ? 'place a Data Center' : 'place a Fiber Line next to it';
    return isMyTurn() ? `<span class="you">Setup: ${what}</span>` : `Setup: ${pn(g.current)} is placing…`;
  }
  const t = g.turn;
  switch (t.stage) {
    case 'preroll': return isMyTurn() ? `<span class="you">Your turn: roll the dice</span>` : `${pn(g.current)}'s turn`;
    case 'discard': return t.discards[you] ? `<span class="you">Audit! Discard ${t.discards[you]} resources</span>` : `Waiting for ${Object.keys(t.discards).map(i => pn(+i)).join(', ')} to discard…`;
    case 'regulator': return isMyTurn() ? `<span class="you">Move the Regulator: click a region</span>` : `${pn(g.current)} is moving the Regulator…`;
    case 'steal': return isMyTurn() ? `<span class="you">Choose who to take a resource from</span>` : `${pn(g.current)} is choosing a target…`;
    case 'roadBuilding': return isMyTurn() ? `<span class="you">Place ${t.freeRoads} free Fiber Line${t.freeRoads > 1 ? 's' : ''}</span>` : `${pn(g.current)} is rolling out fiber…`;
    default: return isMyTurn() ? `<span class="you">Build, trade, or end your turn</span>` : `${pn(g.current)} is building and trading…`;
  }
}

// ------------------------------------------------------------ board
const terrainGrad = Object.entries(TERRAIN_INFO).map(([t, i]) =>
  `<radialGradient id="g-${t}" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="${i.color}" stop-opacity="1"/><stop offset="100%" stop-color="${shade(i.color, -28)}"/></radialGradient>`).join('');
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + c * pct / 100)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

function boardInteractions() {
  const g = game, you = lobby.you;
  const out = { vertices: [], edges: [], cities: [], hexes: [] };
  if (!isMyTurn()) return out;
  if (g.phase === 'setup') {
    if (g.setup.step === 'settlement') out.vertices = legalSettlementVertices(g, you, true);
    else out.edges = legalRoadEdges(g, you, g.setup.lastVertex);
    return out;
  }
  const st = g.turn.stage;
  if (st === 'regulator') {
    const anyOpen = g.hexes.some(h => h.id !== g.regulator && !protectedHex(g, you, h.id));
    out.hexes = g.hexes.filter(h => h.id !== g.regulator && (!anyOpen || !protectedHex(g, you, h.id))).map(h => h.id);
  } else if (st === 'roadBuilding') out.edges = legalRoadEdges(g, you);
  else if (st === 'main') {
    if (ui.mode === 'road') out.edges = legalRoadEdges(g, you);
    if (ui.mode === 'settlement') out.vertices = legalSettlementVertices(g, you);
    if (ui.mode === 'city') out.cities = legalCityVertices(g, you);
  }
  return out;
}

function renderBoard() {
  const g = game;
  const V = TOPO.vertices;
  const hot = g.lastRoll && g.lastRoll.total !== 7 ? g.lastRoll.total : null;
  const parts = [];
  parts.push(`<defs>${terrainGrad}
    <radialGradient id="seaGrad" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#155e75"/><stop offset="100%" stop-color="#0b2540"/></radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation=".08" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="grid" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M .5 0 L 0 0 0 .5" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width=".02"/></pattern></defs>`);
  // sea (flat-top hexagon around the island)
  const R = 5.95;
  const sea = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i; return `${R * Math.cos(a)},${R * Math.sin(a)}`; }).join(' ');
  parts.push(`<polygon class="sea" points="${sea}" stroke="#0e7490" stroke-width=".06" stroke-linejoin="round"/><polygon points="${sea}" fill="url(#grid)"/>`);

  // ports
  for (const p of g.ports) {
    const a = V[p.vertices[0]], b = V[p.vertices[1]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const len = Math.hypot(mx, my);
    const px = mx / len * (len + 0.62), py = my / len * (len + 0.62);
    parts.push(`<line class="port-line" x1="${a.x}" y1="${a.y}" x2="${px}" y2="${py}"/><line class="port-line" x1="${b.x}" y1="${b.y}" x2="${px}" y2="${py}"/>`);
    const title = p.type === 'any' ? 'Spot Market: trade 3 identical resources for 1' : `${RESOURCE_INFO[p.type].name} Supplier: trade 2 ${RESOURCE_INFO[p.type].name} for 1`;
    parts.push(`<g><title>${title}</title><circle class="port" cx="${px}" cy="${py}" r=".34"/>`);
    if (p.type === 'any') parts.push(`<text class="port-text" x="${px}" y="${py}">3:1</text>`);
    else parts.push(`<text class="port-icon" x="${px}" y="${py - 0.08}">${ICON(p.type)}</text><text class="port-text" x="${px}" y="${py + 0.15}" style="font-size:.13px">2:1</text>`);
    parts.push(`</g>`);
  }

  // hexes
  for (const h of g.hexes) {
    const th = TOPO.hexes[h.id];
    const pts = th.vertices.map(v => `${V[v].x},${V[v].y}`).join(' ');
    const info = TERRAIN_INFO[h.terrain];
    const isHot = hot && h.number === hot;
    parts.push(`<g><title>${info.name}${h.number ? ` (${h.number})` : ''}: ${info.resource ? `produces ${RESOURCE_INFO[info.resource].name}` : 'produces nothing'}</title>
      <polygon class="hex${isHot ? ' hot' : ''}" points="${pts}" fill="url(#g-${h.terrain})" ${isHot ? 'stroke="#fff" stroke-width=".08"' : ''}/>
      <text class="hex-icon" x="${th.x}" y="${th.y - 0.48}">${info.icon}</text>`);
    if (h.number) {
      const red = h.number === 6 || h.number === 8;
      parts.push(`<circle class="token" cx="${th.x}" cy="${th.y + 0.12}" r=".31"/>
        <text class="token-num${red ? ' red' : ''}" x="${th.x}" y="${th.y + 0.07}">${h.number}</text>`);
      const n = PIPS[h.number];
      for (let i = 0; i < n; i++) parts.push(`<circle class="pip${red ? ' red' : ''}" cx="${th.x + (i - (n - 1) / 2) * 0.075}" cy="${th.y + 0.28}" r=".022"/>`);
    }
    parts.push(`</g>`);
  }

  // regulator
  {
    const th = TOPO.hexes[g.regulator];
    const x = th.x + (g.hexes[g.regulator].number ? 0.52 : 0), y = th.y + (g.hexes[g.regulator].number ? 0.12 : 0.15);
    parts.push(`<g class="regulator"><title>The Regulator: this region produces nothing</title>
      <circle cx="${x}" cy="${y}" r=".26" fill="#111827" stroke="#f8fafc" stroke-width=".04"/>
      <text class="hex-icon" x="${x}" y="${y + 0.01}" style="font-size:.3px">⚖️</text></g>`);
  }

  // roads
  for (const [e, owner] of Object.entries(g.roads)) {
    const ed = TOPO.edges[e];
    const [x1, y1, x2, y2] = shorten(V[ed.a], V[ed.b], 0.14);
    parts.push(`<line class="road-outline" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line class="road" stroke="${P(owner).color}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  // buildings
  for (const [v, b] of Object.entries(g.buildings)) {
    const { x, y } = V[v];
    const c = P(b.owner).color;
    if (b.type === 'settlement') {
      parts.push(`<g><title>${esc(P(b.owner).name)}'s Data Center</title><rect class="bldg" x="${x - 0.17}" y="${y - 0.17}" width=".34" height=".34" rx=".05" fill="${c}"/>
        <line class="bldg-line" x1="${x - 0.11}" x2="${x + 0.11}" y1="${y - 0.06}" y2="${y - 0.06}"/><line class="bldg-line" x1="${x - 0.11}" x2="${x + 0.11}" y1="${y + 0.04}" y2="${y + 0.04}"/>
        <circle cx="${x + 0.09}" cy="${y + 0.11}" r=".025" fill="#22c55e"/></g>`);
    } else {
      parts.push(`<g><title>${esc(P(b.owner).name)}'s Hyperscale Campus</title>
        <rect class="bldg" x="${x - 0.27}" y="${y - 0.2}" width=".54" height=".4" rx=".05" fill="${c}"/>
        <rect class="bldg" x="${x - 0.16}" y="${y - 0.34}" width=".14" height=".16" fill="${c}"/><rect class="bldg" x="${x + 0.03}" y="${y - 0.34}" width=".14" height=".16" fill="${c}"/>
        <line class="bldg-line" x1="${x - 0.2}" x2="${x + 0.2}" y1="${y - 0.08}" y2="${y - 0.08}"/><line class="bldg-line" x1="${x - 0.2}" x2="${x + 0.2}" y1="${y + 0.02}" y2="${y + 0.02}"/><line class="bldg-line" x1="${x - 0.2}" x2="${x + 0.2}" y1="${y + 0.12}" y2="${y + 0.12}"/>
        <circle cx="${x + 0.19}" cy="${y + 0.14}" r=".03" fill="#22c55e"/></g>`);
    }
  }

  // interaction overlays
  const ix = boardInteractions();
  for (const h of ix.hexes) {
    const th = TOPO.hexes[h];
    parts.push(`<polygon class="hex-pick" data-hex="${h}" points="${th.vertices.map(v => `${V[v].x},${V[v].y}`).join(' ')}"/>`);
  }
  // Visible markers plus larger invisible hit areas for fingers.
  for (const e of ix.edges) {
    const ed = TOPO.edges[e];
    const [x1, y1, x2, y2] = shorten(V[ed.a], V[ed.b], 0.2);
    parts.push(`<line class="edge-spot" data-edge="${e}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    parts.push(`<line class="hit" data-edge="${e}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width=".38"/>`);
  }
  for (const v of ix.vertices) {
    parts.push(`<circle class="spot" data-vertex="${v}" cx="${V[v].x}" cy="${V[v].y}" r=".17"/>`);
    parts.push(`<circle class="hit" data-vertex="${v}" cx="${V[v].x}" cy="${V[v].y}" r=".3" fill="transparent"/>`);
  }
  for (const v of ix.cities) parts.push(`<circle class="city-spot" data-city="${v}" cx="${V[v].x}" cy="${V[v].y}" r=".34"/>`);
  setHTML('board', parts.join(''));
}
function shorten(a, b, d) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return [a.x + dx / L * d, a.y + dy / L * d, b.x - dx / L * d, b.y - dy / L * d];
}

$('board').addEventListener('click', e => {
  const t = e.target;
  if (!game || !isMyTurn()) return;
  if (t.dataset.vertex !== undefined) { act({ type: 'buildSettlement', vertex: +t.dataset.vertex }); ui.mode = null; }
  else if (t.dataset.edge !== undefined) { act({ type: 'buildRoad', edge: +t.dataset.edge }); if (game.phase === 'main' && game.turn.stage === 'main') keepRoadMode(); }
  else if (t.dataset.city !== undefined) { act({ type: 'buildCity', vertex: +t.dataset.city }); ui.mode = null; }
  else if (t.dataset.hex !== undefined) act({ type: 'moveRegulator', hex: +t.dataset.hex });
});
function keepRoadMode() {
  // stay in road mode only if the player can afford another one
  const m = me();
  const after = { ...m.resources };
  for (const [r, n] of Object.entries(costOf(game, 'road'))) after[r] -= n;
  if (!canAfford(after, costOf(game, 'road'))) ui.mode = null;
}

// ------------------------------------------------------------ side panels
function renderDice() {
  const r = game.lastRoll;
  setHTML('dice', r ? `<div class="die">${DIE[r.dice[0]]}</div><div class="die">${DIE[r.dice[1]]}</div><div class="total">${r.total}</div>` : '');
  setHTML('bank', `Bank: ${RESOURCES.map(x => `${ICON(x)}${game.bank[x]}`).join(' ')} · R&D deck ${game.devDeckCount}`);
}

function renderHeadline() {
  const h = game.headline;
  setHTML('headline', h ? `<div class="headline-card" title="Headlines change every round">
    <div class="kicker">📰 Round ${h.round} headline</div><div class="title">${esc(h.name)}</div><div class="text">${esc(h.text)}</div></div>` : '');
}

function renderPlayers() {
  const g = game;
  const lr = g.longestRoad.lengths || [];
  setHTML('players', g.players.map(p => {
    const seat = lobby.seats[p.id];
    const online = !seat || seat.connected;
    const vp = p.vp !== undefined ? p.vp : p.publicVP;
    const hiddenNote = p.vp !== undefined && p.vp !== p.publicVP ? `<small>${p.publicVP} public</small>` : '<small>VP</small>';
    return `<div class="prow ${g.current === p.id && g.phase !== 'ended' ? 'current' : ''} ${online ? '' : 'offline'}">
      <div class="bar" style="background:${p.color}"></div>
      <div><div class="name">${esc(p.name)}${p.id === lobby.you ? ' <span class="badge on">you</span>' : ''}${online ? '' : ' <span class="badge">offline</span>'}
        ${g.longestRoad.holder === p.id ? '<span class="award" title="Largest Network">🌐 Network</span>' : ''}
        ${g.largestArmy.holder === p.id ? '<span class="award inf" title="Most Influence">🏛️ Influence</span>' : ''}</div>
        <div class="meta"><span title="Resource cards">🃏 ${p.resourceCount}</span><span title="R&D cards in hand">🔬 ${p.devCount}</span>
        <span title="Lobbyists played">🕴️ ${p.playedDev.lobbyist}</span><span title="Longest fiber chain">🌐 ${lr[p.id] || 0}</span>
        ${lobby.isHost && !online && !p.bot && g.phase !== 'ended' ? `<button class="small" data-botify="${p.id}" title="Let a bot play this seat so the game can continue">🤖 Bot takes over</button>` : ''}</div></div>
      <div class="vp">${vp}${hiddenNote}</div></div>`;
  }).join(''));
}

function renderMe() {
  const m = me();
  if (!m) { setHTML('me', '<div class="muted">You are watching this game.</div>'); return; }
  const g = game, t = g.turn;
  const myTurn = isMyTurn();
  const main = myTurn && g.phase === 'main' && t.stage === 'main';
  const hand = RESOURCES.map(r => `<div class="rcard ${m.resources[r] ? '' : 'zero'}" style="background:${RESOURCE_INFO[r].color}">
    <div class="ico">${ICON(r)}</div><div class="n">${m.resources[r]}</div><div class="lbl">${RESOURCE_INFO[r].name}</div></div>`).join('');
  const canRoll = myTurn && g.phase === 'main' && t.stage === 'preroll';
  const builds = [
    ['road', 'road', m.pieces.road, legalRoadEdges(g, m.id).length > 0],
    ['settlement', 'settlement', m.pieces.settlement, legalSettlementVertices(g, m.id).length > 0 && !isBanned(g, 'settlement')],
    ['city', 'city', m.pieces.city, legalCityVertices(g, m.id).length > 0],
    ['dev', 'dev', g.devDeckCount, g.devDeckCount > 0],
  ].map(([kind, key, left, legal]) => {
    const cost = costOf(g, key);
    const ok = main && left > 0 && legal && canAfford(m.resources, cost);
    const discounted = cost !== BUILDINGS[key].cost;
    return `<button class="build ${ui.mode === kind ? 'active' : ''}" data-build="${kind}" ${ok ? '' : 'disabled'} title="${esc(BUILDINGS[key].blurb)}">
      <span class="bname">${BUILDINGS[key].name}${discounted ? ' 🏷️' : ''}</span><span class="cost">${costIcons(cost)}</span>
      <span class="left">${kind === 'dev' ? `${left} in deck` : `${left} left`}</span></button>`;
  }).join('');
  const playable = playableDevCards(g, m.id);
  const groups = {};
  for (const c of m.devCards) {
    const k = c.type === 'vp' ? `vp:${c.variant}` : c.type;
    (groups[k] ||= { ...c, n: 0, fresh: 0 }).n++;
    if (c.boughtTurn === g.turnNumber) groups[k].fresh++;
  }
  const devs = Object.values(groups).map(c => {
    const info = DEV_CARDS[c.type];
    const name = c.type === 'vp' ? c.variant : info.name;
    const can = c.type !== 'vp' && playable.includes(c.type) && c.n > c.fresh;
    return `<div class="dev ${c.fresh === c.n && c.type !== 'vp' ? 'new' : ''}"><div class="grow"><div class="dname">${c.type === 'vp' ? '🏆' : c.type === 'lobbyist' ? '🕴️' : '🔬'} ${esc(name)}${c.n > 1 ? ` ×${c.n}` : ''}</div>
      <div class="dtext">${esc(c.type === 'vp' ? '+1 VP, hidden from other players.' : info.text)}${c.fresh && c.type !== 'vp' ? ' <i>(new: playable next turn)</i>' : ''}</div></div>
      ${c.type !== 'vp' ? `<button class="small" data-play="${c.type}" ${can ? '' : 'disabled'}>Play</button>` : ''}</div>`;
  }).join('');
  setHTML('me', `<h3>Your operation</h3><div class="hand">${hand}</div>
    <div class="actions"><button class="primary" id="btn-roll" ${canRoll ? '' : 'disabled'}>🎲 Roll</button>
      <button id="btn-end" ${main ? '' : 'disabled'}>End turn ⏭</button></div>
    <div class="builds">${builds}</div>
    ${ui.mode ? `<div class="muted" style="margin-top:6px">Click a glowing spot on the board, or <a href="#" id="cancel-mode">cancel</a>.</div>` : ''}
    ${devs ? `<div class="devs">${devs}</div>` : ''}`);
}

// Two-tap confirm (artifact frames block confirm() dialogs).
$('players').addEventListener('click', e => {
  const b = e.target.closest('[data-botify]');
  if (!b) return;
  if (b.dataset.armed) return call('botify', { seat: +b.dataset.botify });
  b.dataset.armed = '1';
  b.textContent = `Tap again: a bot plays for ${P(+b.dataset.botify).name}`;
  setTimeout(() => { delete b.dataset.armed; htmlCache.delete('players'); render(); }, 4000);
});

// Rules and card gallery as in-page overlays (used by the hosted version).
async function openDoc(kind) {
  let html;
  if (kind === 'rules') {
    try { html = `<div class="doc">${renderMarkdown(await (await fetch('RULES.md')).text())}</div>`; }
    catch { html = '<p>Could not load the rules.</p>'; }
  } else {
    if (!document.getElementById('card-css')) document.head.insertAdjacentHTML('beforeend', `<style id="card-css">${CARD_CSS}</style>`);
    html = `<div class="gallery">${cardsHTML()}</div>`;
  }
  $('doc-body').innerHTML = html;
  $('doc').classList.remove('hidden');
  $('doc-body').scrollTop = 0;
}
$('doc-close').onclick = () => $('doc').classList.add('hidden');
document.addEventListener('click', e => {
  const a = e.target.closest('a[href$="rules.html"], a[href$="cards.html"]');
  if (!a || !T.hosted) return;
  e.preventDefault();
  openDoc(a.getAttribute('href').includes('rules') ? 'rules' : 'cards');
});
$('me').addEventListener('click', e => {
  const b = e.target.closest('button, a');
  if (!b) return;
  if (b.id === 'btn-roll') return act({ type: 'roll' });
  if (b.id === 'btn-end') { ui.mode = null; return act({ type: 'endTurn' }); }
  if (b.id === 'cancel-mode') { e.preventDefault(); ui.mode = null; return render(); }
  if (b.dataset.build) {
    const k = b.dataset.build;
    if (k === 'dev') return act({ type: 'buyDev' });
    ui.mode = ui.mode === k ? null : k;
    return render();
  }
  if (b.dataset.play) {
    const c = b.dataset.play;
    if (c === 'venture' || c === 'squeeze') { ui.modal = c; ui.pick = []; return render(); }
    return act({ type: 'playDev', card: c });
  }
});

function stepper(side, r) {
  const n = ui.offer[side][r] || 0;
  return `<div class="stepper"><button class="small" data-step="${side}:${r}:-1">−</button><span>${n}</span><button class="small" data-step="${side}:${r}:1">+</button></div>`;
}

function renderTrade() {
  const m = me(), g = game;
  if (!m || g.phase !== 'main') { setHTML('trade', ''); $('trade').classList.add('hidden'); return; }
  $('trade').classList.remove('hidden');
  const myMain = isMyTurn() && g.turn.stage === 'main';
  const rates = RESOURCES.map(r => `${ICON(r)}${tradeRatio(g, m.id, r)}:1`).join(' ');
  let body = '';
  if (!myMain) {
    body = `<div class="muted">Trading opens on your turn after you roll. Your market rates: ${rates}</div>`;
  } else if (g.trade) {
    const tr = g.trade;
    const rows = g.players.filter(p => p.id !== m.id).map(p => {
      const r = tr.responses[p.id];
      return `<div>${pn(p.id)}: ${r === 'accept' ? `<button class="small primary" data-accept="${p.id}">Trade with them</button>` : r === 'decline' ? 'declined' : '<i>thinking…</i>'}</div>`;
    }).join('');
    body = `<div class="offer">You offer <b>${bundle(tr.give)}</b> for <b>${bundle(tr.get)}</b>${rows}<div class="row"><button class="small" data-cancel-trade>Cancel offer</button></div></div>`;
  } else {
    const tabs = `<div class="tabs"><button class="tab ${ui.tradeTab === 'market' ? 'active' : ''}" data-ttab="market">Market</button><button class="tab ${ui.tradeTab === 'players' ? 'active' : ''}" data-ttab="players">Players</button></div>`;
    if (ui.tradeTab === 'market') {
      const gives = RESOURCES.filter(r => m.resources[r] >= tradeRatio(g, m.id, r));
      if (!gives.includes(ui.bankGive)) ui.bankGive = gives[0] || null;
      if (!ui.bankGet || ui.bankGet === ui.bankGive) ui.bankGet = RESOURCES.find(r => r !== ui.bankGive);
      body = tabs + `<div class="muted" style="margin-bottom:6px">Your rates: ${rates}</div>` + (gives.length ? `<div class="bank-row">Give
        <select id="bank-give">${gives.map(r => `<option value="${r}" ${r === ui.bankGive ? 'selected' : ''}>${tradeRatio(g, m.id, r)} ${ICON(r)} ${RESOURCE_INFO[r].name}</option>`).join('')}</select> get
        <select id="bank-get">${RESOURCES.filter(r => r !== ui.bankGive).map(r => `<option value="${r}" ${r === ui.bankGet ? 'selected' : ''}>1 ${ICON(r)} ${RESOURCE_INFO[r].name}</option>`).join('')}</select>
        <button class="small primary" id="btn-bank">Trade</button></div>` : `<div class="muted">You don't have enough of any resource to trade with the market.</div>`);
    } else {
      const head = `<div></div>${RESOURCES.map(r => `<div class="rh" title="${RESOURCE_INFO[r].name}">${ICON(r)}</div>`).join('')}`;
      body = tabs + `<div class="trade-grid">${head}<div>Give</div>${RESOURCES.map(r => stepper('give', r)).join('')}<div>Get</div>${RESOURCES.map(r => stepper('get', r)).join('')}</div>
        <div class="row" style="display:flex;gap:6px;margin-top:8px"><button class="small primary" id="btn-offer">Offer to everyone</button><button class="small" id="btn-clear-offer">Clear</button></div>`;
    }
  }
  setHTML('trade', `<h3>Trade</h3>${body}`);
}
const bundle = b => RESOURCES.filter(r => b[r]).map(r => `${b[r]}${ICON(r)}`).join(' ');

$('trade').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ttab) { ui.tradeTab = b.dataset.ttab; return render(); }
  if (b.id === 'btn-bank') return act({ type: 'bankTrade', give: $('bank-give').value, get: $('bank-get').value });
  if (b.dataset.step) {
    const [side, r, d] = b.dataset.step.split(':');
    const other = side === 'give' ? 'get' : 'give';
    const n = Math.max(0, (ui.offer[side][r] || 0) + +d);
    if (side === 'give' && n > me().resources[r]) return;
    ui.offer[side][r] = n;
    if (n) ui.offer[other][r] = 0;
    return render();
  }
  if (b.id === 'btn-clear-offer') { ui.offer = { give: {}, get: {} }; return render(); }
  if (b.id === 'btn-offer') return act({ type: 'offerTrade', give: ui.offer.give, get: ui.offer.get });
  if (b.dataset.accept !== undefined) { ui.offer = { give: {}, get: {} }; return act({ type: 'acceptTrade', with: +b.dataset.accept }); }
  if (b.dataset.cancelTrade !== undefined) return act({ type: 'cancelTrade' });
});
$('trade').addEventListener('change', e => {
  if (e.target.id === 'bank-give') { ui.bankGive = e.target.value; render(); }
  if (e.target.id === 'bank-get') ui.bankGet = e.target.value;
});

function renderOfferBanner() {
  const g = game, m = me(), tr = g.trade;
  if (!tr || !m || tr.from === m.id || g.phase !== 'main') { setHTML('offer-banner', ''); return; }
  const resp = tr.responses[m.id];
  const can = canAfford(m.resources, tr.get);
  setHTML('offer-banner', `<div class="offer">${pn(tr.from)} offers <b>${bundle(tr.give)}</b> for your <b>${bundle(tr.get)}</b>
    <div class="row">${resp ? `<span class="muted">You ${resp === 'accept' ? 'accepted. Waiting for them to confirm…' : 'declined.'}</span>` :
      `<button class="small primary" data-respond="1" ${can ? '' : 'disabled title="You do not have those resources"'}>Accept</button><button class="small" data-respond="0">Decline</button>`}</div></div>`);
}
$('offer-banner').addEventListener('click', e => {
  const b = e.target.closest('[data-respond]');
  if (b) act({ type: 'respondTrade', tradeId: game.trade.id, accept: b.dataset.respond === '1' });
});

function renderLog() {
  const box = $('log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = game.log.map(l => `<div class="entry ${l.msg.startsWith('📰') ? 'headline' : ''}" style="border-color:${l.pid !== null && l.pid !== undefined ? P(l.pid).color : 'transparent'}">${esc(l.msg)}</div>`).join('');
  if (atBottom || ui.lastLogN === -1) box.scrollTop = box.scrollHeight;
  ui.lastLogN = game.log.length;
}
function renderChat() {
  const box = $('chat');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.innerHTML = lobby.chat.map(c => `<div class="entry" style="border-color:${lobby.seats[c.seat]?.color || '#888'}"><b>${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('') || '<div class="muted">No messages yet.</div>';
  if (atBottom) box.scrollTop = box.scrollHeight;
  const unread = lobby.chat.length - ui.seenChat;
  if (ui.logTab === 'chat') ui.seenChat = lobby.chat.length;
  $('chat-badge').textContent = ui.logTab !== 'chat' && unread > 0 ? `(${unread})` : '';
}
document.querySelector('.logpanel .tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  ui.logTab = b.dataset.tab;
  document.querySelectorAll('.logpanel .tab').forEach(x => x.classList.toggle('active', x === b));
  $('log').classList.toggle('hidden', ui.logTab !== 'log');
  $('chat').classList.toggle('hidden', ui.logTab !== 'chat');
  $('chat-form').classList.toggle('hidden', ui.logTab !== 'chat');
  render();
  if (ui.logTab === 'chat') { $('chat').scrollTop = $('chat').scrollHeight; $('chat-input').focus(); }
});
$('chat-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  $('chat-input').value = '';
  await call('chat', { text });
});

// ------------------------------------------------------------ modals
function renderModal() {
  const g = game, m = me();
  let html = '';
  if (g.phase === 'ended' && ui.dismissedEnd !== lobby.gameNumber) {
    const rows = g.players.slice().sort((a, b) => b.vp - a.vp).map(p => {
      const vpCards = p.devCards.filter(c => c.type === 'vp').map(c => c.variant);
      return `<tr><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td><td><b>${p.vp}</b></td>
        <td class="muted">${[g.longestRoad.holder === p.id ? 'Largest Network' : '', g.largestArmy.holder === p.id ? 'Most Influence' : '', ...vpCards].filter(Boolean).map(esc).join(', ')}</td></tr>`;
    }).join('');
    html = `<h2>🏆 ${esc(P(g.winner).name)} wins!</h2><div class="muted">After ${Math.ceil(g.turnNumber / g.players.length)} rounds.</div>
      <table class="scores"><tr><th>Player</th><th>VP</th><th>Bonuses</th></tr>${rows}</table>
      <div class="row">${lobby.isHost ? '<button class="primary" id="btn-rematch">Rematch (same table)</button>' : '<span class="muted">The host can start a rematch.</span>'}<button id="btn-close-modal">View board</button></div>`;
  } else if (m && g.phase === 'main' && g.turn.stage === 'discard' && g.turn.discards[m.id]) {
    const need = g.turn.discards[m.id];
    for (const r of RESOURCES) ui.discard[r] = Math.min(ui.discard[r] || 0, m.resources[r]);
    const sel = RESOURCES.reduce((s, r) => s + (ui.discard[r] || 0), 0);
    html = `<h2>📋 Regulatory audit</h2><p>You hold more than ${g.options.discardLimit} resources. Return <b>${need}</b> to the bank.</p>
      <div class="pick-grid">${RESOURCES.map(r => `<div style="text-align:center"><div style="font-size:22px">${ICON(r)}</div><div>${ui.discard[r] || 0} / ${m.resources[r]}</div>
        <div class="stepper"><button class="small" data-disc="${r}:-1">−</button><button class="small" data-disc="${r}:1">+</button></div></div>`).join('')}</div>
      <div class="row"><button class="primary" id="btn-discard" ${sel === need ? '' : 'disabled'}>Discard ${sel}/${need}</button></div>`;
  } else if (isMyTurn() && g.phase === 'main' && g.turn.stage === 'steal') {
    html = `<h2>🕴️ Who do you take from?</h2><div class="row">${g.turn.stealCandidates.map(id => `<button data-steal="${id}">${pn(id)} (${P(id).resourceCount} cards)</button>`).join('')}</div>`;
  } else if (ui.modal === 'venture' || ui.modal === 'squeeze') {
    const venture = ui.modal === 'venture';
    const need = venture ? 2 : 1;
    html = `<h2>${venture ? '💰 Venture Round' : '📦 Supply Squeeze'}</h2><p>${esc(DEV_CARDS[ui.modal].text)}</p>
      <div class="pick-grid">${RESOURCES.map(r => `<button data-pick="${r}" class="${ui.pick.includes(r) ? 'sel' : ''}"><span style="font-size:22px">${ICON(r)}</span>${RESOURCE_INFO[r].name}${venture ? `<small>${ui.pick.filter(x => x === r).length || ''}</small>` : ''}</button>`).join('')}</div>
      <div class="muted" style="margin-top:6px">${venture ? `Picked: ${ui.pick.map(ICON).join(' ') || 'nothing yet'} (click a resource twice to take 2 of it)` : ''}</div>
      <div class="row"><button class="primary" id="btn-confirm-pick" ${ui.pick.length === need ? '' : 'disabled'}>Play card</button><button id="btn-close-modal">Cancel</button></div>`;
  }
  $('modal').classList.toggle('hidden', !html);
  if (html) setHTML('modal-body', html);
}
$('modal').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'btn-close-modal') { if (game.phase === 'ended') ui.dismissedEnd = lobby.gameNumber; ui.modal = null; return render(); }
  if (b.id === 'btn-rematch') return call('start');
  if (b.dataset.disc) {
    const [r, d] = b.dataset.disc.split(':');
    ui.discard[r] = Math.max(0, Math.min(me().resources[r], (ui.discard[r] || 0) + +d));
    return render();
  }
  if (b.id === 'btn-discard') { const res = { ...ui.discard }; ui.discard = {}; return act({ type: 'discard', resources: res }); }
  if (b.dataset.steal !== undefined) return act({ type: 'steal', target: +b.dataset.steal });
  if (b.dataset.pick) {
    const r = b.dataset.pick;
    if (ui.modal === 'squeeze') ui.pick = [r];
    else if (ui.pick.length < 2) ui.pick.push(r); else ui.pick = [r];
    return render();
  }
  if (b.id === 'btn-confirm-pick') {
    const card = ui.modal; ui.modal = null;
    return act(card === 'venture' ? { type: 'playDev', card, resources: ui.pick } : { type: 'playDev', card, resource: ui.pick[0] });
  }
});

// ------------------------------------------------------------ main render
let lastTurnKey = '';
function render() {
  if (!lobby) return;
  if (!lobby.started || !game) { renderLobby(); return; }
  show('game');
  if (game.phase !== 'main' || game.turn?.stage !== 'main' || !isMyTurn()) ui.mode = null;
  $('status').innerHTML = stageLabel();
  $('room-code').textContent = lobby.code;
  renderBoard(); renderDice(); renderHeadline(); renderPlayers(); renderMe(); renderTrade(); renderOfferBanner();
  renderLog(); renderChat(); renderModal();
  const mine = isMyTurn() || (game.turn?.stage === 'discard' && game.turn.discards[lobby.you]);
  document.title = `${mine ? '▶ Your move · ' : ''}HYPERSCALE`;
  const key = `${game.turnNumber}:${game.current}`;
  if (key !== lastTurnKey && isMyTurn() && game.phase === 'main' && lastTurnKey) toast('Your turn!', true);
  lastTurnKey = key;
}

boot();
