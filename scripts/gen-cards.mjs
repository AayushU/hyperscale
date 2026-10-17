// Regenerates CARDS.md from shared/content.js (the single source of truth).
import fs from 'node:fs';
import { RESOURCES, RESOURCE_INFO, TERRAIN_INFO, BUILDINGS, DEV_CARDS, SPECIAL_CARDS, HEADLINES } from '../shared/content.js';

const icons = cost => Object.entries(cost).map(([r, n]) => `${n} ${RESOURCE_INFO[r].icon} ${RESOURCE_INFO[r].name}`).join(' + ');
const L = [];
L.push('# HYPERSCALE: Card List', '', 'Every card in the game. Generated from `shared/content.js` by `node scripts/gen-cards.mjs`; printable versions are at `/cards.html` on the game server.', '');
L.push('## Resource cards (95)', '', '| Resource | Count | Comes from | Used for |', '|---|---|---|---|');
for (const r of RESOURCES) {
  const terrain = Object.values(TERRAIN_INFO).find(t => t.resource === r);
  const uses = Object.entries(BUILDINGS).filter(([, b]) => b.cost[r]).map(([, b]) => `${b.name} (${b.cost[r]})`).join(', ');
  L.push(`| ${RESOURCE_INFO[r].icon} **${RESOURCE_INFO[r].name}** | 19 | ${terrain.name} | ${uses} |`);
}
L.push('', '## Region tiles (19)', '', '| Region | Count | Produces | Flavor |', '|---|---|---|---|');
for (const t of Object.values(TERRAIN_INFO)) L.push(`| ${t.icon} **${t.name}** | ${t.count} | ${t.resource ? RESOURCE_INFO[t.resource].name : 'nothing'} | *${t.blurb}* |`);
L.push('', '## Build-cost card (1 per player)', '', '| Build | Cost | VP | Limit | |', '|---|---|---|---|---|');
for (const b of Object.values(BUILDINGS)) L.push(`| **${b.name}** | ${icons(b.cost)} | ${b.vp || '–'} | ${b.limit || '–'} | ${b.blurb} |`);
L.push('', '## R&D cards (25)', '');
for (const [, d] of Object.entries(DEV_CARDS)) {
  if (d.variants) {
    L.push(`### ${d.name} ×${d.count}`, '', d.text, '');
    for (const v of d.variants) L.push(`- **${v.name}**: *${v.flavor}*`);
    L.push('');
  } else L.push(`### ${d.name} ×${d.count}`, '', d.text, '', `*${d.flavor}*`, '');
}
L.push('## Award cards (2)', '');
for (const s of Object.values(SPECIAL_CARDS)) L.push(`### ${s.name} (${s.vp} VP)`, '', s.text, '');
L.push(`## Headline cards (${HEADLINES.length})`, '', 'Reveal one at the start of every round; it lasts until the next round begins.', '', '| Headline | Effect | Flavor |', '|---|---|---|');
for (const h of HEADLINES) L.push(`| **${h.name}** | ${h.text} | *${h.flavor}* |`);
L.push('', '## Harbors (9)', '', '- **Spot Market** ×4: trade 3 identical resources for any 1.', ...RESOURCES.map(r => `- **${RESOURCE_INFO[r].name} Supplier** ×1: trade 2 ${RESOURCE_INFO[r].name} for any 1.`), '');
L.push('## The Regulator', '', 'One pawn. Starts on the Permit Desert. The region it stands on produces nothing. Moves on every 7 and every Lobbyist.', '');
fs.writeFileSync(new URL('../CARDS.md', import.meta.url), L.join('\n'));
console.log('wrote CARDS.md');
