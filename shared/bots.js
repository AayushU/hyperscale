// Heuristic bot players. Used for balance simulations and to fill empty seats online.
// Bots only read public information plus their own hand.

import { RESOURCES, TERRAIN_INFO, BUILDINGS } from './content.js';
import {
  TOPO, PIPS, canAfford, handSize, legalSettlementVertices, legalCityVertices, legalRoadEdges,
  tradeRatio, victoryPoints, playableDevCards, protectedHex, costOf, isBanned,
} from './engine.js';

export const PROFILES = {
  balanced:   { label: 'Balanced',   w: { gpu: 1, power: 1, water: 1, steel: 1, talent: 1 }, city: 3.2, settlement: 3.2, dev: 1.6, road: 1.0, trade: 1 },
  expander:   { label: 'Expander',   w: { gpu: 0.8, power: 1, water: 1, steel: 1.3, talent: 1.3 }, city: 2.4, settlement: 4.0, dev: 1.0, road: 1.6, trade: 1 },
  campus:     { label: 'Campus',     w: { gpu: 1.4, power: 1.3, water: 0.8, steel: 0.9, talent: 0.9 }, city: 4.2, settlement: 2.6, dev: 1.5, road: 0.8, trade: 1 },
  researcher: { label: 'Researcher', w: { gpu: 1.3, power: 1.2, water: 1.3, steel: 0.8, talent: 0.8 }, city: 3.0, settlement: 2.6, dev: 3.2, road: 0.8, trade: 1 },
};


// ---------------------------------------------------------------- evaluation
function production(state, pid) {
  const prod = Object.fromEntries(RESOURCES.map(r => [r, 0]));
  for (const [v, b] of Object.entries(state.buildings)) {
    if (b.owner !== pid) continue;
    for (const h of TOPO.vertices[v].hexes) {
      const hex = state.hexes[h];
      const r = TERRAIN_INFO[hex.terrain].resource;
      if (r && hex.number) prod[r] += PIPS[hex.number] * (b.type === 'city' ? 2 : 1);
    }
  }
  return prod;
}

function vertexValue(state, pid, v, prof, prod = production(state, pid)) {
  let val = 0;
  const seen = new Set();
  for (const h of TOPO.vertices[v].hexes) {
    const hex = state.hexes[h];
    const r = TERRAIN_INFO[hex.terrain].resource;
    if (!r || !hex.number) continue;
    let p = PIPS[hex.number] * prof.w[r];
    if (h === state.regulator) p *= 0.5;
    if (prod[r] === 0 && !seen.has(r)) p += 2.5; // diversity bonus
    if (seen.has(r)) p *= 0.85;
    seen.add(r);
    val += p;
  }
  const port = state.ports.find(p => p.vertices.includes(v));
  if (port) {
    if (port.type === 'any') val += 1.5;
    else val += Math.min(4, (prod[port.type] + (seen.has(port.type) ? 4 : 0)) * 0.35);
  }
  return val;
}

function deficit(hand, cost) {
  let d = 0;
  const miss = {};
  for (const [r, n] of Object.entries(cost)) {
    const m = Math.max(0, n - (hand[r] || 0));
    if (m) { miss[r] = m; d += m; }
  }
  return { d, miss };
}

// BFS from my network to the best open site; returns {target, path:[edges], value}
function roadPlan(state, pid, prof) {
  const prod = production(state, pid);
  const start = new Set();
  for (const [v, b] of Object.entries(state.buildings)) if (b.owner === pid) start.add(+v);
  for (const [e, o] of Object.entries(state.roads)) {
    if (o !== pid) continue;
    const ed = TOPO.edges[e];
    for (const v of [ed.a, ed.b]) if (!state.buildings[v] || state.buildings[v].owner === pid) start.add(v);
  }
  const dist = new Map(), prevEdge = new Map(), prevV = new Map();
  const q = [];
  for (const v of start) { dist.set(v, 0); q.push(v); }
  while (q.length) {
    const v = q.shift();
    const d = dist.get(v);
    if (d >= 4) continue;
    if (state.buildings[v] && state.buildings[v].owner !== pid) continue;
    for (const e of TOPO.vertices[v].edges) {
      if (state.roads[e] !== undefined) continue;
      const ed = TOPO.edges[e];
      const w = ed.a === v ? ed.b : ed.a;
      if (dist.has(w)) continue;
      dist.set(w, d + 1); prevEdge.set(w, e); prevV.set(w, v);
      q.push(w);
    }
  }
  let best = null;
  for (const [v, d] of dist) {
    if (d === 0) continue;
    if (state.buildings[v] || TOPO.vertices[v].neighbors.some(n => state.buildings[n])) continue;
    const val = vertexValue(state, pid, v, prof, prod) / (1 + 0.6 * d);
    if (!best || val > best.value) best = { target: v, d, value: val };
  }
  if (!best) return null;
  const path = [];
  let v = best.target;
  while (prevEdge.has(v)) { path.unshift(prevEdge.get(v)); v = prevV.get(v); }
  best.path = path;
  return best;
}

function bestSettlementSpot(state, pid, prof, setup = false) {
  const prod = production(state, pid);
  let best = null;
  for (const v of legalSettlementVertices(state, pid, setup)) {
    const val = vertexValue(state, pid, v, prof, prod);
    if (!best || val > best.value) best = { v, value: val };
  }
  return best;
}

function bestCity(state, pid, prof) {
  let best = null;
  for (const v of legalCityVertices(state, pid)) {
    const val = TOPO.vertices[v].hexes.reduce((s, h) => {
      const hex = state.hexes[h]; const r = TERRAIN_INFO[hex.terrain].resource;
      return s + (r && hex.number ? PIPS[hex.number] * prof.w[r] : 0);
    }, 0);
    if (!best || val > best.value) best = { v, value: val };
  }
  return best;
}

// Choose the current build goal.
function chooseGoal(state, pid, prof) {
  const me = state.players[pid];
  const hand = me.resources;
  const goals = [];
  const city = me.pieces.city > 0 ? bestCity(state, pid, prof) : null;
  if (city) goals.push({ kind: 'city', cost: costOf(state, 'city'), base: prof.city + city.value * 0.12, v: city.v });
  const spot = me.pieces.settlement > 0 && !isBanned(state, 'settlement') ? bestSettlementSpot(state, pid, prof) : null;
  if (spot) goals.push({ kind: 'settlement', cost: costOf(state, 'settlement'), base: prof.settlement + spot.value * 0.12, v: spot.v });
  else if (me.pieces.settlement > 0 && me.pieces.road > 0 && !legalSettlementVertices(state, pid).length) {
    const plan = roadPlan(state, pid, prof);
    if (plan && plan.path.length) {
      goals.push({ kind: 'road', cost: costOf(state, 'road'), base: prof.road + prof.settlement * 0.35 + plan.value * 0.05 - plan.d * 0.2, edge: plan.path[0] });
    }
  }
  if (state.devDeck === undefined ? state.devDeckCount > 0 : state.devDeck.length > 0) {
    goals.push({ kind: 'dev', cost: costOf(state, 'dev'), base: prof.dev });
  }
  // Late game: chase Largest Network if close
  if (me.pieces.road > 0) {
    const lr = state.longestRoad;
    const mine = lr.lengths?.[pid] || 0;
    const holderLen = lr.holder !== null ? lr.lengths[lr.holder] : 4;
    if (lr.holder !== pid && mine >= 3 && holderLen - mine <= 2) {
      const edges = legalRoadEdges(state, pid);
      if (edges.length) goals.push({ kind: 'road', cost: costOf(state, 'road'), base: prof.road + 1.2, edge: pickLongRoadEdge(state, pid, edges) });
    }
  }
  for (const g of goals) {
    const { d } = deficit(hand, g.cost);
    g.score = g.base - 1.1 * d;
  }
  goals.sort((a, b) => b.score - a.score);
  return goals;
}

function pickLongRoadEdge(state, pid, edges) {
  // Prefer edges that extend the current longest chain.
  let best = edges[0], bestLen = -1;
  for (const e of edges.slice(0, 30)) {
    state.roads[e] = pid;
    const len = longest(state, pid);
    delete state.roads[e];
    if (len > bestLen) { bestLen = len; best = e; }
  }
  return best;
}
import { longestRoadLength as longest } from './engine.js';

// ---------------------------------------------------------------- decisions
export function botAction(state, pid, profileName = 'balanced') {
  const prof = PROFILES[profileName] || PROFILES.balanced;
  if (state.phase === 'ended') return null;

  if (state.phase === 'setup') {
    if (state.current !== pid) return null;
    if (state.setup.step === 'settlement') {
      const best = bestSettlementSpot(state, pid, prof, true);
      return { type: 'buildSettlement', vertex: best.v };
    }
    // Road towards the best open spot near the new settlement.
    const from = state.setup.lastVertex;
    const edges = legalRoadEdges(state, pid, from);
    let best = edges[0], bestVal = -1;
    for (const e of edges) {
      const ed = TOPO.edges[e];
      const w = ed.a === from ? ed.b : ed.a;
      for (const x of TOPO.vertices[w].neighbors) {
        if (x === from) continue;
        if (state.buildings[x] || TOPO.vertices[x].neighbors.some(n => state.buildings[n])) continue;
        const val = vertexValue(state, pid, x, prof);
        if (val > bestVal) { bestVal = val; best = e; }
      }
    }
    return { type: 'buildRoad', edge: best };
  }

  const t = state.turn;
  const me = state.players[pid];

  if (t.stage === 'discard') {
    if (!t.discards[pid]) return null;
    return { type: 'discard', resources: chooseDiscard(state, pid, prof, t.discards[pid]) };
  }

  // Respond to someone else's open trade offer.
  if (state.trade && state.trade.from !== pid) {
    if (state.trade.responses[pid]) return null;
    return { type: 'respondTrade', tradeId: state.trade.id, accept: shouldAccept(state, pid, prof) };
  }
  if (state.current !== pid) return null;

  if (t.stage === 'regulator') return { type: 'moveRegulator', hex: chooseRegulatorHex(state, pid) };
  if (t.stage === 'steal') {
    const c = [...t.stealCandidates].sort((a, b) => victoryPoints(state, b, false) - victoryPoints(state, a, false) ||
      handSize(state.players[b].resources) - handSize(state.players[a].resources));
    return { type: 'steal', target: c[0] };
  }
  if (t.stage === 'roadBuilding') {
    const plan = roadPlan(state, pid, prof);
    const legal = legalRoadEdges(state, pid);
    if (!legal.length) return { type: 'skipFreeRoads' };
    const e = plan && plan.path.length && legal.includes(plan.path[0]) ? plan.path[0] : pickLongRoadEdge(state, pid, legal);
    return { type: 'buildRoad', edge: e };
  }

  const playable = playableDevCards(state, pid);
  if (t.stage === 'preroll') {
    if (playable.includes('lobbyist') && (regulatorHurtsMe(state, pid) || armyWithin(state, pid))) {
      return { type: 'playDev', card: 'lobbyist' };
    }
    return { type: 'roll' };
  }

  // ---- main stage
  if (state.trade && state.trade.from === pid) {
    const acc = Object.entries(state.trade.responses).filter(([, r]) => r === 'accept').map(([p]) => +p);
    if (acc.length) {
      acc.sort((a, b) => victoryPoints(state, a, false) - victoryPoints(state, b, false));
      return { type: 'acceptTrade', with: acc[0] };
    }
    const humansPending = state.players.some(p => p.id !== pid && !state.trade.responses[p.id]);
    if (humansPending) return null; // wait (server times out offers)
    return { type: 'cancelTrade' };
  }

  // Bots keep no memory outside the game state (it may be cloned between moves).
  const hand = me.resources;

  // Dev cards in main phase
  if (playable.length && !t.devPlayed) {
    const dev = chooseDevPlay(state, pid, prof, playable);
    if (dev) return dev;
  }

  const goals = chooseGoal(state, pid, prof);
  // Build anything affordable in goal order (top goal first).
  for (const g of goals) {
    if (!canAfford(hand, g.cost)) continue;
    // Do not spend top-goal resources on a lower goal if the top goal is close.
    if (g !== goals[0]) {
      const top = goals[0];
      const after = { ...hand };
      for (const [r, n] of Object.entries(g.cost)) after[r] -= n;
      if (deficit(after, top.cost).d > deficit(hand, top.cost).d && deficit(hand, top.cost).d <= 1) continue;
      if (g.kind === 'road' && g.score < 0.5) continue;
    }
    if (g.kind === 'city') return { type: 'buildCity', vertex: g.v };
    if (g.kind === 'settlement') return { type: 'buildSettlement', vertex: g.v };
    if (g.kind === 'road') return { type: 'buildRoad', edge: g.edge };
    if (g.kind === 'dev') return { type: 'buyDev' };
  }

  // Trade toward the top goal(s).
  for (const goal of goals.slice(0, 2)) {
    const { miss } = deficit(hand, goal.cost);
    const bank = bankTradeToward(state, pid, goal.cost);
    if (bank) return bank;
    if (t.offers < 1 && deficit(hand, goal.cost).d === 1) {
      const offer = playerOffer(state, pid, goal.cost, miss);
      if (offer) return offer;
    }
  }

  // Too many cards: dump surplus into something useful rather than risk an audit.
  if (handSize(hand) > state.options.discardLimit && goals[0]) {
    const dump = bankTradeToward(state, pid, goals[0].cost, true);
    if (dump) return dump;
  }
  return { type: 'endTurn' };
}

function bankTradeToward(state, pid, cost, partial = false) {
  const hand = state.players[pid].resources;
  const { miss } = deficit(hand, cost);
  const missing = Object.keys(miss);
  if (!missing.length) return null;
  // surplus beyond the goal cost
  const surplus = {};
  let capacity = 0;
  for (const r of RESOURCES) {
    const extra = hand[r] - (cost[r] || 0);
    const ratio = tradeRatio(state, pid, r);
    if (extra >= ratio) { surplus[r] = { extra, ratio }; capacity += Math.floor(extra / ratio); }
  }
  const need = missing.reduce((s, r) => s + miss[r], 0);
  if (!partial && capacity < need) return null;
  if (capacity < 1) return null;
  const give = Object.entries(surplus).sort((a, b) => a[1].ratio - b[1].ratio || b[1].extra - a[1].extra)[0][0];
  const get = missing.find(r => state.bank[r] > 0);
  if (!get) return null;
  return { type: 'bankTrade', give, get };
}

function playerOffer(state, pid, cost, miss) {
  const hand = state.players[pid].resources;
  const want = Object.keys(miss)[0];
  if (!want) return null;
  const spare = RESOURCES.filter(r => r !== want && hand[r] - (cost[r] || 0) > 0)
    .sort((a, b) => (hand[b] - (cost[b] || 0)) - (hand[a] - (cost[a] || 0)));
  if (!spare.length) return null;
  const give = { [spare[0]]: 1 };
  // Sweeten if we have lots
  if (hand[spare[0]] - (cost[spare[0]] || 0) >= 3) give[spare[0]] = 2;
  return { type: 'offerTrade', give, get: { [want]: 1 } };
}

function shouldAccept(state, pid, prof) {
  const tr = state.trade;
  const me = state.players[pid];
  if (!canAfford(me.resources, tr.get)) return false;
  if (victoryPoints(state, tr.from, false) >= state.options.vpToWin - 2) return false;
  const goals = chooseGoal(state, pid, prof);
  if (!goals.length) return false;
  const goal = goals[0];
  const after = { ...me.resources };
  for (const r of RESOURCES) after[r] += (tr.give[r] || 0) - (tr.get[r] || 0);
  const before = deficit(me.resources, goal.cost).d;
  const now = deficit(after, goal.cost).d;
  const giving = handSize(tr.get), getting = handSize(tr.give);
  return now < before && getting >= giving;
}

function chooseDiscard(state, pid, prof, n) {
  const hand = { ...state.players[pid].resources };
  const goals = chooseGoal(state, pid, prof);
  const keep = goals[0] ? goals[0].cost : {};
  const out = Object.fromEntries(RESOURCES.map(r => [r, 0]));
  for (let i = 0; i < n; i++) {
    let pick = null, best = -Infinity;
    for (const r of RESOURCES) {
      if (hand[r] <= 0) continue;
      const score = hand[r] - (keep[r] || 0) * 1.5 - prof.w[r] * 0.5;
      if (score > best) { best = score; pick = r; }
    }
    hand[pick]--; out[pick]++;
  }
  return out;
}

function regulatorHurtsMe(state, pid) {
  const h = state.regulator;
  const hex = state.hexes[h];
  if (!hex.number) return false;
  return TOPO.hexes[h].vertices.some(v => state.buildings[v]?.owner === pid) && PIPS[hex.number] >= 3;
}

function armyWithin(state, pid) {
  const me = state.players[pid];
  const h = state.largestArmy.holder;
  if (h === pid) return false;
  const need = h === null ? 3 : state.players[h].playedDev.lobbyist + 1;
  return me.playedDev.lobbyist + 1 >= need;
}

function chooseRegulatorHex(state, pid) {
  let best = null, bestScore = -Infinity;
  const leaderVP = Math.max(...state.players.filter(p => p.id !== pid).map(p => victoryPoints(state, p.id, false)));
  for (const hex of state.hexes) {
    if (hex.id === state.regulator) continue;
    if (protectedHex(state, pid, hex.id)) continue;
    let score = 0;
    const pips = hex.number ? PIPS[hex.number] : 0;
    for (const v of TOPO.hexes[hex.id].vertices) {
      const b = state.buildings[v];
      if (!b) continue;
      const mult = b.type === 'city' ? 2 : 1;
      if (b.owner === pid) score -= 3 * pips * mult;
      else {
        const vp = victoryPoints(state, b.owner, false);
        score += pips * mult * (1 + vp / 5) + (vp === leaderVP ? 2 : 0) + (handSize(state.players[b.owner].resources) > 0 ? 1 : 0);
      }
    }
    if (score > bestScore) { bestScore = score; best = hex.id; }
  }
  if (best === null) best = state.hexes.find(h => h.id !== state.regulator).id;
  return best;
}

function chooseDevPlay(state, pid, prof, playable) {
  const me = state.players[pid];
  const hand = me.resources;
  const goals = chooseGoal(state, pid, prof);
  const goal = goals[0];
  if (playable.includes('lobbyist') && (regulatorHurtsMe(state, pid) || armyWithin(state, pid))) {
    return { type: 'playDev', card: 'lobbyist' };
  }
  if (playable.includes('fiber') && me.pieces.road >= 1 && legalRoadEdges(state, pid).length) {
    const plan = roadPlan(state, pid, prof);
    if (plan && plan.path.length && !legalSettlementVertices(state, pid).length) return { type: 'playDev', card: 'fiber' };
    const lr = state.longestRoad;
    if (lr.holder !== pid && (lr.lengths?.[pid] || 0) >= 3) return { type: 'playDev', card: 'fiber' };
  }
  if (playable.includes('venture') && goal) {
    const { d, miss } = deficit(hand, goal.cost);
    if (d >= 1 && d <= 2) {
      const rs = [];
      for (const [r, n] of Object.entries(miss)) for (let i = 0; i < n; i++) rs.push(r);
      while (rs.length < 2) rs.push(Object.keys(goal.cost)[0]);
      if (rs.every(r => state.bank[r] >= rs.filter(x => x === r).length)) return { type: 'playDev', card: 'venture', resources: rs.slice(0, 2) };
    }
  }
  if (playable.includes('squeeze') && goal) {
    const others = state.players.filter(p => p.id !== pid).reduce((s, p) => s + handSize(p.resources), 0);
    const { miss } = deficit(hand, goal.cost);
    const r = Object.keys(miss).sort((a, b) => miss[b] - miss[a])[0];
    if (r && others >= 10) return { type: 'playDev', card: 'squeeze', resource: r };
  }
  if (playable.includes('lobbyist') && me.devCards.filter(c => c.type === 'lobbyist').length >= 2) {
    return { type: 'playDev', card: 'lobbyist' };
  }
  return null;
}
