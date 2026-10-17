// HYPERSCALE game engine. Pure, deterministic (seeded RNG), no I/O.
// Runs in Node (server, bots, simulations, tests) and in the browser (UI hints).

import { RESOURCES, TERRAIN_INFO, BUILDINGS, DEV_CARDS, PLAYER_COLORS, HEADLINES } from './content.js';

// ---------------------------------------------------------------- RNG
export function nextRandom(state) {
  // mulberry32
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(state, n) { return Math.floor(nextRandom(state) * n); }
function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------- Topology
// Pointy-top hexes in axial coordinates, radius 2 (19 regions).
const SQRT3 = Math.sqrt(3);
function buildTopology(radius = 2) {
  const hexes = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.abs(s) > radius) continue;
      hexes.push({ q, r, x: SQRT3 * (q + r / 2), y: 1.5 * r });
    }
  }
  // Reading order: top row first, left to right.
  hexes.sort((a, b) => a.r - b.r || a.q - b.q);
  hexes.forEach((h, i) => { h.id = i; });

  const vertexKey = new Map();
  const vertices = [];
  const edgeKey = new Map();
  const edges = [];
  const key = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;

  for (const h of hexes) {
    h.vertices = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i - 90); // start at top corner, clockwise
      const x = h.x + Math.cos(ang), y = h.y + Math.sin(ang);
      const k = key(x, y);
      let v = vertexKey.get(k);
      if (v === undefined) {
        v = vertices.length;
        vertexKey.set(k, v);
        vertices.push({ id: v, x, y, hexes: [], edges: [], neighbors: [] });
      }
      vertices[v].hexes.push(h.id);
      h.vertices.push(v);
    }
    h.edges = [];
    for (let i = 0; i < 6; i++) {
      const a = h.vertices[i], b = h.vertices[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = edgeKey.get(k);
      if (e === undefined) {
        e = edges.length;
        edgeKey.set(k, e);
        edges.push({ id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        vertices[a].edges.push(e);
        vertices[b].edges.push(e);
        vertices[a].neighbors.push(b);
        vertices[b].neighbors.push(a);
      }
      edges[e].hexes.push(h.id);
    }
  }
  for (const h of hexes) {
    h.neighbors = hexes.filter(o => o !== h && Math.abs(o.q - h.q) <= 1 && Math.abs(o.r - h.r) <= 1 &&
      Math.abs((-o.q - o.r) - (-h.q - h.r)) <= 1).map(o => o.id);
  }
  // Coastal edges ordered clockwise around the island, for port placement.
  const coast = edges.filter(e => e.hexes.length === 1).map(e => {
    const mx = (vertices[e.a].x + vertices[e.b].x) / 2, my = (vertices[e.a].y + vertices[e.b].y) / 2;
    return { id: e.id, angle: Math.atan2(my, mx) };
  }).sort((a, b) => a.angle - b.angle).map(c => c.id);
  return { hexes, vertices, edges, coast };
}

export const TOPO = buildTopology(2);

// Port slots: 9 coastal edges, spaced so no two share a vertex.
const PORT_SLOTS = [0, 3, 7, 10, 13, 17, 20, 23, 27];

export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// ---------------------------------------------------------------- Helpers
export const emptyHand = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));
export const handSize = hand => RESOURCES.reduce((s, r) => s + (hand[r] || 0), 0);
export function canAfford(hand, cost) {
  return Object.entries(cost).every(([r, n]) => (hand[r] || 0) >= n);
}
function pay(state, player, cost) {
  for (const [r, n] of Object.entries(cost)) {
    player.resources[r] -= n;
    state.bank[r] += n;
  }
}
function fail(msg) { const e = new Error(msg); e.rule = true; throw e; }
function log(state, msg, pid = null) {
  state.log.push({ n: state.log.length, msg, pid, turn: state.turnNumber });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}
const pname = (state, pid) => state.players[pid].name;
const resName = r => r;

// ---------------------------------------------------------------- Setup
export const DEFAULT_OPTIONS = {
  vpToWin: 10,
  discardLimit: 7,
  friendlyRegulator: false, // regulator may not target players with <= 2 public VP
  headlines: true,          // reveal a Headline event card at the start of every round
  terrainCounts: null,      // override region counts (balance experiments)
  costs: null,              // override build costs (balance experiments)
  setupPayoutBoth: false,   // both starting Data Centers pay out (quick game)
  startHand: null,          // extra starting resources for everyone, e.g. {steel:1,...}
  dryRollGrant: 0,          // on a non-7 roll, players who get nothing take this many random resources
};

// Game-length presets offered in the lobby.
export const MODES = {
  quick: {
    label: 'Quick (30–40 min)', vpToWin: 8, setupPayoutBoth: true, dryRollGrant: 1,
    seatBonus: { 2: [0, 1], 3: [0, 1, 2], 4: [0, 0, 1, 2] },
  },
  classic: { label: 'Classic (60–90 min)', vpToWin: 10, setupPayoutBoth: false, dryRollGrant: 0, seatBonus: null },
};

export function createGame({ players, seed = Date.now() >>> 0, options = {} }) {
  if (!players || players.length < 2 || players.length > 4) throw new Error('HYPERSCALE needs 2 to 4 players');
  const state = {
    version: 1,
    seed,
    rng: seed >>> 0,
    options: { ...DEFAULT_OPTIONS, ...options },
    phase: 'setup',
    turnNumber: 0,
    current: 0,
    players: players.map((p, i) => ({
      id: i,
      name: p.name || `Player ${i + 1}`,
      color: p.color || PLAYER_COLORS[i],
      bot: p.bot || null,
      resources: emptyHand(),
      devCards: [],          // {type, variant, boughtTurn}
      playedDev: { lobbyist: 0, fiber: 0, venture: 0, squeeze: 0 },
      pieces: { road: BUILDINGS.road.limit, settlement: BUILDINGS.settlement.limit, city: BUILDINGS.city.limit },
      stats: { produced: emptyHand(), stolen: 0, lostToSteal: 0, discarded: 0, tradesBank: 0, tradesPlayer: 0 },
    })),
    hexes: [],
    ports: [],              // {edge, type: 'any'|resource, vertices:[a,b]}
    buildings: {},          // vertexId -> {owner, type:'settlement'|'city'}
    roads: {},              // edgeId -> owner
    regulator: null,
    bank: Object.fromEntries(RESOURCES.map(r => [r, 19])),
    devDeck: [],
    longestRoad: { holder: null, lengths: [] },
    largestArmy: { holder: null },
    setup: null,
    turn: null,
    trade: null,
    log: [],
    lastRoll: null,
    rollHistory: Object.fromEntries([2,3,4,5,6,7,8,9,10,11,12].map(n => [n, 0])),
    winner: null,
  };
  // Warm up RNG so close seeds diverge.
  for (let i = 0; i < 8; i++) nextRandom(state);
  generateBoard(state);

  // R&D deck
  const deck = [];
  for (const [type, info] of Object.entries(DEV_CARDS)) {
    for (let i = 0; i < info.count; i++) {
      deck.push({ type, variant: info.variants ? info.variants[i % info.variants.length].name : info.name });
    }
  }
  state.devDeck = shuffle(state, deck);
  state.headline = null;
  state.headlineDeck = [];
  state.headlineCount = 0;

  // Snake draft for initial placement, starting from a random player.
  const n = state.players.length;
  const first = randInt(state, n);
  const order = [];
  for (let i = 0; i < n; i++) order.push((first + i) % n);
  for (let i = n - 1; i >= 0; i--) order.push((first + i) % n);
  state.setup = { order, index: 0, step: 'settlement', lastVertex: null };
  state.current = order[0];
  state.firstPlayer = first;
  log(state, `Setup begins. ${pname(state, first)} places first.`);
  return state;
}

function generateBoard(state) {
  const terrains = [];
  const counts = state.options.terrainCounts || {};
  for (const [t, info] of Object.entries(TERRAIN_INFO)) for (let i = 0; i < (counts[t] ?? info.count); i++) terrains.push(t);
  if (terrains.length !== 19) throw new Error('terrain counts must total 19');
  const numbers = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const ts = shuffle(state, terrains.slice());
    const ns = shuffle(state, numbers.slice());
    const hexes = TOPO.hexes.map((h, i) => ({ id: h.id, terrain: ts[i], number: null }));
    let k = 0;
    for (const h of hexes) if (h.terrain !== 'desert') h.number = ns[k++];
    // Red numbers (6, 8) never touch; identical numbers never touch.
    let ok = true;
    for (const h of hexes) {
      for (const nb of TOPO.hexes[h.id].neighbors) {
        const o = hexes[nb];
        if (!h.number || !o.number) continue;
        if ((h.number === 6 || h.number === 8) && (o.number === 6 || o.number === 8)) ok = false;
        if (h.number === o.number) ok = false;
      }
    }
    // Avoid any single resource being concentrated on one hot vertex
    for (const v of TOPO.vertices) {
      const res = v.hexes.map(id => hexes[id].terrain);
      if (res.length === 3 && res[0] === res[1] && res[1] === res[2]) ok = false;
    }
    if (!ok) continue;
    state.hexes = hexes;
    state.regulator = hexes.find(h => h.terrain === 'desert').id;
    break;
  }
  if (!state.hexes.length) throw new Error('board generation failed');
  const portTypes = shuffle(state, ['any', 'any', 'any', 'any', ...RESOURCES]);
  state.ports = PORT_SLOTS.map((slot, i) => {
    const e = TOPO.edges[TOPO.coast[slot]];
    return { edge: e.id, type: portTypes[i], vertices: [e.a, e.b] };
  });
}

// ---------------------------------------------------------------- Queries
export function victoryPoints(state, pid, includeHidden = true) {
  let vp = 0;
  for (const b of Object.values(state.buildings)) if (b.owner === pid) vp += b.type === 'city' ? 2 : 1;
  if (state.longestRoad.holder === pid) vp += 2;
  if (state.largestArmy.holder === pid) vp += 2;
  if (includeHidden) vp += state.players[pid].devCards.filter(c => c.type === 'vp').length;
  return vp;
}

function vertexFree(state, v) {
  if (state.buildings[v]) return false;
  return TOPO.vertices[v].neighbors.every(n => !state.buildings[n]);
}

export function legalSettlementVertices(state, pid, setup = false) {
  const out = [];
  for (const v of TOPO.vertices) {
    if (!vertexFree(state, v.id)) continue;
    if (!setup && !v.edges.some(e => state.roads[e] === pid)) continue;
    out.push(v.id);
  }
  return out;
}

export function legalCityVertices(state, pid) {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.owner === pid && b.type === 'settlement').map(([v]) => +v);
}

export function legalRoadEdges(state, pid, fromVertex = null) {
  const out = [];
  for (const e of TOPO.edges) {
    if (state.roads[e.id] !== undefined) continue;
    if (fromVertex !== null) { if (e.a === fromVertex || e.b === fromVertex) out.push(e.id); continue; }
    for (const v of [e.a, e.b]) {
      const b = state.buildings[v];
      if (b && b.owner === pid) { out.push(e.id); break; }
      if (b && b.owner !== pid) continue; // can't extend through an opponent's building
      if (TOPO.vertices[v].edges.some(oe => oe !== e.id && state.roads[oe] === pid)) { out.push(e.id); break; }
    }
  }
  return out;
}

// Effective cost of a build this round (Headlines can discount).
export function costOf(state, kind) {
  return state.headline?.effect.cost?.[kind] || state.options.costs?.[kind] || BUILDINGS[kind].cost;
}
export function isBanned(state, kind) {
  return !!state.headline?.effect.ban?.includes(kind);
}

export function tradeRatio(state, pid, resource) {
  let ratio = state.headline?.effect.maxRatio || 4;
  for (const p of state.ports) {
    if (!p.vertices.some(v => state.buildings[v]?.owner === pid)) continue;
    if (p.type === resource) ratio = Math.min(ratio, 2);
    else if (p.type === 'any') ratio = Math.min(ratio, 3);
  }
  return ratio;
}

export function longestRoadLength(state, pid) {
  const mine = Object.keys(state.roads).filter(e => state.roads[e] === pid).map(Number);
  if (!mine.length) return 0;
  const mineSet = new Set(mine);
  const blocked = v => state.buildings[v] && state.buildings[v].owner !== pid;
  let best = 0;
  const used = new Set();
  function dfs(v, len) {
    if (len > best) best = len;
    if (blocked(v) && len > 0) return;
    for (const e of TOPO.vertices[v].edges) {
      if (!mineSet.has(e) || used.has(e)) continue;
      used.add(e);
      const ed = TOPO.edges[e];
      dfs(ed.a === v ? ed.b : ed.a, len + 1);
      used.delete(e);
    }
  }
  for (const e of mine) {
    const ed = TOPO.edges[e];
    for (const start of [ed.a, ed.b]) dfs(start, 0);
  }
  return best;
}

function updateLongestRoad(state) {
  const lengths = state.players.map(p => longestRoadLength(state, p.id));
  state.longestRoad.lengths = lengths;
  const max = Math.max(...lengths);
  const prev = state.longestRoad.holder;
  let holder;
  if (max < 5) holder = null;
  else {
    const leaders = lengths.map((l, i) => (l === max ? i : -1)).filter(i => i >= 0);
    if (prev !== null && leaders.includes(prev)) holder = prev;
    else holder = leaders.length === 1 ? leaders[0] : null;
  }
  if (holder !== prev) {
    state.longestRoad.holder = holder;
    if (holder !== null) log(state, `${pname(state, holder)} takes Largest Network (${max} lines).`, holder);
    else log(state, `Largest Network is now unclaimed.`);
  }
}

function checkWin(state) {
  if (state.phase !== 'main') return;
  const pid = state.current;
  if (victoryPoints(state, pid) >= state.options.vpToWin) {
    state.phase = 'ended';
    state.winner = pid;
    state.trade = null;
    log(state, `🏆 ${pname(state, pid)} wins with ${victoryPoints(state, pid)} VP!`, pid);
  }
}

// What the current game is waiting on, and from whom.
export function waitingOn(state) {
  if (state.phase === 'ended') return [];
  if (state.phase === 'setup') return [state.current];
  if (state.turn.stage === 'discard') return Object.keys(state.turn.discards).map(Number);
  const w = [state.current];
  return w;
}

// ---------------------------------------------------------------- Actions
export function applyAction(state, pid, action) {
  try {
    doAction(state, pid, action);
    return { ok: true };
  } catch (e) {
    if (e.rule) return { ok: false, error: e.message };
    throw e;
  }
}

function doAction(state, pid, a) {
  if (state.phase === 'ended') fail('The game is over.');
  if (!a || typeof a.type !== 'string') fail('Bad action');
  if (state.phase === 'setup') return setupAction(state, pid, a);

  const t = state.turn;
  // Trade responses can come from anyone while an offer is open.
  if (a.type === 'respondTrade') return respondTrade(state, pid, a);
  if (a.type === 'discard') return discard(state, pid, a);

  if (pid !== state.current) fail('It is not your turn.');
  const player = state.players[pid];

  if (t.stage === 'discard') fail('Waiting for players to discard.');
  if (t.stage === 'regulator') {
    if (a.type !== 'moveRegulator') fail('Move the Regulator first.');
    return moveRegulator(state, pid, a.hex);
  }
  if (t.stage === 'steal') {
    if (a.type !== 'steal') fail('Choose who to take a resource from.');
    return steal(state, pid, a.target);
  }
  if (t.stage === 'roadBuilding') {
    if (a.type === 'buildRoad') return buildRoad(state, pid, a.edge, true);
    if (a.type === 'skipFreeRoads') { t.freeRoads = 0; t.stage = t.returnStage; return; }
    fail('Place your free Fiber Lines.');
  }

  switch (a.type) {
    case 'roll':
      if (t.stage !== 'preroll') fail('You already rolled.');
      return roll(state, pid, a.dice);
    case 'playDev':
      return playDev(state, pid, a);
    case 'endTurn':
      if (t.stage !== 'main') fail('Roll the dice first.');
      return endTurn(state);
  }
  if (t.stage !== 'main') fail('Roll the dice first.');
  switch (a.type) {
    case 'buildRoad': return buildRoad(state, pid, a.edge, false);
    case 'buildSettlement': return buildSettlement(state, pid, a.vertex);
    case 'buildCity': return buildCity(state, pid, a.vertex);
    case 'buyDev': return buyDev(state, pid);
    case 'bankTrade': return bankTrade(state, pid, a);
    case 'offerTrade': return offerTrade(state, pid, a);
    case 'cancelTrade': state.trade = null; return;
    case 'acceptTrade': return finalizeTrade(state, pid, a.with);
    default: fail(`Unknown action ${a.type}`);
  }
  void player;
}

function setupAction(state, pid, a) {
  const s = state.setup;
  if (pid !== state.current) fail('It is not your turn to place.');
  if (s.step === 'settlement') {
    if (a.type !== 'buildSettlement') fail('Place a Data Center.');
    const v = a.vertex;
    if (!TOPO.vertices[v] || !vertexFree(state, v)) fail('You cannot build there (too close to another Data Center).');
    state.buildings[v] = { owner: pid, type: 'settlement' };
    state.players[pid].pieces.settlement--;
    s.lastVertex = v;
    s.step = 'road';
    const second = s.index >= state.players.length || state.options.setupPayoutBoth;
    let gained = [];
    if (second) {
      for (const h of TOPO.vertices[v].hexes) {
        const res = TERRAIN_INFO[state.hexes[h].terrain].resource;
        if (res && state.bank[res] > 0) { state.players[pid].resources[res]++; state.bank[res]--; gained.push(res); }
      }
    }
    log(state, `${pname(state, pid)} founded a Data Center${gained.length ? ` and collected ${gained.join(', ')}` : ''}.`, pid);
    return;
  }
  if (a.type !== 'buildRoad') fail('Place a Fiber Line next to your new Data Center.');
  const legal = legalRoadEdges(state, pid, s.lastVertex);
  if (!legal.includes(a.edge)) fail('The Fiber Line must touch the Data Center you just placed.');
  state.roads[a.edge] = pid;
  state.players[pid].pieces.road--;
  s.index++;
  s.step = 'settlement';
  if (s.index >= s.order.length) {
    state.phase = 'main';
    state.current = state.firstPlayer;
    state.turnNumber = 1;
    state.turn = newTurn();
    state.setup = null;
    if (state.options.seatBonus) {
      // Later seats in turn order get extra random starting resources to offset going last.
      const n = state.players.length;
      for (let k = 0; k < n; k++) {
        const p = state.players[(state.firstPlayer + k) % n];
        const extra = state.options.seatBonus[n]?.[k] || 0;
        for (let i = 0; i < extra; i++) {
          const pool = RESOURCES.flatMap(r => Array(state.bank[r]).fill(r));
          const r = pool[randInt(state, pool.length)];
          p.resources[r]++; state.bank[r]--;
        }
        if (extra) log(state, `${p.name} gets ${extra} bonus resource${extra > 1 ? 's' : ''} for playing later in the order.`, p.id);
      }
    }
    if (state.options.startHand) {
      for (const p of state.players) for (const [r, n] of Object.entries(state.options.startHand)) {
        const k = Math.min(n, state.bank[r]); p.resources[r] += k; state.bank[r] -= k;
      }
    }
    log(state, `Setup complete. ${pname(state, state.current)} takes the first turn.`);
    startRound(state);
  } else {
    state.current = s.order[s.index];
  }
}

function newTurn() {
  return { stage: 'preroll', devPlayed: false, discards: {}, freeRoads: 0, returnStage: null, stealCandidates: [], offers: 0 };
}

function roll(state, pid, forced) {
  let d1, d2;
  if (Array.isArray(forced) && state.options.allowForcedDice) [d1, d2] = forced;
  else { d1 = randInt(state, 6) + 1; d2 = randInt(state, 6) + 1; }
  const total = d1 + d2;
  state.lastRoll = { dice: [d1, d2], total, by: pid };
  state.rollHistory[total]++;
  log(state, `${pname(state, pid)} rolled ${total}.`, pid);
  const t = state.turn;
  if (total === 7) {
    const discards = {};
    for (const p of state.players) {
      const n = handSize(p.resources);
      if (n > state.options.discardLimit) discards[p.id] = Math.floor(n / 2);
    }
    t.discards = discards;
    t.returnStage = 'main';
    t.afterDiscard = state.headline?.effect.noRegulator ? 'main' : 'regulator';
    if (Object.keys(discards).length) {
      t.stage = 'discard';
      log(state, `Regulatory audit! ${Object.keys(discards).map(id => pname(state, +id)).join(', ')} must discard half their resources.`);
    } else if (t.afterDiscard === 'main') {
      t.stage = 'main';
      log(state, `A 7, but the Regulator is on vacation.`);
    } else {
      t.stage = 'regulator';
      log(state, `Regulatory audit! ${pname(state, pid)} moves the Regulator.`);
    }
    return;
  }
  produce(state, total);
  t.stage = 'main';
}

function produce(state, total) {
  const want = state.players.map(() => emptyHand());
  for (const h of state.hexes) {
    if (h.number !== total || h.id === state.regulator) continue;
    const res = TERRAIN_INFO[h.terrain].resource;
    const mult = state.headline?.effect.produce?.[h.terrain] ?? 1;
    for (const v of TOPO.hexes[h.id].vertices) {
      const b = state.buildings[v];
      if (b) want[b.owner][res] += (b.type === 'city' ? 2 : 1) * mult;
    }
  }
  const parts = state.players.map(() => []);
  for (const r of RESOURCES) {
    const demand = want.reduce((s, w) => s + w[r], 0);
    if (!demand) continue;
    const claimants = want.filter(w => w[r] > 0).length;
    if (demand > state.bank[r]) {
      if (claimants > 1) { log(state, `The bank is short on ${r}: nobody receives it.`); continue; }
      const pid = want.findIndex(w => w[r] > 0);
      want[pid][r] = state.bank[r];
    }
    want.forEach((w, pid) => {
      if (!w[r]) return;
      state.players[pid].resources[r] += w[r];
      state.players[pid].stats.produced[r] += w[r];
      state.bank[r] -= w[r];
      parts[pid].push(`${w[r]} ${r}`);
    });
  }
  if (state.options.dryRollGrant) {
    for (const p of state.players) {
      if (parts[p.id].length) continue;
      for (let i = 0; i < state.options.dryRollGrant; i++) {
        const pool = RESOURCES.flatMap(r => Array(state.bank[r]).fill(r));
        if (!pool.length) break;
        const r = pool[randInt(state, pool.length)];
        p.resources[r]++; state.bank[r]--; p.stats.produced[r]++;
        parts[p.id].push(`1 ${r} (subsidy)`);
      }
    }
  }
  parts.forEach((p, pid) => { if (p.length) log(state, `${pname(state, pid)} gets ${p.join(', ')}.`, pid); });
}

function discard(state, pid, a) {
  const t = state.turn;
  if (!t || t.stage !== 'discard') fail('Nothing to discard right now.');
  const need = t.discards[pid];
  if (!need) fail('You do not need to discard.');
  const res = a.resources || {};
  let total = 0;
  for (const r of RESOURCES) {
    const n = res[r] || 0;
    if (!Number.isInteger(n) || n < 0) fail('Bad discard amounts.');
    if (n > state.players[pid].resources[r]) fail(`You do not have ${n} ${r}.`);
    total += n;
  }
  if (total !== need) fail(`Discard exactly ${need} resources.`);
  for (const r of RESOURCES) {
    const n = res[r] || 0;
    state.players[pid].resources[r] -= n;
    state.bank[r] += n;
  }
  state.players[pid].stats.discarded += need;
  delete t.discards[pid];
  log(state, `${pname(state, pid)} discarded ${need}.`, pid);
  if (!Object.keys(t.discards).length) t.stage = t.afterDiscard || 'regulator';
}

function regulatorTargets(state, pid, hex) {
  const owners = new Set();
  for (const v of TOPO.hexes[hex].vertices) {
    const b = state.buildings[v];
    if (b && b.owner !== pid && handSize(state.players[b.owner].resources) > 0) owners.add(b.owner);
  }
  return [...owners];
}

export function protectedHex(state, pid, hex) {
  if (!state.options.friendlyRegulator) return false;
  for (const v of TOPO.hexes[hex].vertices) {
    const b = state.buildings[v];
    if (b && b.owner !== pid && victoryPoints(state, b.owner, false) <= 2) return true;
  }
  return false;
}

function moveRegulator(state, pid, hex) {
  if (!state.hexes[hex]) fail('Pick a region.');
  if (hex === state.regulator) fail('The Regulator must move to a different region.');
  if (protectedHex(state, pid, hex) && state.hexes.some(h => h.id !== state.regulator && !protectedHex(state, pid, h.id))) {
    fail('Friendly Regulator: that region has a player with 2 or fewer VP.');
  }
  state.regulator = hex;
  const h = state.hexes[hex];
  log(state, `${pname(state, pid)} sent the Regulator to the ${TERRAIN_INFO[h.terrain].name}${h.number ? ` (${h.number})` : ''}.`, pid);
  const targets = regulatorTargets(state, pid, hex);
  const t = state.turn;
  if (targets.length === 0) { t.stage = t.returnStage; return; }
  if (targets.length === 1) { doSteal(state, pid, targets[0]); t.stage = t.returnStage; return; }
  t.stage = 'steal';
  t.stealCandidates = targets;
}

function steal(state, pid, target) {
  const t = state.turn;
  if (!t.stealCandidates.includes(target)) fail('You cannot take from that player.');
  doSteal(state, pid, target);
  t.stealCandidates = [];
  t.stage = t.returnStage;
}

function doSteal(state, pid, target) {
  const victim = state.players[target];
  const pool = [];
  for (const r of RESOURCES) for (let i = 0; i < victim.resources[r]; i++) pool.push(r);
  if (!pool.length) return;
  const r = pool[randInt(state, pool.length)];
  victim.resources[r]--;
  state.players[pid].resources[r]++;
  state.players[pid].stats.stolen++;
  victim.stats.lostToSteal++;
  state.lastSteal = { by: pid, from: target, resource: r, n: state.log.length };
  log(state, `${pname(state, pid)} took a resource from ${pname(state, target)}.`, pid);
}

function buildRoad(state, pid, edge, free) {
  const p = state.players[pid];
  if (!TOPO.edges[edge]) fail('Pick an edge.');
  if (p.pieces.road <= 0) fail('You have no Fiber Lines left.');
  if (!free && !canAfford(p.resources, costOf(state, 'road'))) fail('Not enough resources for a Fiber Line.');
  if (!legalRoadEdges(state, pid).includes(edge)) fail('A Fiber Line must connect to your network.');
  if (!free) pay(state, p, costOf(state, 'road'));
  state.roads[edge] = pid;
  p.pieces.road--;
  log(state, `${pname(state, pid)} laid a Fiber Line${free ? ' (free)' : ''}.`, pid);
  updateLongestRoad(state);
  if (free) {
    const t = state.turn;
    t.freeRoads--;
    if (t.freeRoads <= 0 || p.pieces.road <= 0 || !legalRoadEdges(state, pid).length) { t.freeRoads = 0; t.stage = t.returnStage; }
  }
  checkWin(state);
}

function buildSettlement(state, pid, v) {
  const p = state.players[pid];
  if (!TOPO.vertices[v]) fail('Pick a site.');
  if (p.pieces.settlement <= 0) fail('You have no Data Centers left. Upgrade one to a Campus first.');
  if (isBanned(state, 'settlement')) fail('Zoning Moratorium: no new Data Centers this round.');
  if (!canAfford(p.resources, costOf(state, 'settlement'))) fail('Not enough resources for a Data Center.');
  if (!legalSettlementVertices(state, pid).includes(v)) fail('Data Centers need a free site on your network, 2+ lines from any other.');
  pay(state, p, costOf(state, 'settlement'));
  state.buildings[v] = { owner: pid, type: 'settlement' };
  p.pieces.settlement--;
  log(state, `${pname(state, pid)} built a Data Center.`, pid);
  updateLongestRoad(state); // may cut an opponent's network
  checkWin(state);
}

function buildCity(state, pid, v) {
  const p = state.players[pid];
  const b = state.buildings[v];
  if (!b || b.owner !== pid || b.type !== 'settlement') fail('Upgrade one of your own Data Centers.');
  if (p.pieces.city <= 0) fail('You have no Campuses left.');
  if (!canAfford(p.resources, costOf(state, 'city'))) fail('Not enough resources for a Hyperscale Campus.');
  pay(state, p, costOf(state, 'city'));
  b.type = 'city';
  p.pieces.city--;
  p.pieces.settlement++;
  log(state, `${pname(state, pid)} upgraded to a Hyperscale Campus.`, pid);
  checkWin(state);
}

function buyDev(state, pid) {
  const p = state.players[pid];
  if (!state.devDeck.length) fail('The R&D deck is empty.');
  if (!canAfford(p.resources, costOf(state, 'dev'))) fail('Not enough resources for an R&D card.');
  pay(state, p, costOf(state, 'dev'));
  const card = state.devDeck.pop();
  p.devCards.push({ ...card, boughtTurn: state.turnNumber });
  log(state, `${pname(state, pid)} funded R&D.`, pid);
  checkWin(state);
}

export function playableDevCards(state, pid) {
  if (state.phase !== 'main' || state.current !== pid) return [];
  const t = state.turn;
  if (t.devPlayed || !['preroll', 'main'].includes(t.stage)) return [];
  const p = state.players[pid];
  return [...new Set(p.devCards.filter(c => c.type !== 'vp' && c.boughtTurn < state.turnNumber).map(c => c.type))];
}

function playDev(state, pid, a) {
  const t = state.turn;
  const p = state.players[pid];
  if (!['preroll', 'main'].includes(t.stage)) fail('You cannot play R&D cards right now.');
  if (t.devPlayed) fail('You can only play one R&D card per turn.');
  const idx = p.devCards.findIndex(c => c.type === a.card && c.type !== 'vp' && c.boughtTurn < state.turnNumber);
  if (idx < 0) fail(a.card === 'vp' ? 'Breakthroughs score automatically; you never play them.' : 'You have no playable card of that type (cards bought this turn must wait).');
  const name = DEV_CARDS[a.card].name;
  // Validate before consuming
  if (a.card === 'venture') {
    const rs = a.resources;
    if (!Array.isArray(rs) || rs.length !== 2 || !rs.every(r => RESOURCES.includes(r))) fail('Pick 2 resources.');
    const need = emptyHand(); rs.forEach(r => need[r]++);
    if (!RESOURCES.every(r => state.bank[r] >= need[r])) fail('The bank does not have those.');
  }
  if (a.card === 'squeeze' && !RESOURCES.includes(a.resource)) fail('Name a resource.');
  if (a.card === 'fiber' && (p.pieces.road <= 0 || !legalRoadEdges(state, pid).length)) fail('You have nowhere to build Fiber Lines.');

  p.devCards.splice(idx, 1);
  p.playedDev[a.card]++;
  t.devPlayed = true;
  log(state, `${pname(state, pid)} played ${name}.`, pid);

  switch (a.card) {
    case 'lobbyist': {
      const count = p.playedDev.lobbyist;
      const h = state.largestArmy.holder;
      if (count >= 3 && h !== pid && (h === null || count > state.players[h].playedDev.lobbyist)) {
        state.largestArmy.holder = pid;
        log(state, `${pname(state, pid)} takes Most Influence (${count} Lobbyists).`, pid);
      }
      t.returnStage = t.stage;
      t.stage = 'regulator';
      break;
    }
    case 'fiber':
      t.returnStage = t.stage;
      t.stage = 'roadBuilding';
      t.freeRoads = Math.min(2, p.pieces.road);
      break;
    case 'venture':
      for (const r of a.resources) { p.resources[r]++; state.bank[r]--; }
      log(state, `${pname(state, pid)} raised ${a.resources.join(' + ')}.`, pid);
      break;
    case 'squeeze': {
      let got = 0;
      for (const o of state.players) {
        if (o.id === pid) continue;
        got += o.resources[a.resource];
        p.resources[a.resource] += o.resources[a.resource];
        o.resources[a.resource] = 0;
      }
      log(state, `${pname(state, pid)} cornered the ${a.resource} market and collected ${got}.`, pid);
      break;
    }
  }
  checkWin(state);
}

function bankTrade(state, pid, a) {
  const p = state.players[pid];
  const { give, get } = a;
  if (!RESOURCES.includes(give) || !RESOURCES.includes(get) || give === get) fail('Pick two different resources.');
  const ratio = tradeRatio(state, pid, give);
  if (p.resources[give] < ratio) fail(`You need ${ratio} ${give}.`);
  if (state.bank[get] < 1) fail(`The bank is out of ${get}.`);
  p.resources[give] -= ratio; state.bank[give] += ratio;
  p.resources[get]++; state.bank[get]--;
  p.stats.tradesBank++;
  log(state, `${pname(state, pid)} traded ${ratio} ${give} for 1 ${get} on the market.`, pid);
}

function cleanBundle(b) {
  const out = emptyHand();
  if (!b || typeof b !== 'object') return out;
  for (const r of RESOURCES) {
    const n = b[r] || 0;
    if (!Number.isInteger(n) || n < 0 || n > 19) fail('Bad trade amounts.');
    out[r] = n;
  }
  return out;
}

function offerTrade(state, pid, a) {
  const give = cleanBundle(a.give), get = cleanBundle(a.get);
  if (!handSize(give) || !handSize(get)) fail('A trade needs something on both sides.');
  if (RESOURCES.some(r => give[r] && get[r])) fail('Do not offer and ask for the same resource.');
  if (!canAfford(state.players[pid].resources, give)) fail('You do not have what you are offering.');
  state.turn.offers++;
  if (state.turn.offers > 20) fail('That is enough offers for one turn.');
  state.trade = { id: (state.trade?.id || 0) + 1, from: pid, give, get, responses: {} };
  log(state, `${pname(state, pid)} offers ${fmtBundle(give)} for ${fmtBundle(get)}.`, pid);
}

export function fmtBundle(b) {
  return RESOURCES.filter(r => b[r]).map(r => `${b[r]} ${r}`).join(', ') || 'nothing';
}

function respondTrade(state, pid, a) {
  const tr = state.trade;
  if (!tr || tr.id !== a.tradeId) fail('That offer is no longer open.');
  if (pid === tr.from) fail('You made this offer.');
  if (a.accept && !canAfford(state.players[pid].resources, tr.get)) fail('You do not have what they are asking for.');
  tr.responses[pid] = a.accept ? 'accept' : 'decline';
}

function finalizeTrade(state, pid, withPid) {
  const tr = state.trade;
  if (!tr) fail('No open offer.');
  if (tr.responses[withPid] !== 'accept') fail('That player has not accepted.');
  const me = state.players[pid], them = state.players[withPid];
  if (!canAfford(me.resources, tr.give)) fail('You no longer have what you offered.');
  if (!canAfford(them.resources, tr.get)) { tr.responses[withPid] = 'decline'; fail('They no longer have what you asked for.'); }
  for (const r of RESOURCES) {
    me.resources[r] += tr.get[r] - tr.give[r];
    them.resources[r] += tr.give[r] - tr.get[r];
  }
  me.stats.tradesPlayer++; them.stats.tradesPlayer++;
  log(state, `${pname(state, pid)} traded ${fmtBundle(tr.give)} to ${pname(state, withPid)} for ${fmtBundle(tr.get)}.`, pid);
  state.trade = null;
}

function endTurn(state) {
  state.trade = null;
  state.current = (state.current + 1) % state.players.length;
  state.turnNumber++;
  state.turn = newTurn();
  if (state.current === state.firstPlayer) startRound(state);
  checkWin(state); // a player can reach 10 between turns (e.g. regaining Largest Network)
}

export function roundNumber(state) {
  return state.phase === 'setup' ? 0 : Math.floor((state.turnNumber - 1) / state.players.length) + 1;
}

function startRound(state) {
  if (!state.options.headlines) return;
  if (!state.headlineDeck.length) state.headlineDeck = shuffle(state, HEADLINES.map(h => h.id));
  const id = state.headlineDeck.pop();
  const h = HEADLINES.find(x => x.id === id);
  state.headline = { id: h.id, name: h.name, text: h.text, effect: h.effect, round: roundNumber(state) };
  state.headlineCount++;
  log(state, `📰 Round ${roundNumber(state)} headline: ${h.name}. ${h.text}`);
  const pub = state.players.map(p => victoryPoints(state, p.id, false));
  if (h.effect.antitrust) {
    const max = Math.max(...pub);
    for (const p of state.players) {
      if (pub[p.id] !== max) continue;
      let lost = 0;
      for (let i = 0; i < h.effect.antitrust; i++) {
        const pool = RESOURCES.flatMap(r => Array(p.resources[r]).fill(r));
        if (!pool.length) break;
        const r = pool[randInt(state, pool.length)];
        p.resources[r]--; state.bank[r]++; lost++;
      }
      log(state, `${p.name} returns ${lost} resource${lost === 1 ? '' : 's'} to the bank.`, p.id);
    }
  }
  if (h.effect.grant) {
    const min = Math.min(...pub);
    for (const p of state.players) {
      if (pub[p.id] !== min) continue;
      const got = [];
      for (let i = 0; i < h.effect.grant; i++) {
        const pool = RESOURCES.flatMap(r => Array(state.bank[r]).fill(r));
        if (!pool.length) break;
        const r = pool[randInt(state, pool.length)];
        p.resources[r]++; state.bank[r]--; got.push(r);
      }
      log(state, `${p.name} receives ${got.join(' + ') || 'nothing'}.`, p.id);
    }
  }
}

// ---------------------------------------------------------------- Views
// What a given player is allowed to see. pid = null for spectators.
export function getView(state, pid) {
  const v = {
    ...state,
    rng: undefined,
    seed: undefined,
    devDeck: undefined,
    devDeckCount: state.devDeck.length,
    headlineDeck: undefined,
    headlineDeckCount: state.headlineDeck.length,
    lastSteal: undefined,
    players: state.players.map(p => {
      const pub = {
        id: p.id, name: p.name, color: p.color, bot: p.bot,
        resourceCount: handSize(p.resources),
        devCount: p.devCards.length,
        playedDev: p.playedDev,
        pieces: p.pieces,
        stats: p.stats,
        publicVP: victoryPoints(state, p.id, false),
      };
      if (p.id === pid || state.phase === 'ended') {
        pub.resources = { ...p.resources };
        pub.devCards = p.devCards.map(c => ({ ...c }));
        pub.vp = victoryPoints(state, p.id, true);
      }
      return pub;
    }),
  };
  if (state.lastSteal && pid !== null && (state.lastSteal.by === pid || state.lastSteal.from === pid)) {
    v.lastSteal = state.lastSteal;
  }
  return JSON.parse(JSON.stringify(v));
}
