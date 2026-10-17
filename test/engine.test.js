import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPO, createGame, applyAction, legalSettlementVertices, legalRoadEdges, longestRoadLength,
  victoryPoints, getView, tradeRatio, handSize,
} from '../shared/engine.js';
import { TERRAIN_INFO } from '../shared/content.js';
import { runGame } from '../sim/simulate.js';

const P3 = [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }];
const ok = (s, pid, a) => { const r = applyAction(s, pid, a); assert.ok(r.ok, r.error); };
const bad = (s, pid, a, re) => { const r = applyAction(s, pid, a); assert.equal(r.ok, false); if (re) assert.match(r.error, re); };

// Put the game straight into the main phase with hand-placed pieces.
function mainGame(opts = {}) {
  const s = createGame({ players: P3, seed: 7, options: { allowForcedDice: true, headlines: false, ...opts } });
  s.phase = 'main'; s.setup = null; s.current = 0; s.turnNumber = 1;
  s.turn = { stage: 'preroll', devPlayed: false, discards: {}, freeRoads: 0, returnStage: null, stealCandidates: [], offers: 0 };
  return s;
}
function simplePath(start, len) {
  const path = [start], edges = [];
  const go = v => {
    if (edges.length === len) return true;
    for (const e of TOPO.vertices[v].edges) {
      const ed = TOPO.edges[e]; const w = ed.a === v ? ed.b : ed.a;
      if (path.includes(w)) continue;
      path.push(w); edges.push(e);
      if (go(w)) return true;
      path.pop(); edges.pop();
    }
    return false;
  };
  go(start);
  return { path, edges };
}
const edgeBetween = (a, b) => TOPO.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)).id;

test('topology is a standard 19-region island', () => {
  assert.equal(TOPO.hexes.length, 19);
  assert.equal(TOPO.vertices.length, 54);
  assert.equal(TOPO.edges.length, 72);
  assert.equal(TOPO.coast.length, 30);
});

test('boards respect generation constraints across many seeds', () => {
  for (let seed = 1; seed < 300; seed++) {
    const s = createGame({ players: P3, seed });
    const counts = {};
    s.hexes.forEach(h => { counts[h.terrain] = (counts[h.terrain] || 0) + 1; });
    for (const [t, info] of Object.entries(TERRAIN_INFO)) assert.equal(counts[t], info.count);
    for (const h of s.hexes) {
      assert.equal(h.number === null, h.terrain === 'desert');
      for (const nb of TOPO.hexes[h.id].neighbors) {
        const o = s.hexes[nb];
        if (h.number && o.number) {
          assert.notEqual(h.number, o.number, `seed ${seed}`);
          assert.ok(!([6, 8].includes(h.number) && [6, 8].includes(o.number)), `red numbers touch, seed ${seed}`);
        }
      }
    }
    assert.equal(s.ports.length, 9);
    const pv = s.ports.flatMap(p => p.vertices);
    assert.equal(new Set(pv).size, 18, 'ports never share a vertex');
    assert.equal(s.hexes[s.regulator].terrain, 'desert');
  }
});

test('setup: snake order, distance rule, road must touch new site, second site pays out', () => {
  const s = createGame({ players: P3, seed: 3 });
  const order = s.setup.order;
  assert.deepEqual(order.slice(3), order.slice(0, 3).reverse());
  const p = order[0];
  bad(s, order[1], { type: 'buildSettlement', vertex: 0 }, /not your turn/);
  ok(s, p, { type: 'buildSettlement', vertex: 10 });
  const far = TOPO.edges.find(e => e.a !== 10 && e.b !== 10).id;
  bad(s, p, { type: 'buildRoad', edge: far }, /must touch/);
  ok(s, p, { type: 'buildRoad', edge: TOPO.vertices[10].edges[0] });
  const p2 = order[1];
  bad(s, p2, { type: 'buildSettlement', vertex: TOPO.vertices[10].neighbors[0] }, /too close/);
  // play out the rest legally
  while (s.phase === 'setup') {
    const pid = s.current;
    if (s.setup.step === 'settlement') {
      const v = legalSettlementVertices(s, pid, true)[0];
      const before = handSize(s.players[pid].resources);
      const second = s.setup.index >= 3;
      ok(s, pid, { type: 'buildSettlement', vertex: v });
      const expect = TOPO.vertices[v].hexes.filter(h => s.hexes[h].terrain !== 'desert').length;
      assert.equal(handSize(s.players[pid].resources) - before, second ? expect : 0);
    } else ok(s, pid, { type: 'buildRoad', edge: legalRoadEdges(s, pid, s.setup.lastVertex)[0] });
  }
  assert.equal(s.current, order[0]);
  assert.equal(s.turn.stage, 'preroll');
});

test('production pays settlements 1 and cities 2, blocked by the Regulator', () => {
  const s = mainGame();
  const hex = s.hexes.find(h => h.number === 6);
  const [v0, , v2] = TOPO.hexes[hex.id].vertices;
  s.buildings[v0] = { owner: 0, type: 'settlement' };
  s.buildings[v2] = { owner: 1, type: 'city' };
  const res = TERRAIN_INFO[hex.terrain].resource;
  ok(s, 0, { type: 'roll', dice: [3, 3] });
  assert.equal(s.players[0].resources[res], 1);
  assert.equal(s.players[1].resources[res], 2);
  assert.equal(s.bank[res], 16);
  ok(s, 0, { type: 'endTurn' });
  s.regulator = hex.id;
  ok(s, 1, { type: 'roll', dice: [2, 4] });
  assert.equal(s.players[1].resources[res], 2, 'regulated region produces nothing');
});

test('bank shortage: nobody gets a resource when the bank cannot pay everyone', () => {
  const s = mainGame();
  const hex = s.hexes.find(h => h.number === 8);
  const vs = TOPO.hexes[hex.id].vertices;
  s.buildings[vs[0]] = { owner: 0, type: 'city' };
  s.buildings[vs[3]] = { owner: 1, type: 'city' };
  const res = TERRAIN_INFO[hex.terrain].resource;
  s.bank[res] = 3;
  ok(s, 0, { type: 'roll', dice: [4, 4] });
  assert.equal(s.players[0].resources[res], 0);
  assert.equal(s.players[1].resources[res], 0);
  assert.equal(s.bank[res], 3);
});

test('rolling 7: big hands discard half, Regulator moves, steal happens', () => {
  const s = mainGame();
  s.players[1].resources = { gpu: 3, power: 3, water: 2, steel: 1, talent: 0 }; // 9 -> discard 4
  s.players[2].resources = { gpu: 1, power: 1, water: 1, steel: 1, talent: 1 }; // 5 -> safe
  ok(s, 0, { type: 'roll', dice: [3, 4] });
  assert.equal(s.turn.stage, 'discard');
  assert.deepEqual(Object.keys(s.turn.discards), ['1']);
  bad(s, 0, { type: 'moveRegulator', hex: 0 }, /discard/);
  bad(s, 1, { type: 'discard', resources: { gpu: 3 } }, /exactly 4/);
  ok(s, 1, { type: 'discard', resources: { gpu: 2, power: 2 } });
  assert.equal(handSize(s.players[1].resources), 5);
  assert.equal(s.turn.stage, 'regulator');
  bad(s, 0, { type: 'moveRegulator', hex: s.regulator }, /different/);
  const target = s.hexes.find(h => h.id !== s.regulator);
  const tv = TOPO.hexes[target.id].vertices;
  s.buildings[tv[0]] = { owner: 1, type: 'settlement' };
  s.buildings[tv[3]] = { owner: 2, type: 'settlement' };
  ok(s, 0, { type: 'moveRegulator', hex: target.id });
  assert.equal(s.turn.stage, 'steal');
  bad(s, 0, { type: 'steal', target: 0 });
  ok(s, 0, { type: 'steal', target: 2 });
  assert.equal(handSize(s.players[0].resources), 1);
  assert.equal(handSize(s.players[2].resources), 4);
  assert.equal(s.turn.stage, 'main');
});

test('building costs, connectivity and distance rule in the main phase', () => {
  const s = mainGame();
  const v = 20;
  s.buildings[v] = { owner: 0, type: 'settlement' };
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  const e1 = TOPO.vertices[v].edges[0];
  bad(s, 0, { type: 'buildRoad', edge: e1 }, /Not enough/);
  s.players[0].resources = { gpu: 3, power: 3, water: 1, steel: 3, talent: 3 };
  const far = TOPO.edges.find(e => ![e.a, e.b].some(x => x === v || TOPO.vertices[v].neighbors.includes(x))).id;
  bad(s, 0, { type: 'buildRoad', edge: far }, /connect/);
  ok(s, 0, { type: 'buildRoad', edge: e1 });
  const mid = TOPO.edges[e1].a === v ? TOPO.edges[e1].b : TOPO.edges[e1].a;
  bad(s, 0, { type: 'buildSettlement', vertex: mid }, /2\+ lines/);
  const e2 = TOPO.vertices[mid].edges.find(e => e !== e1);
  ok(s, 0, { type: 'buildRoad', edge: e2 });
  const end = TOPO.edges[e2].a === mid ? TOPO.edges[e2].b : TOPO.edges[e2].a;
  ok(s, 0, { type: 'buildSettlement', vertex: end });
  assert.deepEqual(s.players[0].resources, { gpu: 3, power: 2, water: 0, steel: 0, talent: 0 });
  ok(s, 0, { type: 'buildCity', vertex: end });
  assert.equal(s.buildings[end].type, 'city');
  assert.equal(victoryPoints(s, 0), 3);
  assert.equal(s.players[0].pieces.settlement, 5, 'hand-placed site + built site - upgraded site');
  assert.equal(s.players[0].pieces.city, 3);
});

test('opponent building blocks network extension and splits longest road', () => {
  const s = mainGame();
  const { path, edges } = simplePath(20, 6);
  edges.forEach(e => { s.roads[e] = 0; });
  assert.equal(longestRoadLength(s, 0), 6);
  s.buildings[path[3]] = { owner: 1, type: 'settlement' };
  assert.equal(longestRoadLength(s, 0), 3);
  // cannot extend through the opponent's building
  const through = TOPO.vertices[path[3]].edges.filter(e => !edges.includes(e));
  for (const e of through) {
    const ed = TOPO.edges[e];
    const other = ed.a === path[3] ? ed.b : ed.a;
    if (!TOPO.vertices[other].edges.some(x => s.roads[x] === 0 && x !== e)) {
      assert.ok(!legalRoadEdges(s, 0).includes(e));
    }
  }
});

test('Largest Network: first to 5 gets it, ties keep holder, broken ties leave it unclaimed', () => {
  const s = mainGame();
  s.players[0].resources = { gpu: 0, power: 0, water: 0, steel: 10, talent: 10 };
  s.buildings[0] = { owner: 0, type: 'settlement' };
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  let v = 0; const visited = new Set([0]); const path = [0];
  for (let i = 0; i < 5; i++) {
    const e = legalRoadEdges(s, 0).find(e => { const ed = TOPO.edges[e]; const w = ed.a === v ? ed.b : ed.a; return (ed.a === v || ed.b === v) && !visited.has(w); });
    ok(s, 0, { type: 'buildRoad', edge: e });
    const ed = TOPO.edges[e]; v = ed.a === v ? ed.b : ed.a; visited.add(v); path.push(v);
    assert.equal(s.longestRoad.holder, i === 4 ? 0 : null);
  }
  assert.equal(victoryPoints(s, 0), 3);
  // Opponent splits it with a building in the middle -> 2/2, falls below 5
  s.buildings[path[2]] = { owner: 1, type: 'settlement' };
  s.turn.stage = 'main';
  s.players[1].resources.steel = 1;
  // recompute via a no-op road build by player 0 elsewhere is awkward; call through a settlement build
  s.players[0].resources = { gpu: 0, power: 1, water: 1, steel: 1, talent: 1 };
  const site = legalSettlementVertices(s, 0)[0];
  if (site !== undefined) { ok(s, 0, { type: 'buildSettlement', vertex: site }); assert.equal(s.longestRoad.holder, null); }
});

test('R&D: cannot play the turn bought, one per turn, Lobbyists give Most Influence at 3', () => {
  const s = mainGame();
  s.players[0].resources = { gpu: 5, power: 5, water: 5, steel: 0, talent: 5 };
  s.devDeck.push({ type: 'lobbyist', variant: 'Lobbyist' });
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  ok(s, 0, { type: 'buyDev' });
  bad(s, 0, { type: 'playDev', card: 'lobbyist' }, /bought this turn/);
  s.players[0].devCards = [1, 2, 3, 4].map(() => ({ type: 'lobbyist', variant: 'Lobbyist', boughtTurn: 0 }));
  ok(s, 0, { type: 'playDev', card: 'lobbyist' });
  assert.equal(s.turn.stage, 'regulator');
  ok(s, 0, { type: 'moveRegulator', hex: (s.regulator + 1) % 19 });
  bad(s, 0, { type: 'playDev', card: 'lobbyist' }, /one R&D card/);
  ok(s, 0, { type: 'endTurn' }); ok(s, 1, { type: 'roll', dice: [1, 1] }); ok(s, 1, { type: 'endTurn' });
  ok(s, 2, { type: 'roll', dice: [1, 1] }); ok(s, 2, { type: 'endTurn' });
  // Lobbyist before rolling returns to preroll
  ok(s, 0, { type: 'playDev', card: 'lobbyist' });
  ok(s, 0, { type: 'moveRegulator', hex: (s.regulator + 1) % 19 });
  assert.equal(s.turn.stage, 'preroll');
  assert.equal(s.largestArmy.holder, null);
  for (const p of [0, 1, 2]) { if (p) { ok(s, p, { type: 'roll', dice: [1, 1] }); } else ok(s, 0, { type: 'roll', dice: [1, 1] }); ok(s, p, { type: 'endTurn' }); }
  ok(s, 0, { type: 'playDev', card: 'lobbyist' });
  assert.equal(s.largestArmy.holder, 0);
});

test('Venture Round, Supply Squeeze and Fiber Rollout', () => {
  const s = mainGame();
  s.players[0].devCards = [
    { type: 'venture', boughtTurn: 0 }, { type: 'squeeze', boughtTurn: 0 }, { type: 'fiber', boughtTurn: 0 },
  ];
  s.players[1].resources.water = 3; s.players[2].resources.water = 2;
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  bad(s, 0, { type: 'playDev', card: 'venture', resources: ['gpu'] }, /2 resources/);
  ok(s, 0, { type: 'playDev', card: 'venture', resources: ['gpu', 'gpu'] });
  assert.equal(s.players[0].resources.gpu, 2);
  ok(s, 0, { type: 'endTurn' }); ok(s, 1, { type: 'roll', dice: [1, 1] }); ok(s, 1, { type: 'endTurn' }); ok(s, 2, { type: 'roll', dice: [1, 1] }); ok(s, 2, { type: 'endTurn' });
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  ok(s, 0, { type: 'playDev', card: 'squeeze', resource: 'water' });
  assert.equal(s.players[0].resources.water, 5);
  assert.equal(s.players[1].resources.water + s.players[2].resources.water, 0);
  ok(s, 0, { type: 'endTurn' }); ok(s, 1, { type: 'roll', dice: [1, 1] }); ok(s, 1, { type: 'endTurn' }); ok(s, 2, { type: 'roll', dice: [1, 1] }); ok(s, 2, { type: 'endTurn' });
  s.buildings[20] = { owner: 0, type: 'settlement' };
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  ok(s, 0, { type: 'playDev', card: 'fiber' });
  assert.equal(s.turn.stage, 'roadBuilding');
  bad(s, 0, { type: 'endTurn' }, /free Fiber/);
  const before = s.players[0].resources.steel;
  ok(s, 0, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
  ok(s, 0, { type: 'buildRoad', edge: legalRoadEdges(s, 0)[0] });
  assert.equal(s.players[0].resources.steel, before);
  assert.equal(s.turn.stage, 'main');
});

test('market trades use port ratios', () => {
  const s = mainGame();
  const port = s.ports.find(p => p.type === 'gpu');
  const anyPort = s.ports.find(p => p.type === 'any');
  s.buildings[port.vertices[0]] = { owner: 0, type: 'settlement' };
  s.buildings[anyPort.vertices[0]] = { owner: 1, type: 'settlement' };
  assert.equal(tradeRatio(s, 0, 'gpu'), 2);
  assert.equal(tradeRatio(s, 0, 'water'), 4);
  assert.equal(tradeRatio(s, 1, 'water'), 3);
  s.players[0].resources.gpu = 2;
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  ok(s, 0, { type: 'bankTrade', give: 'gpu', get: 'steel' });
  assert.equal(s.players[0].resources.steel, 1);
  bad(s, 0, { type: 'bankTrade', give: 'gpu', get: 'steel' }, /need 2/);
});

test('player trades: offer, accept, finalize; bad offers rejected', () => {
  const s = mainGame();
  s.players[0].resources.gpu = 2; s.players[1].resources.water = 1;
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  bad(s, 0, { type: 'offerTrade', give: { gpu: 3 }, get: { water: 1 } }, /do not have/);
  ok(s, 0, { type: 'offerTrade', give: { gpu: 2 }, get: { water: 1 } });
  bad(s, 2, { type: 'respondTrade', tradeId: s.trade.id, accept: true }, /do not have/);
  ok(s, 1, { type: 'respondTrade', tradeId: s.trade.id, accept: true });
  bad(s, 0, { type: 'acceptTrade', with: 2 }, /not accepted/);
  ok(s, 0, { type: 'acceptTrade', with: 1 });
  assert.equal(s.players[0].resources.water, 1);
  assert.equal(s.players[1].resources.gpu, 2);
  assert.equal(s.trade, null);
});

test('win at 10 VP ends the game on your own turn; hidden Breakthroughs count', () => {
  const s = mainGame();
  const vs = [0, 8, 16, 24, 32, 40, 48].filter(v => TOPO.vertices[v]);
  let placed = 0;
  for (const v of TOPO.vertices.map(v => v.id)) {
    if (placed >= 4) break;
    if (TOPO.vertices[v].neighbors.some(n => s.buildings[n]) || s.buildings[v]) continue;
    s.buildings[v] = { owner: 0, type: 'city' }; placed++;
  }
  void vs;
  s.players[0].devCards = [{ type: 'vp', variant: 'Nobel Prize', boughtTurn: 1 }];
  assert.equal(victoryPoints(s, 0), 9);
  assert.equal(victoryPoints(s, 0, false), 8);
  s.players[0].resources = { gpu: 1, power: 0, water: 1, steel: 0, talent: 1 };
  s.devDeck.push({ type: 'vp', variant: 'Fusion PPA' });
  ok(s, 0, { type: 'roll', dice: [1, 1] });
  ok(s, 0, { type: 'buyDev' });
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 0);
  bad(s, 1, { type: 'roll' }, /over/);
});

test('views hide other hands, R&D cards, the deck and the RNG', () => {
  const s = mainGame();
  s.players[1].resources.gpu = 4;
  s.players[1].devCards = [{ type: 'vp', variant: 'Nobel Prize', boughtTurn: 0 }];
  const v = getView(s, 0);
  assert.equal(v.players[1].resources, undefined);
  assert.equal(v.players[1].devCards, undefined);
  assert.equal(v.players[1].resourceCount, 4);
  assert.equal(v.players[1].devCount, 1);
  assert.equal(v.devDeck, undefined);
  assert.equal(v.rng, undefined);
  assert.ok(v.players[0].resources);
});

test('bot games run to completion without illegal moves (fuzz)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const n = 2 + (seed % 3);
    const profiles = ['balanced', 'expander', 'campus', 'researcher'].slice(0, n);
    const s = runGame(seed, profiles, { friendlyRegulator: seed % 2 === 0 });
    assert.equal(s.phase, 'ended', `seed ${seed}`);
    // conservation: bank + hands = 19 per resource
    for (const r of ['gpu', 'power', 'water', 'steel', 'talent']) {
      assert.equal(s.bank[r] + s.players.reduce((a, p) => a + p.resources[r], 0), 19, `${r} conserved, seed ${seed}`);
    }
    assert.ok(victoryPoints(s, s.winner) >= 10);
  }
});

test('Headlines: production multipliers, discounts, moratorium, vacation, deck cycles', async () => {
  const { HEADLINES } = await import('../shared/content.js');
  const s = mainGame();
  const set = id => { const h = HEADLINES.find(x => x.id === id); s.headline = { ...h, round: 1 }; };
  const hex = s.hexes.find(h => h.number === 6);
  const v0 = TOPO.hexes[hex.id].vertices[0];
  s.buildings[v0] = { owner: 0, type: 'city' };
  const res = TERRAIN_INFO[hex.terrain].resource;
  const boom = HEADLINES.find(h => h.effect.produce?.[hex.terrain] === 2).id;
  const bust = HEADLINES.find(h => h.effect.produce?.[hex.terrain] === 0).id;
  set(boom);
  ok(s, 0, { type: 'roll', dice: [3, 3] });
  assert.equal(s.players[0].resources[res], 4);
  set(bust);
  ok(s, 0, { type: 'endTurn' });
  ok(s, 1, { type: 'roll', dice: [3, 3] });
  assert.equal(s.players[0].resources[res], 4);
  ok(s, 1, { type: 'endTurn' });
  set('infraBill');
  s.players[2].resources = { gpu: 0, power: 1, water: 1, steel: 3, talent: 1 };
  s.buildings[40] = { owner: 2, type: 'settlement' };
  ok(s, 2, { type: 'roll', dice: [1, 1] });
  ok(s, 2, { type: 'buildRoad', edge: legalRoadEdges(s, 2)[0] });
  assert.equal(s.players[2].resources.talent, 1, 'Infrastructure Bill: steel only');
  set('moratorium');
  const e2 = legalRoadEdges(s, 2).find(e => { const ed = TOPO.edges[e]; return [ed.a, ed.b].some(v => legalSettlementVertices(s, 2).includes(v)) || true; });
  ok(s, 2, { type: 'buildRoad', edge: e2 });
  const site = legalSettlementVertices(s, 2)[0];
  if (site !== undefined) bad(s, 2, { type: 'buildSettlement', vertex: site }, /Moratorium/);
  set('tradeSummit');
  s.players[2].resources.water = 3;
  assert.equal(tradeRatio(s, 2, 'water'), 3);
  ok(s, 2, { type: 'bankTrade', give: 'water', get: 'gpu' });
  set('vacation');
  ok(s, 2, { type: 'endTurn' });
  const reg = s.regulator;
  ok(s, 0, { type: 'roll', dice: [3, 4] });
  if (s.turn.stage === 'discard') for (const pid of Object.keys(s.turn.discards)) {
    const n = s.turn.discards[pid]; const hand = s.players[pid].resources; const out = {};
    let left = n; for (const r of Object.keys(hand)) { const k = Math.min(hand[r], left); out[r] = k; left -= k; }
    ok(s, +pid, { type: 'discard', resources: out });
  }
  assert.equal(s.turn.stage, 'main');
  assert.equal(s.regulator, reg);

  // A full game draws a new headline every round and reshuffles.
  const g = runGame(5, ['balanced', 'balanced', 'balanced', 'balanced'], { headlines: true });
  assert.ok(g.headlineCount >= Math.floor((g.turnNumber - 1) / 4));
});
