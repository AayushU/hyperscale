import test from 'node:test';
import assert from 'node:assert/strict';
import { MODES, createGame, applyAction, handSize } from '../shared/engine.js';
import { botAction } from '../shared/bots.js';
import { newRoom, roomVerb, botStep, lobbyInfo, viewFor, tableSummary, effectiveOptions } from '../shared/rooms.js';

const table = () => {
  const r = newRoom({ code: 'ABCDE', hostId: 'h', hostName: 'Host' });
  assert.ok(roomVerb(r, 'f', 'join', { name: 'Friend' }).ok);
  return r;
};

test('tables default to Quick mode and only the host can change options or start', () => {
  const r = table();
  assert.equal(r.options.mode, 'quick');
  assert.equal(effectiveOptions(r).vpToWin, 8);
  assert.equal(roomVerb(r, 'f', 'options', { options: { mode: 'classic' } }).ok, false);
  assert.ok(roomVerb(r, 'h', 'options', { options: { mode: 'classic' } }).ok);
  assert.equal(effectiveOptions(r).vpToWin, 8, 'Classic with two players plays to 8');
  assert.ok(roomVerb(r, 'h', 'addBot', {}).ok);
  assert.equal(effectiveOptions(r).vpToWin, 10);
  assert.equal(roomVerb(r, 'f', 'start').ok, false);
  assert.ok(roomVerb(r, 'h', 'start').ok);
  assert.equal(r.game.options.vpToWin, 10);
  assert.equal(roomVerb(r, 'x', 'join', { name: 'Late' }).ok, false, 'no joining a running game');
});

test('views hide other hands and the summary lists seated ids', () => {
  const r = table();
  roomVerb(r, 'h', 'addBot', {});
  roomVerb(r, 'h', 'start');
  const lobby = lobbyInfo(r, 'f', new Set(['h']));
  assert.equal(lobby.you, 1);
  assert.equal(lobby.seats[1].connected, false);
  const v = viewFor(r, 'f');
  assert.equal(v.players[0].resources, undefined);
  assert.deepEqual(tableSummary(r).seatIds, ['h', 'f']);
  assert.equal(tableSummary(r).status, 'playing');
});

test('chat, rename and botify', () => {
  const r = table();
  roomVerb(r, 'h', 'start');
  assert.ok(roomVerb(r, 'f', 'chat', { text: 'hi' }).ok);
  assert.equal(roomVerb(r, 'nobody', 'chat', { text: 'hi' }).ok, false);
  assert.ok(roomVerb(r, 'f', 'rename', { name: 'Sam' }).ok);
  assert.equal(r.game.players[1].name, 'Sam');
  assert.equal(roomVerb(r, 'f', 'botify', { seat: 0 }).ok, false);
  assert.ok(roomVerb(r, 'h', 'botify', { seat: 1 }).ok);
  assert.equal(r.seats[1].bot, 'balanced');
  assert.equal(r.seats[1].id, null);
});

test('Quick mode: both setup sites pay, later seats get a head start', () => {
  const players = [0, 1, 2, 3].map(i => ({ name: 'P' + i, bot: 'balanced' }));
  const { label, ...quick } = MODES.quick; void label;
  const s = createGame({ players, seed: 11, options: quick });
  while (s.phase === 'setup') {
    const pid = s.current;
    assert.ok(applyAction(s, pid, botAction(s, pid, 'balanced')).ok);
  }
  // Each player has 2 sites; with both paying, hands are at least the seat bonus
  // plus one resource per productive hex next to each site.
  const hands = s.players.map(p => handSize(p.resources));
  assert.ok(hands.every(h => h >= 3), `hands ${hands}`);
  assert.ok(s.log.some(l => /head start/i.test(l.msg) || /bonus/i.test(l.msg)), 'seat bonus is logged');
});

test('Quick mode: a dry roll pays a subsidy', () => {
  const players = [{ name: 'A' }, { name: 'B' }];
  const s = createGame({ players, seed: 3, options: { ...MODES.quick, allowForcedDice: true } });
  // Skip setup: nobody owns anything, so every roll is dry for everyone.
  s.phase = 'main'; s.setup = null; s.current = 0; s.turnNumber = 1;
  s.turn = { stage: 'preroll', devPlayed: false, discards: {}, freeRoads: 0, returnStage: null, stealCandidates: [], offers: 0 };
  const before = s.players.map(p => handSize(p.resources));
  assert.ok(applyAction(s, 0, { type: 'roll', dice: [3, 3] }).ok);
  const after = s.players.map(p => handSize(p.resources));
  assert.deepEqual(after, before.map(n => n + 1));
  assert.ok(s.log.some(l => /subsidy/.test(l.msg)));
});

test('a bot-only table finishes when its state is copied through JSON every step', () => {
  for (const mode of ['quick', 'classic']) {
    let r = newRoom({ code: 'BOTS1', hostId: 'h', hostName: 'Host' });
    for (let i = 0; i < 3; i++) roomVerb(r, 'h', 'addBot', { profile: ['balanced', 'expander', 'campus'][i] });
    roomVerb(r, 'h', 'options', { options: { mode } });
    roomVerb(r, 'h', 'start');
    r.seats[0].bot = 'researcher'; r.game.players[0].bot = 'researcher'; // the host's seat plays too
    let steps = 0, now = 0;
    while (r.game.phase !== 'ended' && steps < 20000) {
      r = JSON.parse(JSON.stringify(r)); // the hosted version stores the table as JSON
      now += 1000;
      const s = botStep(r, now, 5000);
      if (!s.acted) now += s.waitMs || 0;
      steps++;
    }
    assert.equal(r.game.phase, 'ended', `${mode} game did not finish`);
    assert.ok(r.game.turnNumber < 400);
  }
});
