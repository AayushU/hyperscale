// Card gallery (every card in the game), used by cards.html and the in-game "Cards" overlay.
import { RESOURCES, RESOURCE_INFO, TERRAIN_INFO, BUILDINGS, DEV_CARDS, SPECIAL_CARDS, HEADLINES } from '/shared/content.js';

export const CARD_CSS = `    .gallery h2 { max-width: 1100px; margin: 34px auto 12px; font-size: 18px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
    .grid { max-width: 1100px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 14px; }
    .card { width: 63mm; height: 88mm; border-radius: 4mm; padding: 4mm; display: flex; flex-direction: column; position: relative; overflow: hidden;
      background: #f8fafc; color: #0f172a; box-shadow: 0 4px 14px #0007; border: 1.5mm solid var(--c, #334155); break-inside: avoid; }
    .card .type { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: var(--c); font-weight: 800; }
    .card .name { font-size: 17px; font-weight: 900; line-height: 1.1; margin: 2px 0 6px; }
    .card .art { flex: 1; display: grid; place-items: center; font-size: 64px; border-radius: 3mm; margin-bottom: 6px;
      background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--c) 35%, white), color-mix(in srgb, var(--c) 75%, black)); }
    .card .art.small { font-size: 44px; flex: 0 0 26mm; }
    .card .text { font-size: 11.5px; font-weight: 600; }
    .card .flavor { font-size: 10.5px; font-style: italic; color: #475569; margin-top: 4px; }
    .card .count { position: absolute; top: 3mm; right: 3mm; font-size: 10px; font-weight: 800; background: var(--c); color: #fff; padding: 1px 6px; border-radius: 99px; }
    .card.has-vp { padding-bottom: 8mm; }
    .card .vp { position: absolute; bottom: 3mm; right: 3mm; font-weight: 900; font-size: 13px; color: var(--c); }
    .cost-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding: 4px 0; font-size: 11.5px; }
    .cost-row b { font-size: 12.5px; } .cost-row .ic { font-size: 15px; letter-spacing: 1px; }
    .tile { width: 52mm; height: 60mm; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: var(--c); color: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8mm; box-sizing: border-box; }
    .tile .ti { font-size: 40px; } .tile b { font-size: 14px; } .tile small { font-size: 10px; opacity: .9; }
    .note { max-width: 1100px; margin: 0 auto; color: var(--muted); font-size: 13px; }
`;

export function cardsHTML() {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const card = ({ c, type, name, art, text = '', flavor = '', count = '', vp = '', small = false, body = '' }) => `
      <div class="card${vp ? ' has-vp' : ''}" style="--c:${c}">${count ? `<div class="count">×${count}</div>` : ''}
        <div class="type">${esc(type)}</div><div class="name">${esc(name)}</div>
        ${art ? `<div class="art${small ? ' small' : ''}">${art}</div>` : ''}${body}
        ${text ? `<div class="text">${esc(text)}</div>` : ''}${flavor ? `<div class="flavor">${esc(flavor)}</div>` : ''}
        ${vp ? `<div class="vp">${vp}</div>` : ''}</div>`;
    const section = (title, note, cards) => `<h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}<div class="grid">${cards.join('')}</div>`;
    const cost = c => Object.entries(c).map(([r, n]) => RESOURCE_INFO[r].icon.repeat(n)).join('');
    const DEV_ART = { lobbyist: '🕴️', fiber: '🌐', venture: '💰', squeeze: '📦', vp: '🏆' };
    const HL_ART = { fabYield: '🏭', exportCtl: '🚫', reactor: '☢️', blackouts: '🔌', rainfall: '🌧️', heatwave: '🔥', steelGlut: '🏗️', tariffs: '🧾',
      hiringBoom: '🎓', visaFreeze: '🛂', infraBill: '🛣️', gpuGlut: '🧠', openSource: '🔓', taxBreak: '🏷️', tradeSummit: '🤝', moratorium: '⛔', vacation: '🏖️', antitrust: '⚖️', grant: '🎁' };
    const out = [];
    out.push(section('Resource cards', '19 of each, 95 in all.', RESOURCES.map(r => {
      const i = RESOURCE_INFO[r]; const t = TERRAIN_INFO[i.terrain];
      return card({ c: i.color, type: 'Resource', name: i.name, art: i.icon, count: 19, flavor: `From the ${t.name}. ${t.blurb}` });
    })));
    const bc = `<div style="margin:4px 0 6px">${Object.values(BUILDINGS).map(b => `<div class="cost-row"><div><b>${b.name}</b><br><small>${b.vp ? `${b.vp} VP` : b.name === 'R&D Card' ? 'draw 1 card' : '0 VP'}</small></div><div class="ic">${cost(b.cost)}</div></div>`).join('')}</div>`;
    out.push(section('Build-cost card', 'One per player.', [card({ c: '#0e7490', type: 'Reference', name: 'Build costs', body: bc, text: 'Roll · Trade · Build. On a 7: discard if over 7 cards, move the Regulator, take 1.' })]));
    const devCards = [];
    for (const [k, d] of Object.entries(DEV_CARDS)) {
      const VP_ART = ['🤖', '🏅', '🌍', '☀️', '📱'];
      if (d.variants) d.variants.forEach((v, i) => devCards.push(card({ c: '#b45309', type: 'R&D · Breakthrough', name: v.name, art: VP_ART[i] || DEV_ART[k], text: d.text, flavor: v.flavor, vp: '+1 VP' })));
      else devCards.push(card({ c: k === 'lobbyist' ? '#7c3aed' : '#0f766e', type: 'R&D', name: d.name, art: DEV_ART[k], text: d.text, flavor: d.flavor, count: d.count }));
    }
    out.push(section('R&D cards', '25 in all: 14 Lobbyists, 2 each of Fiber Rollout, Venture Round and Supply Squeeze, and 5 different Breakthroughs.', devCards));
    out.push(section('Award cards', '', Object.entries(SPECIAL_CARDS).map(([k, s]) => card({ c: k === 'longestRoad' ? '#047857' : '#6d28d9', type: 'Award', name: s.name, art: k === 'longestRoad' ? '🌐' : '🏛️', text: s.text, vp: `${s.vp} VP` }))));
    out.push(section('Headline cards', 'Reveal one at the start of each round. It lasts until the next round begins.', HEADLINES.map(h => card({ c: h.effect.produce ? (Object.values(h.effect.produce)[0] ? '#15803d' : '#b91c1c') : '#1d4ed8', type: 'Headline', name: h.name, art: HL_ART[h.id] || '📰', small: true, text: h.text, flavor: h.flavor }))));
    out.push(section('Region tiles', '19 tiles: print on card stock.', Object.values(TERRAIN_INFO).map(t => `<div class="tile" style="--c:${t.color}"><div class="ti">${t.icon}</div><b>${t.name}</b><small>×${t.count} · ${t.resource ? RESOURCE_INFO[t.resource].name : 'no resource'}</small></div>`)));
    return out.join('');
  }
