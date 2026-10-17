// Transport for the self-hosted Node server: POST for actions, Server-Sent Events for state.
export function serverTransport() {
  let code = null, token = null, es = null, onUpdate = () => {};
  const storeKey = c => `hyperscale:${c}`;
  const saveToken = () => { try { localStorage.setItem(storeKey(code), token); } catch { /* private mode */ } };
  const loadToken = c => { try { return localStorage.getItem(storeKey(c)); } catch { return null; } };

  async function post(path, body = {}) {
    const res = await fetch(`/api/rooms${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) });
    const data = await res.json().catch(() => ({ error: 'Server error' }));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  // Updates arrive over Server-Sent Events (Node server) or a WebSocket (Cloudflare build).
  function connect() {
    if (es) es.close();
    const q = `token=${encodeURIComponent(token || '')}`;
    if (globalThis.HYPERSCALE_WS) return openSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${code}/ws?${q}`);
    es = new EventSource(`/api/rooms/${code}/events?${q}`);
    es.onmessage = ev => onUpdate(JSON.parse(ev.data));
  }
  function openSocket(url, delay = 500) {
    const ws = new WebSocket(url);
    let opened = false;
    es = { close() { ws.onclose = null; ws.close(); } };
    ws.onopen = () => { opened = true; };
    ws.onmessage = ev => onUpdate(JSON.parse(ev.data));
    // Reconnect after drops (phone sleep, network change), backing off while the server is unreachable.
    ws.onclose = () => setTimeout(() => { if (es?.close) openSocket(url, opened ? 500 : Math.min(delay * 2, 8000)); }, opened ? 500 : delay);
  }
  return {
    hosted: false,
    async init(cb) {
      onUpdate = cb;
      const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{5})/);
      if (!m) return { screen: 'home' };
      code = m[1].toUpperCase();
      token = loadToken(code);
      if (token) { connect(); return { screen: 'room' }; }
      return { screen: 'home', code }; // not seated yet: ask for a name, then join
    },
    async create(name) {
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      code = data.code; token = data.token; saveToken();
      history.pushState({}, '', `/r/${code}`);
      connect();
    },
    async join(c, name) {
      code = c; token = loadToken(c);
      try {
        const data = await post(`/${c}/join`, { name });
        token = data.token; saveToken();
      } catch (e) {
        if (!/already started/.test(e.message)) throw e;
        token = null; // started games can still be watched
        e.spectating = true;
        history.pushState({}, '', `/r/${code}`);
        connect();
        throw e;
      }
      history.pushState({}, '', `/r/${code}`);
      connect();
    },
    call: (verb, body) => post(`/${code}/${verb}`, body),
    shareLink: c => `${location.origin}/r/${c}`,
    watchTables: null,
    leaveTable() { if (es) es.close(); es = null; code = null; history.pushState({}, '', '/'); },
  };
}
