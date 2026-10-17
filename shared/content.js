// HYPERSCALE: all themed names, costs and card text live here so the
// engine, the website and the rulebook agree on one source of truth.

export const RESOURCES = ['gpu', 'power', 'water', 'steel', 'talent'];

export const RESOURCE_INFO = {
  gpu:    { name: 'GPUs',   icon: '🧠', color: '#8b5cf6', terrain: 'fab' },
  power:  { name: 'Power',  icon: '⚡', color: '#f59e0b', terrain: 'plant' },
  water:  { name: 'Water',  icon: '💧', color: '#0ea5e9', terrain: 'reservoir' },
  steel:  { name: 'Steel',  icon: '🏗️', color: '#64748b', terrain: 'mill' },
  talent: { name: 'Talent', icon: '🧑‍💻', color: '#10b981', terrain: 'hub' },
};

export const TERRAIN_INFO = {
  fab:       { name: 'Chip Fab',       resource: 'gpu',    count: 3, color: '#7c3aed', icon: '🏭', blurb: 'Lithography lines turning sand into accelerators.' },
  plant:     { name: 'Power Plant',    resource: 'power',  count: 4, color: '#f59e0b', icon: '⚡', blurb: 'Gas turbines, solar fields and the odd small reactor.' },
  reservoir: { name: 'Reservoir',      resource: 'water',  count: 4, color: '#0ea5e9', icon: '💧', blurb: 'Every megawatt of compute needs somewhere to dump the heat.' },
  mill:      { name: 'Steel Mill',     resource: 'steel',  count: 3, color: '#64748b', icon: '🏗️', blurb: 'Racks, beams and rebar for the buildout.' },
  hub:       { name: 'Tech Hub',       resource: 'talent', count: 4, color: '#10b981', icon: '🎓', blurb: 'Universities and startup districts full of engineers.' },
  desert:    { name: 'Permit Desert',  resource: null,     count: 1, color: '#d6b98c', icon: '🏜️', blurb: 'Cheap land, no infrastructure, and the Regulator\'s home office.' },
};

export const BUILDINGS = {
  road:       { name: 'Fiber Line',        cost: { steel: 1, talent: 1 }, vp: 0, limit: 15,
                blurb: 'Connects your sites. Build 5+ in an unbroken chain to contend for Largest Network.' },
  settlement: { name: 'Data Center',       cost: { steel: 1, talent: 1, water: 1, power: 1 }, vp: 1, limit: 5,
                blurb: '1 VP. Produces 1 resource from each adjacent region.' },
  city:       { name: 'Hyperscale Campus', cost: { gpu: 3, power: 2 }, vp: 2, limit: 4,
                blurb: 'Upgrade a Data Center. 2 VP. Produces 2 resources from each adjacent region.' },
  dev:        { name: 'R&D Card',          cost: { gpu: 1, water: 1, talent: 1 }, vp: 0,
                blurb: 'Draw a card from the R&D deck.' },
};

// type -> deck composition and text. `kind` drives engine behaviour.
export const DEV_CARDS = {
  lobbyist: {
    kind: 'lobbyist', count: 14, name: 'Lobbyist',
    text: 'Move the Regulator to any region, then take 1 random resource from a player with a building there. Counts toward Most Influence.',
    flavor: '"Senator, have you considered how many jobs this campus creates?"',
  },
  fiber: {
    kind: 'fiber', count: 2, name: 'Fiber Rollout',
    text: 'Build 2 Fiber Lines for free.',
    flavor: 'Dark fiber was already in the ground. You just had to light it.',
  },
  venture: {
    kind: 'venture', count: 2, name: 'Venture Round',
    text: 'Take any 2 resources from the bank (they can be the same).',
    flavor: 'Series F, $40B post-money, no revenue. Champagne all round.',
  },
  squeeze: {
    kind: 'squeeze', count: 2, name: 'Supply Squeeze',
    text: 'Name a resource. Every other player gives you all of that resource they hold.',
    flavor: 'You pre-ordered the next three years of global HBM output.',
  },
  vp: {
    kind: 'vp', count: 5, name: 'Breakthrough',
    text: '1 Victory Point. Keep it hidden until it wins you the game.',
    variants: [
      { name: 'Frontier Model Launch', flavor: 'Tops every leaderboard for almost a full week.' },
      { name: 'Nobel Prize',           flavor: 'Turns out protein folding was the warm-up.' },
      { name: 'Sovereign AI Deal',     flavor: 'A whole nation signs a ten-year compute contract.' },
      { name: 'Fusion PPA',            flavor: 'A power purchase agreement with a reactor that actually works.' },
      { name: 'Billion-User App',      flavor: 'Your assistant is now everyone\'s assistant.' },
    ],
  },
};

export const SPECIAL_CARDS = {
  longestRoad: { name: 'Largest Network', vp: 2,
    text: 'The first player with an unbroken chain of 5+ Fiber Lines takes this card. Someone who builds a longer chain takes it from you.' },
  largestArmy: { name: 'Most Influence',  vp: 2,
    text: 'The first player to play 3 Lobbyists takes this card. Someone who plays more Lobbyists takes it from you.' },
};

export const PORT_INFO = {
  any: { name: 'Spot Market', ratio: 3, text: 'Trade 3 identical resources for any 1.' },
  // resource ports: 2:1
};

export const GAME_NAME = 'HYPERSCALE';
export const TAGLINE = 'Build the compute. Win the future.';
export const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#f8fafc', '#f97316'];
export const PLAYER_COLOR_NAMES = ['Red', 'Blue', 'White', 'Orange'];

// Headlines: an event deck. One headline is revealed at the start of every round
// and lasts until the next round starts. `effect` drives engine behaviour.
export const HEADLINES = [
  { id: 'fabYield',    name: 'Fab Yield Breakthrough', effect: { produce: { fab: 2 } },       text: 'Chip Fabs produce double this round.', flavor: 'The new node finally works. Wafers everywhere.' },
  { id: 'exportCtl',   name: 'Export Controls',        effect: { produce: { fab: 0 } },       text: 'Chip Fabs produce nothing this round.', flavor: 'Your shipment is stuck in a customs warehouse, pending review.' },
  { id: 'reactor',     name: 'Reactor Comes Online',   effect: { produce: { plant: 2 } },     text: 'Power Plants produce double this round.', flavor: 'Twenty years of permitting, one glorious ribbon cutting.' },
  { id: 'blackouts',   name: 'Rolling Blackouts',      effect: { produce: { plant: 0 } },     text: 'Power Plants produce nothing this round.', flavor: 'The grid operator would like everyone to stop training for a bit.' },
  { id: 'rainfall',    name: 'Record Rainfall',        effect: { produce: { reservoir: 2 } }, text: 'Reservoirs produce double this round.', flavor: 'Drought declared over. Cooling towers rejoice.' },
  { id: 'heatwave',    name: 'Heat Wave',              effect: { produce: { reservoir: 0 } }, text: 'Reservoirs produce nothing this round.', flavor: 'Every chiller in the region is running flat out.' },
  { id: 'steelGlut',   name: 'Steel Glut',             effect: { produce: { mill: 2 } },      text: 'Steel Mills produce double this round.', flavor: 'Overcapacity overseas means cheap beams at home.' },
  { id: 'tariffs',     name: 'Tariff War',             effect: { produce: { mill: 0 } },      text: 'Steel Mills produce nothing this round.', flavor: 'Nobody is quite sure who started it.' },
  { id: 'hiringBoom',  name: 'Hiring Boom',            effect: { produce: { hub: 2 } },       text: 'Tech Hubs produce double this round.', flavor: 'A rival lab just imploded. Its whole team is on the market.' },
  { id: 'visaFreeze',  name: 'Visa Freeze',            effect: { produce: { hub: 0 } },       text: 'Tech Hubs produce nothing this round.', flavor: 'The offer letters are signed. The paperwork is not.' },
  { id: 'infraBill',   name: 'Infrastructure Bill',    effect: { cost: { road: { steel: 1 } } },                     text: 'Fiber Lines cost just 1 Steel this round.', flavor: 'Broadband money, finally spent on broadband.' },
  { id: 'gpuGlut',     name: 'GPU Glut',               effect: { cost: { city: { gpu: 2, power: 2 } } },             text: 'Hyperscale Campuses cost 2 GPUs + 2 Power this round.', flavor: 'Last generation\'s flagship is suddenly on clearance.' },
  { id: 'openSource',  name: 'Open-Source Release',    effect: { cost: { dev: { gpu: 1, talent: 1 } } },             text: 'R&D cards cost just 1 GPU + 1 Talent this round.', flavor: 'Someone dropped the weights on a Friday night.' },
  { id: 'taxBreak',    name: 'Tax Abatement',          effect: { cost: { settlement: { steel: 1, talent: 1, power: 1 } } }, text: 'Data Centers cost Steel + Talent + Power (no Water) this round.', flavor: 'Thirty years of property tax relief in exchange for forty jobs.' },
  { id: 'tradeSummit', name: 'Trade Summit',           effect: { maxRatio: 3 },               text: 'Everyone trades with the market at 3:1 (or better, with a port) this round.', flavor: 'Handshakes, photo ops and a very long communique.' },
  { id: 'moratorium',  name: 'Zoning Moratorium',      effect: { ban: ['settlement'] },       text: 'No new Data Centers may be built this round. Upgrades are still allowed.', flavor: 'The county board wants to "study the noise impacts".' },
  { id: 'vacation',    name: 'Regulator on Vacation',  effect: { noRegulator: true },         text: 'Rolling a 7 this round still forces discards, but the Regulator stays put and nobody is robbed.', flavor: 'Out of office until Monday. Do not expect a reply.' },
  { id: 'antitrust',   name: 'Antitrust Probe',        effect: { antitrust: 2 },              text: 'When revealed: the player(s) with the most VP return 2 random resources to the bank.', flavor: 'Investigators would like to see every email you have ever sent.' },
  { id: 'grant',       name: 'Small Business Grant',   effect: { grant: 2 },                  text: 'When revealed: the player(s) with the fewest VP take 2 random resources from the bank.', flavor: 'The application was 140 pages. Worth it.' },
];
