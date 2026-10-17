# HYPERSCALE: Rulebook

*Build the compute. Win the future.*

2 to 4 players · 30 to 40 minutes (Quick) or 60 to 90 minutes (Classic) · ages 10+

The AI race is on. Every lab on the island needs **GPUs**, **Power**, **Water**, **Steel** and **Talent**, and there is not enough of any of them. You will lay fiber, raise Data Centers, upgrade them into Hyperscale Campuses, fund R&D, and send Lobbyists to get the Regulator off your back and onto your rivals. The first operator to reach **8 Victory Points** (10 in a Classic game) wins.

If you know *Settlers of Catan*, you already know how to play: see [the quick translation](#for-catan-players) at the end. HYPERSCALE adds a deck of **Headlines** that shakes up every round, and tunes the costs so tall, wide and research-heavy strategies are all viable.

### Quick or Classic?

The rules below are the same for both. Quick is the default on the website.

| | **Quick** (30 to 40 min) | **Classic** (60 to 90 min) |
|---|---|---|
| Points to win | **8** | 10 (8 with two players) |
| Starting resources | from **both** starting Data Centers | from your second Data Center only |
| Head start for later seats | after setup, the 3rd player takes 1 random resource from the bank and the 4th takes 2 (3 players: 2nd takes 1, 3rd takes 2; 2 players: 2nd takes 1) | none |
| Startup Subsidy | when a production roll (not a 7) pays you nothing, take 1 random resource from the bank | none |

The Startup Subsidy and the head start keep everyone building from the first round, which is where most of the time saving comes from. They also make up for the small disadvantage of going last.

---

## 1. Components

| Component | Count |
|---|---|
| Region tiles | 19: 3 Chip Fabs, 4 Power Plants, 4 Reservoirs, 3 Steel Mills, 4 Tech Hubs, 1 Permit Desert |
| Number tokens | 18: one each of 2 and 12, two each of 3, 4, 5, 6, 8, 9, 10, 11 |
| Harbor markers | 9: 4 Spot Markets (3:1), 5 Suppliers (2:1, one per resource) |
| Resource cards | 95: 19 each of GPUs, Power, Water, Steel, Talent |
| R&D cards | 25: 14 Lobbyists, 5 Breakthroughs, 2 Fiber Rollouts, 2 Venture Rounds, 2 Supply Squeezes |
| Headline cards | 19 |
| Award cards | 2: Largest Network, Most Influence |
| Per player | 15 Fiber Lines, 5 Data Centers, 4 Hyperscale Campuses, 1 build-cost card |
| Other | 1 Regulator pawn, 2 dice |

Every card is listed with its text in [CARDS.md](CARDS.md), and the website prints them at `/cards.html`.

## 2. The island

| Region | Produces | Tiles |
|---|---|---|
| 🏭 Chip Fab | 🧠 GPUs | 3 |
| ⚡ Power Plant | ⚡ Power | 4 |
| 💧 Reservoir | 💧 Water | 4 |
| 🏗️ Steel Mill | 🏗️ Steel | 3 |
| 🎓 Tech Hub | 🧑‍💻 Talent | 4 |
| 🏜️ Permit Desert | nothing | 1 |

**Building the board.** Shuffle the 19 region tiles into a hexagon (rows of 3, 4, 5, 4, 3). Place a number token on every region except the Permit Desert. Two rules keep boards fair (the website enforces both automatically):

- a **6 or 8** may not touch another 6 or 8;
- two tokens with the **same number** may not touch.

Place the 9 harbors around the coast, each touching two coastal corners, with at least one empty corner between neighbouring harbors. Put the **Regulator** on the Permit Desert.

**Corners and edges.** You build Data Centers and Campuses on **corners** (where up to three regions meet) and Fiber Lines on **edges** (the borders between corners).

## 3. Setup

1. Pick a start player at random.
2. **First round of placement**, clockwise: each player places 1 Data Center on any free corner and 1 Fiber Line touching it.
3. **Second round of placement**, in reverse order (the last player goes again first): each player places another Data Center and Fiber Line.
4. Each player immediately collects **one resource from every region touching their second Data Center** (in a Quick game, from **both** Data Centers). In a Quick game, later seats then take their head start (see the table above).
5. The start player begins the first turn. If you play with Headlines, reveal the first Headline now.

**Distance rule (always applies):** a Data Center may never be built on a corner adjacent to another Data Center or Campus, yours or anyone else's. Every building needs at least two Fiber-Line lengths of space.

## 4. Your turn

Each turn has three parts.

### 4.1 Roll for production

Roll both dice. Every region showing that number **produces**: each Data Center on its corners collects 1 of its resource, each Hyperscale Campus collects 2. Everyone collects, not only the active player.

- A region with the **Regulator** on it produces nothing.
- **Bank shortage:** if the bank cannot pay everybody a given resource, nobody receives that resource this roll (if only one player is owed it, they take what is left).

You may play one R&D card **before** rolling (usually a Lobbyist to move the Regulator off your best region).

### 4.2 A 7: the Regulatory Audit

Nothing produces on a 7. Instead:

1. **Discard:** every player holding **more than 7** resource cards returns half of them (rounded down) to the bank. They choose which.
2. **Move the Regulator:** the active player must move the Regulator to a different region.
3. **Take a resource:** the active player takes 1 random resource card from one player with a building on that region (if there are several, the active player picks whom; players with no cards cannot be targeted).

### 4.3 Trade and build (any order, as often as you like)

**Trading with the market.** Trade 4 identical resources to the bank for any 1 resource. If you have a building on a harbor you get a better rate: a **Spot Market** lets you trade 3 identical resources for 1, and a **Supplier** lets you trade 2 of its pictured resource for 1.

**Trading with players.** On your turn you may propose any trade to the other players (for example "2 Water for 1 GPU"). Anyone may accept; you choose which acceptor to complete the trade with. Players may only trade with the active player, never with each other directly. You cannot give cards away for nothing.

**Building.** Pay the cost to the bank:

| Build | Cost | Points | Notes |
|---|---|---|---|
| **Fiber Line** | 🏗️ Steel + 🧑‍💻 Talent | 0 | Must connect to your own Fiber Line, Data Center or Campus. You cannot build *through* a corner occupied by an opponent's building. 15 per player. |
| **Data Center** | 🏗️ Steel + 🧑‍💻 Talent + 💧 Water + ⚡ Power | 1 | Must touch one of your Fiber Lines, and obey the distance rule. 5 per player. |
| **Hyperscale Campus** | 🧠🧠🧠 3 GPUs + ⚡⚡ 2 Power | 2 | Replaces one of your Data Centers (the Data Center returns to your supply). Produces 2 per roll. 4 per player. |
| **R&D card** | 🧠 GPU + 💧 Water + 🧑‍💻 Talent | ? | Draw the top R&D card and keep it secret. |

When you are done, say "end of turn" and pass the dice to the left.

## 5. R&D cards

You may play **one** R&D card per turn, at any point of your turn (even before rolling), but **not on the turn you bought it**. Breakthroughs are never played: they simply count.

| Card | Count | Effect |
|---|---|---|
| 🕴️ **Lobbyist** | 14 | Move the Regulator to any other region and take 1 random resource from a player with a building there. Keep played Lobbyists face up: they count toward **Most Influence**. |
| 🌐 **Fiber Rollout** | 2 | Build 2 Fiber Lines for free. |
| 💰 **Venture Round** | 2 | Take any 2 resources from the bank (they can be the same). |
| 📦 **Supply Squeeze** | 2 | Name a resource. Every other player must give you all of that resource they hold. |
| 🏆 **Breakthrough** | 5 | +1 VP, kept hidden: Frontier Model Launch, Nobel Prize, Sovereign AI Deal, Fusion PPA, Billion-User App. |

## 6. Awards (2 VP each)

- 🌐 **Largest Network.** The first player with an unbroken chain of **5 or more Fiber Lines** takes this card. Only the longest single path counts (branches don't add up), and an opponent's building on one of your corners splits your chain. If someone builds a strictly longer chain, they take the card. If the holder's chain is broken and several players tie for the new longest, nobody holds the card until one of them pulls ahead.
- 🏛️ **Most Influence.** The first player to have played **3 Lobbyists** takes this card. Someone who has played strictly more Lobbyists takes it from them.

## 7. Headlines (recommended; can be switched off)

At the start of every round (when the start player begins their turn), reveal the top Headline. It applies to everybody **until the next round starts**. When the deck runs out, shuffle all 19 back in. Headlines come in three kinds:

- **Booms and busts** (10 cards): each region type has one Headline that doubles its production for the round and one that shuts it down. *Fab Yield Breakthrough / Export Controls, Reactor Comes Online / Rolling Blackouts, Record Rainfall / Heat Wave, Steel Glut / Tariff War, Hiring Boom / Visa Freeze.*
- **Discounts and rules** (7 cards): *Infrastructure Bill* (Fiber Lines cost 1 Steel), *GPU Glut* (Campuses cost 2 GPUs + 2 Power), *Open-Source Release* (R&D costs 1 GPU + 1 Talent), *Tax Abatement* (Data Centers need no Water), *Trade Summit* (everyone trades at 3:1 or better), *Zoning Moratorium* (no new Data Centers this round), *Regulator on Vacation* (a 7 still forces discards, but the Regulator doesn't move).
- **Catch-up** (2 cards): *Antitrust Probe* (the VP leader or leaders return 2 random resources to the bank) and *Small Business Grant* (the player or players with the fewest VP take 2 random resources from the bank).

Headlines make each round feel different and reward players who plan around them (hold your Talent before a Visa Freeze, save GPUs for a GPU Glut). In our simulations they did not change average game length.

## 8. Winning

The first player to have **8 Victory Points (Quick) or 10 (Classic) on their own turn** wins immediately. Count: 1 per Data Center, 2 per Campus, 2 for each award, 1 per Breakthrough card (reveal them to win). If you reach the target on someone else's turn, you win as soon as your turn begins.

## 9. Variants

- **Two players, Classic:** play to **8 VP** (the website does this automatically). In simulations, 2-player games at 10 VP ran a median 28.5 rounds; at 8 VP, 23.
- **Friendly Regulator:** the Regulator may not be moved onto a region touching a player with 2 or fewer public VP (unless no other region is allowed). Good for new players.
- **No Headlines:** classic, steadier economy.

## 10. Strategy notes

- **Diversify early.** Data Centers need four different resources; a start without Steel or Talent will be stuck trading.
- **The two economies.** Steel + Talent drive expansion (Fiber Lines and Data Centers); GPUs + Power drive Campuses. Water feeds both Data Centers and R&D. Pick a lane, but keep an option on the other.
- **Harbors are a strategy.** A 2:1 Supplier on a resource you produce heavily turns a glut into anything you need.
- **Hold 7 or fewer** at the end of your turn whenever you can. One audit can cost you a whole Campus.
- **Lobbyists do triple duty:** they free your production, hurt the leader, and build toward 2 VP.

## For Catan players

| Catan | HYPERSCALE |
|---|---|
| Brick / Lumber / Wool / Grain / Ore | Steel / Talent / Water / Power / GPUs |
| Road | Fiber Line (Steel + Talent) |
| Settlement | Data Center (Steel + Talent + Water + Power) |
| City | Hyperscale Campus (3 GPUs + 2 Power) |
| Development card | R&D card (**GPU + Water + Talent**: note the change) |
| Knight / Largest Army | Lobbyist / Most Influence |
| Road Building / Year of Plenty / Monopoly | Fiber Rollout / Venture Round / Supply Squeeze |
| Victory Point cards | Breakthroughs |
| Longest Road | Largest Network |
| Robber / Desert | Regulator / Permit Desert |
| Harbors | Spot Markets (3:1) and Suppliers (2:1) |
| 10 points to win | 8 (Quick, the default) or 10 (Classic) |
| — | **Headlines** event deck (new) |

The R&D card costs Talent where Catan's development card costs Grain. In playtesting, the Catan-equivalent cost let an R&D-heavy player win 32% of 4-player games and an expansion player only 21%; with the new cost every tested strategy wins between 22% and 26% (fair is 25%). See [PLAYTEST.md](PLAYTEST.md).
