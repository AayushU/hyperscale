# HYPERSCALE: Card List

Every card in the game. Generated from `shared/content.js` by `node scripts/gen-cards.mjs`; printable versions are at `/cards.html` on the game server.

## Resource cards (95)

| Resource | Count | Comes from | Used for |
|---|---|---|---|
| 🧠 **GPUs** | 19 | Chip Fab | Hyperscale Campus (3), R&D Card (1) |
| ⚡ **Power** | 19 | Power Plant | Data Center (1), Hyperscale Campus (2) |
| 💧 **Water** | 19 | Reservoir | Data Center (1), R&D Card (1) |
| 🏗️ **Steel** | 19 | Steel Mill | Fiber Line (1), Data Center (1) |
| 🧑‍💻 **Talent** | 19 | Tech Hub | Fiber Line (1), Data Center (1), R&D Card (1) |

## Region tiles (19)

| Region | Count | Produces | Flavor |
|---|---|---|---|
| 🏭 **Chip Fab** | 3 | GPUs | *Lithography lines turning sand into accelerators.* |
| ⚡ **Power Plant** | 4 | Power | *Gas turbines, solar fields and the odd small reactor.* |
| 💧 **Reservoir** | 4 | Water | *Every megawatt of compute needs somewhere to dump the heat.* |
| 🏗️ **Steel Mill** | 3 | Steel | *Racks, beams and rebar for the buildout.* |
| 🎓 **Tech Hub** | 4 | Talent | *Universities and startup districts full of engineers.* |
| 🏜️ **Permit Desert** | 1 | nothing | *Cheap land, no infrastructure, and the Regulator's home office.* |

## Build-cost card (1 per player)

| Build | Cost | VP | Limit | |
|---|---|---|---|---|
| **Fiber Line** | 1 🏗️ Steel + 1 🧑‍💻 Talent | – | 15 | Connects your sites. Build 5+ in an unbroken chain to contend for Largest Network. |
| **Data Center** | 1 🏗️ Steel + 1 🧑‍💻 Talent + 1 💧 Water + 1 ⚡ Power | 1 | 5 | 1 VP. Produces 1 resource from each adjacent region. |
| **Hyperscale Campus** | 3 🧠 GPUs + 2 ⚡ Power | 2 | 4 | Upgrade a Data Center. 2 VP. Produces 2 resources from each adjacent region. |
| **R&D Card** | 1 🧠 GPUs + 1 💧 Water + 1 🧑‍💻 Talent | – | – | Draw a card from the R&D deck. |

## R&D cards (25)

### Lobbyist ×14

Move the Regulator to any region, then take 1 random resource from a player with a building there. Counts toward Most Influence.

*"Senator, have you considered how many jobs this campus creates?"*

### Fiber Rollout ×2

Build 2 Fiber Lines for free.

*Dark fiber was already in the ground. You just had to light it.*

### Venture Round ×2

Take any 2 resources from the bank (they can be the same).

*Series F, $40B post-money, no revenue. Champagne all round.*

### Supply Squeeze ×2

Name a resource. Every other player gives you all of that resource they hold.

*You pre-ordered the next three years of global HBM output.*

### Breakthrough ×5

1 Victory Point. Keep it hidden until it wins you the game.

- **Frontier Model Launch**: *Tops every leaderboard for almost a full week.*
- **Nobel Prize**: *Turns out protein folding was the warm-up.*
- **Sovereign AI Deal**: *A whole nation signs a ten-year compute contract.*
- **Fusion PPA**: *A power purchase agreement with a reactor that actually works.*
- **Billion-User App**: *Your assistant is now everyone's assistant.*

## Award cards (2)

### Largest Network (2 VP)

The first player with an unbroken chain of 5+ Fiber Lines takes this card. Someone who builds a longer chain takes it from you.

### Most Influence (2 VP)

The first player to play 3 Lobbyists takes this card. Someone who plays more Lobbyists takes it from you.

## Headline cards (19)

Reveal one at the start of every round; it lasts until the next round begins.

| Headline | Effect | Flavor |
|---|---|---|
| **Fab Yield Breakthrough** | Chip Fabs produce double this round. | *The new node finally works. Wafers everywhere.* |
| **Export Controls** | Chip Fabs produce nothing this round. | *Your shipment is stuck in a customs warehouse, pending review.* |
| **Reactor Comes Online** | Power Plants produce double this round. | *Twenty years of permitting, one glorious ribbon cutting.* |
| **Rolling Blackouts** | Power Plants produce nothing this round. | *The grid operator would like everyone to stop training for a bit.* |
| **Record Rainfall** | Reservoirs produce double this round. | *Drought declared over. Cooling towers rejoice.* |
| **Heat Wave** | Reservoirs produce nothing this round. | *Every chiller in the region is running flat out.* |
| **Steel Glut** | Steel Mills produce double this round. | *Overcapacity overseas means cheap beams at home.* |
| **Tariff War** | Steel Mills produce nothing this round. | *Nobody is quite sure who started it.* |
| **Hiring Boom** | Tech Hubs produce double this round. | *A rival lab just imploded. Its whole team is on the market.* |
| **Visa Freeze** | Tech Hubs produce nothing this round. | *The offer letters are signed. The paperwork is not.* |
| **Infrastructure Bill** | Fiber Lines cost just 1 Steel this round. | *Broadband money, finally spent on broadband.* |
| **GPU Glut** | Hyperscale Campuses cost 2 GPUs + 2 Power this round. | *Last generation's flagship is suddenly on clearance.* |
| **Open-Source Release** | R&D cards cost just 1 GPU + 1 Talent this round. | *Someone dropped the weights on a Friday night.* |
| **Tax Abatement** | Data Centers cost Steel + Talent + Power (no Water) this round. | *Thirty years of property tax relief in exchange for forty jobs.* |
| **Trade Summit** | Everyone trades with the market at 3:1 (or better, with a port) this round. | *Handshakes, photo ops and a very long communique.* |
| **Zoning Moratorium** | No new Data Centers may be built this round. Upgrades are still allowed. | *The county board wants to "study the noise impacts".* |
| **Regulator on Vacation** | Rolling a 7 this round still forces discards, but the Regulator stays put and nobody is robbed. | *Out of office until Monday. Do not expect a reply.* |
| **Antitrust Probe** | When revealed: the player(s) with the most VP return 2 random resources to the bank. | *Investigators would like to see every email you have ever sent.* |
| **Small Business Grant** | When revealed: the player(s) with the fewest VP take 2 random resources from the bank. | *The application was 140 pages. Worth it.* |

## Harbors (9)

- **Spot Market** ×4: trade 3 identical resources for any 1.
- **GPUs Supplier** ×1: trade 2 GPUs for any 1.
- **Power Supplier** ×1: trade 2 Power for any 1.
- **Water Supplier** ×1: trade 2 Water for any 1.
- **Steel Supplier** ×1: trade 2 Steel for any 1.
- **Talent Supplier** ×1: trade 2 Talent for any 1.

## The Regulator

One pawn. Starts on the Permit Desert. The region it stands on produces nothing. Moves on every 7 and every Lobbyist.
