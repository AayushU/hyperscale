// Transport for the hosted claude.ai artifact. Each table is one document in the
// artifact's shared database (games/<CODE>), with a small listing in tables/<CODE>.
// Every change runs the shared table logic locally under a short lease on the
// document, so two players acting at once never overwrite each other. Bots are run
// by one seated player's browser (the host, or the first seated player who is online);
// the others step in only if the table sits idle.
import { newRoom, newCode, roomVerb, botStep, lobbyInfo, viewFor, tableSummary } from '/shared/rooms.js';

const BOT_DELAY = 600;
const BOT_BACKUP_DELAY = 4000;
const BOT_TRADE_WAIT = 10000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function artifactTransport() {
  let db = null, user = null, room = null, uid = null;
  const tabId = Math.random().toString(36).slice(2, 10);
  let code = null, doc = null, unsub = null, onUpdate = () => {}, peers = [], botTimer = null;
  let lastKey = 'hyperscale:last';

  const ref = c => db.doc(`games/${c}`);
  const tableRef = c => db.doc(`tables/${c}`);

  function emit() {
    if (!doc) return;
    let connected = null;
    if (room) {
      connected = new Set([uid]);
      for (const p of peers) if (p.presence?.game === code && p.presence?.uid) connected.add(p.presence.uid);
    }
    onUpdate({ lobby: lobbyInfo(doc, uid, connected), game: viewFor(doc, uid) });
  }

  // Apply fn(room) to the latest copy of the table under a lease, then save it.
  // Changes from this tab run one at a time (the lease is per tab, so it cannot
  // separate this tab's own bot step from its player's click).
  let queue = Promise.resolve();
  function mutate(c, fn) {
    const run = queue.then(() => mutateNow(c, fn));
    queue = run.catch(() => {});
    return run;
  }
  async function mutateNow(c, fn) {
    const r0 = ref(c);
    for (let attempt = 0; attempt < 30; attempt++) {
      let lease;
      try { lease = await r0.acquire({ holder: `${uid}:${tabId}`, ttlMs: 1000 }); }
      catch (e) { if (e.code === 'unavailable' || e.code === 'resource_exhausted') { await sleep(300 + Math.random() * 400); continue; } throw friendly(e); }
      if (!lease.acquired) { await sleep(120 + Math.random() * 300); continue; }
      const snap = await r0.get();
      if (!snap.exists) return { ok: false, error: 'That table no longer exists.' };
      const r = structuredClone(snap.data());
      const before = JSON.stringify(tableSummary(r));
      const res = fn(r);
      if (!res.ok) return res;
      r.version = (r.version || 0) + 1;
      r.updatedAt = Date.now();
      try {
        await r0.set(r);
        const summary = tableSummary(r);
        if (JSON.stringify(summary) !== before || r.version % 20 === 0) await tableRef(c).set(summary);
      } catch (e) { throw friendly(e); }
      return res;
    }
    return { ok: false, error: 'The table is busy. Try again in a moment.' };
  }

  function friendly(e) {
    if (e.code === 'invalid_argument') return new Error('You can watch this table, but you do not have permission to play. Ask the host to share the game with you with permission to play.');
    if (e.code === 'quota_exceeded') return new Error('This game server is full. Ask the host to delete old tables.');
    return new Error(e.message || 'Something went wrong. Try again.');
  }

  // The browser that runs the bots: the host if online, else the first seated player online.
  function isBotDriver() {
    const online = new Set([uid]);
    for (const p of peers) if (p.presence?.game === code && p.presence?.uid) online.add(p.presence.uid);
    const humans = doc.seats.filter(s => s.id);
    const driver = humans.find(s => s.id === doc.hostId && online.has(s.id)) || humans.find(s => online.has(s.id));
    return driver?.id === uid;
  }

  function scheduleBots(delay) {
    clearTimeout(botTimer);
    if (!doc || !doc.game || doc.game.phase === 'ended') return;
    if (!doc.seats.some(s => s.id === uid)) return; // only seated players drive bots
    if (!doc.seats.some(s => s.bot)) return;
    if (delay === undefined) delay = isBotDriver() ? BOT_DELAY : BOT_BACKUP_DELAY;
    const version = doc.version;
    const c = code;
    botTimer = setTimeout(async () => {
      let wait = 0, idle = false;
      const res = await mutate(c, r => {
        if (r.version !== version) return { ok: false, stale: true };
        const step = botStep(r, Date.now(), BOT_TRADE_WAIT);
        if (!step.acted) { idle = true; wait = step.waitMs || 0; return { ok: false }; }
        return { ok: true };
      }).catch(() => ({ ok: false }));
      if (res.ok || code !== c || doc?.version !== version) return; // the new snapshot reschedules
      if (wait) scheduleBots(Math.min(1000, wait));
      else if (!idle) scheduleBots(1500); // busy or failed: try again
    }, delay);
  }

  function open(c) {
    if (unsub) unsub();
    code = c;
    try { localStorage.setItem(lastKey, c); } catch { /* ignore */ }
    if (room) room.presence({ game: c, uid }).catch(() => {});
    return new Promise(resolve => {
      let first = true;
      unsub = ref(c).onSnapshot(snap => {
        if (!snap.exists) { if (first) { first = false; resolve(false); } return; }
        doc = snap.data();
        emit();
        scheduleBots();
        if (first) { first = false; resolve(true); }
      }, () => { if (first) { first = false; resolve(false); } });
    });
  }

  return {
    hosted: true,
    async init(cb) {
      onUpdate = cb;
      const c = globalThis.claude;
      if (!c?.use) return { screen: 'error', error: 'Open this game from its claude.ai link to play.' };
      [db, user, room] = await Promise.all([c.use('db'), c.use('user'), c.use('room')]);
      if (!db || !user) return { screen: 'error', error: 'Sign in to claude.ai to play. You can only watch while signed out.' };
      uid = await user.id();
      if (!uid) return { screen: 'error', error: 'Sign in to claude.ai to play.' };
      lastKey = `hyperscale:last:${uid}`;
      if (room) room.onPeers(list => { peers = list; emit(); });
      let last = null;
      try { last = localStorage.getItem(lastKey); } catch { /* ignore */ }
      if (last && await open(last)) return { screen: 'room' };
      return { screen: 'home' };
    },
    async create(name) {
      let c;
      for (let i = 0; i < 5; i++) { c = newCode(); if (!(await ref(c).get()).exists) break; }
      const r = newRoom({ code: c, hostId: uid, hostName: name });
      r.version = 1;
      try {
        await ref(c).set(r);
        await tableRef(c).set(tableSummary(r));
      } catch (e) { throw friendly(e); }
      await open(c);
    },
    async join(c, name) {
      const snap = await ref(c).get();
      if (!snap.exists) throw new Error('No game with that code. Check the code or create a new game.');
      const already = snap.data().seats.some(s => s.id === uid);
      if (!already) {
        const res = await mutate(c, r => roomVerb(r, uid, 'join', { name }));
        if (!res.ok) {
          const e = new Error(res.error);
          if (/already started/.test(res.error)) { e.spectating = true; await open(c); }
          throw e;
        }
      }
      await open(c);
    },
    async call(verb, body) {
      const res = await mutate(code, r => roomVerb(r, uid, verb, body, Date.now()));
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    shareLink: null,
    watchTables(cb) {
      return db.collection('tables').orderBy('updatedAt', 'desc').limit(30).onSnapshot(snap => {
        const all = snap.docs.map(d => d.data());
        const fresh = t => Date.now() - (t.updatedAt || 0) < 1000 * 60 * 60 * 24 * 2;
        cb({
          mine: all.filter(t => t.seatIds?.includes(uid) && t.status !== 'ended' && fresh(t)),
          open: all.filter(t => t.status === 'lobby' && !t.seatIds?.includes(uid) && t.players.length < 4 && fresh(t)),
        });
      }, () => cb({ mine: [], open: [] }));
    },
    leaveTable() {
      if (unsub) unsub();
      unsub = null; code = null; doc = null; clearTimeout(botTimer);
      try { localStorage.removeItem(lastKey); } catch { /* ignore */ }
      if (room) room.presence({ game: null }).catch(() => {});
    },
  };
}
