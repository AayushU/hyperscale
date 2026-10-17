// Playtest harness: plays many bot-vs-bot games and reports balance metrics.
// Usage: node sim/simulate.js [games=2000] [players=4] [mode=mixed|balanced|<profile>]
import { createGame, applyAction, victoryPoints, handSize } from '../shared/engine.js';
import { botAction, PROFILES } from '../shared/bots.js';
import { RESOURCES } from '../shared/content.js';

export function runGame(seed, profiles, options = {}, maxTurns = 600) {
  const state = createGame({ players: profiles.map((p, i) => ({ name: `${p}${i}`, bot: p })), seed, options });
  let steps = 0;
  while (state.phase !== 'ended' && state.turnNumber <= maxTurns) {
    if (++steps > 200000) throw new Error(`stuck at seed ${seed}`);
    let acted = false;
    // Non-current players first: discards and trade responses.
    for (const p of state.players) {
      if (state.phase === 'setup' && p.id !== state.current) continue;
      const a = botAction(state, p.id, profiles[p.id]);
      if (!a) continue;
      const res = applyAction(state, p.id, a);
      if (!res.ok) throw new Error(`seed ${seed} turn ${state.turnNumber}: bot ${p.id} illegal ${JSON.stringify(a)}: ${res.error}`);
      acted = true;
      break;
    }
    if (!acted) throw new Error(`seed ${seed}: nobody can act (stage ${state.turn?.stage})`);
  }
  return state;
}

function main() {
  const games = +(process.argv[2] || 2000);
  const nPlayers = +(process.argv[3] || 4);
  const mode = process.argv[4] || 'mixed';
  const opts = process.argv[5] ? JSON.parse(process.argv[5]) : {};
  const names = Object.keys(PROFILES);
  const agg = {
    games: 0, stalemates: 0, rounds: [], seatWins: Array(nPlayers).fill(0),
    profileWins: {}, profileSeats: {}, winnerVP: { buildings: 0, lr: 0, la: 0, vpCards: 0 },
    lrAwarded: 0, laAwarded: 0, produced: Object.fromEntries(RESOURCES.map(r => [r, 0])),
    loserVP: [], devBought: 0, sevens: 0, rolls: 0, discards: 0, playerTrades: 0, bankTrades: 0,
    citiesBuilt: 0, settlementsBuilt: 0, roadsBuilt: 0, winnerCities: 0, winnerSettlements: 0,
    secondVP: [],
  };
  for (let g = 0; g < games; g++) {
    let profiles;
    if (mode === 'mixed') {
      // rotate profiles across seats so seat and profile effects separate
      profiles = Array.from({ length: nPlayers }, (_, i) => names[(i + g) % names.length]);
      if (nPlayers < names.length) profiles = Array.from({ length: nPlayers }, (_, i) => names[(g * 7 + i * 3 + Math.floor(g / names.length)) % names.length]);
    } else if (mode.startsWith('solo:')) {
      // one challenger profile against balanced bots, rotating seats
      profiles = Array(nPlayers).fill('balanced');
      profiles[g % nPlayers] = mode.slice(5);
    } else profiles = Array(nPlayers).fill(mode);
    const s = runGame(1000 + g, profiles, opts);
    agg.games++;
    profiles.forEach(p => { agg.profileSeats[p] = (agg.profileSeats[p] || 0) + 1; });
    if (s.phase !== 'ended') { agg.stalemates++; continue; }
    const w = s.winner;
    agg.rounds.push(s.turnNumber / nPlayers);
    agg.seatWins[(w - s.firstPlayer + nPlayers) % nPlayers]++;
    agg.profileWins[profiles[w]] = (agg.profileWins[profiles[w]] || 0) + 1;
    if (mode.startsWith('solo:')) {
      const c = profiles.findIndex(p => p === mode.slice(5));
      agg.soloWins = (agg.soloWins || 0) + (w === c ? 1 : 0);
    }
    let b = 0;
    for (const bd of Object.values(s.buildings)) if (bd.owner === w) b += bd.type === 'city' ? 2 : 1;
    agg.winnerVP.buildings += b;
    if (s.longestRoad.holder === w) agg.winnerVP.lr += 2;
    if (s.largestArmy.holder === w) agg.winnerVP.la += 2;
    agg.winnerVP.vpCards += s.players[w].devCards.filter(c => c.type === 'vp').length;
    if (s.longestRoad.holder !== null) agg.lrAwarded++;
    if (s.largestArmy.holder !== null) agg.laAwarded++;
    const others = s.players.filter(p => p.id !== w).map(p => victoryPoints(s, p.id));
    agg.loserVP.push(...others);
    agg.secondVP.push(Math.max(...others));
    for (const p of s.players) {
      for (const r of RESOURCES) agg.produced[r] += p.stats.produced[r];
      agg.discards += p.stats.discarded;
      agg.playerTrades += p.stats.tradesPlayer / 2;
      agg.bankTrades += p.stats.tradesBank;
    }
    for (const bd of Object.values(s.buildings)) {
      if (bd.type === 'city') agg.citiesBuilt++; agg.settlementsBuilt++;
      if (bd.owner === w) { if (bd.type === 'city') agg.winnerCities++; else agg.winnerSettlements++; }
    }
    agg.roadsBuilt += Object.keys(s.roads).length;
    agg.devBought += 25 - s.devDeck.length;
    agg.sevens += s.rollHistory[7];
    agg.rolls += Object.values(s.rollHistory).reduce((a, b) => a + b, 0);
  }
  const fin = agg.games - agg.stalemates;
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const pct = (x, n = fin) => `${(100 * x / n).toFixed(1)}%`;
  const sorted = agg.rounds.slice().sort((a, b) => a - b);
  console.log(`\n== ${games} games, ${nPlayers} players, mode=${mode} ${JSON.stringify(opts)} ==`);
  console.log(`finished: ${fin}, stalemates (>600 turns): ${agg.stalemates}`);
  console.log(`rounds per game: mean ${avg(agg.rounds).toFixed(1)}, p10 ${sorted[Math.floor(fin * 0.1)]?.toFixed(1)}, median ${sorted[Math.floor(fin / 2)]?.toFixed(1)}, p90 ${sorted[Math.floor(fin * 0.9)]?.toFixed(1)}`);
  console.log(`win rate by seat (1st..last): ${agg.seatWins.map(w => pct(w)).join('  ')}`);
  console.log(`win rate by profile: ${Object.entries(agg.profileWins).map(([p, w]) => `${p} ${pct(w, agg.profileSeats[p] * fin / agg.games)}`).join('  ')}  (fair = ${pct(fin / nPlayers)})`);
  if (mode.startsWith('solo:')) console.log(`challenger ${mode.slice(5)} win rate vs 3 balanced: ${pct(agg.soloWins || 0)} (fair ${pct(fin / nPlayers)})`);
  const wv = agg.winnerVP;
  console.log(`winner VP sources (avg): buildings ${(wv.buildings / fin).toFixed(2)}, Largest Network ${(wv.lr / fin).toFixed(2)}, Most Influence ${(wv.la / fin).toFixed(2)}, Breakthroughs ${(wv.vpCards / fin).toFixed(2)}`);
  console.log(`winner builds: ${(agg.winnerSettlements / fin).toFixed(2)} Data Centers, ${(agg.winnerCities / fin).toFixed(2)} Campuses`);
  console.log(`Largest Network awarded in ${pct(agg.lrAwarded)}, Most Influence in ${pct(agg.laAwarded)}`);
  console.log(`runner-up VP: mean ${avg(agg.secondVP).toFixed(2)}; all losers mean ${avg(agg.loserVP).toFixed(2)}`);
  const totalProd = Object.values(agg.produced).reduce((a, b) => a + b, 0);
  console.log(`production share: ${RESOURCES.map(r => `${r} ${pct(agg.produced[r], totalProd)}`).join('  ')}`);
  console.log(`per game: ${(agg.devBought / fin).toFixed(1)} R&D bought, ${(agg.roadsBuilt / fin).toFixed(1)} lines, ${(agg.citiesBuilt / fin).toFixed(1)} campuses, ${(agg.playerTrades / fin).toFixed(1)} player trades, ${(agg.bankTrades / fin).toFixed(1)} market trades, ${(agg.discards / fin).toFixed(1)} cards discarded, 7s ${pct(agg.sevens, agg.rolls)}`);
  return agg;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
