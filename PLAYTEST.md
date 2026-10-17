# HYPERSCALE: Playtest Report

How the game was tested, what the tests found, and what changed because of them.

## Method

1. **Rule tests.** 23 automated tests (including Quick mode and the online table logic) check every rule in the engine: board generation constraints (300 boards), snake setup and the second-placement payout, distance rule, connectivity (no building through an opponent's corner), production for Data Centers vs Campuses, the Regulator, bank shortages, 7s and discards, stealing, every R&D card, the one-card-per-turn and not-the-turn-you-bought-it rules, market ratios, player trades, Largest Network (including chains cut by an opponent), Most Influence, hidden-VP wins, Headlines, and what each player is allowed to see. A fuzz test plays 60 complete bot games and checks that every resource is conserved (bank + hands = 19).
2. **Simulated playtesting.** Four bot personalities play each other:
   - **Balanced**: no preference.
   - **Expander**: settles on Steel and Talent, builds wide (Fiber Lines and Data Centers).
   - **Campus**: settles on GPUs and Power, builds tall (Campuses).
   - **Researcher**: buys lots of R&D (Lobbyists, Breakthroughs).

   Every bot move goes through the same engine as human moves, so any illegal move a bot attempts is also a bug report. In total about 140,000 games were simulated while tuning.
3. **Browser playtesting.** Scripted browsers (Chromium via Playwright) played complete games through the real website: a human seat against three bots, two humans (one on a desktop, one on a phone-sized screen) joining by link with player-to-player trades, chat and a page reload mid-game, and a player dropping out mid-game.

The questions: Does every game end? Is any seat or strategy much stronger? How long is a game? Do the awards, R&D cards and Headlines matter?

## What we found and changed

| # | Finding | Change |
|---|---|---|
| 1 | Engine was solid from the start: 0 stalled games in 10,000+. One bot bug (it tried to play Fiber Rollout with nowhere to build; the engine correctly refused). | Fixed the bot. |
| 2 | **Strategies were unbalanced.** With Catan's development-card cost (GPU + Power + Water), a single Campus bot beat three Balanced bots **31.8%** of the time and a Researcher **31.3%**, but an Expander only **20.6%** (fair is 25%). | See 3 to 5. |
| 3 | Was it supply? Tried 4 Steel Mills and 3 Reservoirs instead of 3 and 4. Expander stayed at about 20%. | Reverted: not a supply problem. |
| 4 | Was it a weak bot? Tried five tunings of the Expander's priorities. The best reached 24%, still well below the tall strategies. | So the rules favoured GPU/Power play. |
| 5 | Tested four cost changes. Making **R&D cost GPU + Water + Talent** (Talent replaces Power) narrowed the spread the most while keeping the game length. It also fits the theme: research runs on people. | **Adopted.** Spread fell from about 11 points to about 4. |
| 6 | **Headlines** (new event deck) left game length unchanged, but the first version nudged Researcher up (27.9% vs 23.3% without Headlines) because its discounts all helped tall strategies. | Added **Tax Abatement** (a Data Center discount) and re-pointed **Open-Source Release** at the new R&D cost. |
| 7 | **2-player games** at 10 VP took a median 28.5 rounds, which drags with only two people. | 2 players now play to **8 VP** by default: median 23 rounds. (The first player wins about 52% either way.) |
| 8 | In a browser game a human was asked to answer **104 bot trade offers**, and each unanswered offer paused the bot for 15 seconds. | Bots now make at most one offer per turn, only when a single card short of a build, and wait 10 seconds for answers. |
| 9 | Browser bugs: a click could be swallowed when a live update redrew the panel mid-click; the Campus upgrade ring was only clickable on its outline; trade offers appeared off-screen on phones; tap targets were tiny on phones. | Panels now only redraw when their content changes; the ring is filled; offers pin to the top on phones; spots have larger invisible touch areas and the board fills the screen width. |
| 10 | A friend leaving mid-game would freeze the table. | The host can hand an offline player's seat to a bot. |
| 11 | **Too long for a game night online.** The time model below put a 4-player Classic game at about 70 minutes; the target was 30 to 40. | Added **Quick mode** (now the default): 8 VP, both starting Data Centers pay out, a 1-resource **Startup Subsidy** when a roll pays you nothing, and a small head start for later seats. 4 players: 37 min. |
| 12 | Lowering the target alone shortens the game but makes the opening matter more, and the last seat already won slightly less. | The head start for later seats was tuned until seats were even: Quick seat win rates are 25.9%, 25.2%, 24.4%, 24.5%. |

## Quick mode (the default)

**How long a game takes.** Bots don't think, so game time comes from a model of a human table, in seconds: 32 per turn (roll, read the board, talk), 10 per build, 18 per trade offer, 8 per market trade, 12 per discard, 15 per Regulator move, 12 per R&D card played, and 25 per setup placement. Calibrated this way, Classic comes out at 71 minutes for four players, in line with how long Catan usually takes.

| Players | Quick: minutes (median, 10th to 90th pct) | Quick: rounds | Classic: minutes |
|---|---|---|---|
| 4 | **37** (28 to 47) | 7.8 | 71 (53 to 88) |
| 3 | **32** (24 to 42) | 9.7 | 60 (46 to 76) |
| 2 | **28** (21 to 36) | 14.0 | 42 (31 to 54) |

**Fairness in Quick mode** (3,000 4-player games, mixed strategies; 0 stalled games at any player count):

- Win rate by seat, 1st to last: 25.9%, 25.2%, 24.4%, 24.5% (3 players: 34.7%, 33.7%, 31.6%; 2 players: 51.0%, 49.0%).
- One challenger against three Balanced bots (2,000 games each, fair = 25%): Expander 25.1%, Campus 23.9%, Researcher 26.0%. That is tighter than Classic.

## Final numbers (Classic rules)

**Game length and fairness by player count** (mixed bot strategies):

| Players | Games | Rounds (median) | Rounds (10th to 90th pct) | Win rate by seat, 1st to last | Stalled games |
|---|---|---|---|---|---|
| 4 | 4,000 | 17.8 | 13.3 to 22.8 | 26.6%, 27.2%, 24.1%, 22.1% | 0 |
| 3 | 3,000 | 21.0 | 15.7 to 27.3 | 35.8%, 32.2%, 32.1% | 0 |
| 2 (8 VP) | 3,000 | 23.0 | 17 to 31 | 52.2%, 47.8% | 0 |

A "round" is one turn for each player. Humans trade more and think longer than bots; expect 60 to 90 minutes for four players in Classic.

**Strategy balance**: one challenger against three Balanced bots, 4 players, 2,000 games each (fair = 25%):

| Challenger | Original R&D cost | Final rules |
|---|---|---|
| Expander (wide) | 21.1% | 21.8% |
| Campus (tall) | 27.9% | 23.6% |
| Researcher (R&D) | 31.6% | 25.7% |

Expansion is still the hardest strategy to win with, but the gap to the strongest strategy fell from about 10 points to 4.

**Where the winner's 10 points come from** (4 players): 7.0 from buildings (about 2.3 Data Centers and 2.4 Campuses), 1.1 from Largest Network, 0.8 from Most Influence, 1.2 from Breakthroughs. Largest Network was claimed in 99% of games and Most Influence in 84%, so both awards matter without dominating.

**Economy** (4 players): production splits GPUs 18%, Power 22.5%, Water 22%, Steel 16.5%, Talent 21% (Steel and GPUs are the scarce pair by design, as brick and ore are in Catan). A 7 comes up 16.7% of the time; per game the bots bought 15 R&D cards, made 22 market trades and 5 player trades, and discarded 25 cards to audits. Close games are the norm: the runner-up averaged 7.7 VP.

**Headlines on vs off** (4 players): median length 17.8 vs 18.0 rounds; strategy win rates stay within a few points of each other either way. Headlines change how each round feels without changing the overall balance, which is why they're on by default.

## Known limits and what to watch with real players

- Bots are good, not expert. They don't bluff, hoard for a known Headline, or gang up on the leader the way people do. The numbers above say the rules have no runaway strategy; they can't promise a human meta won't find one.
- In Classic, the last seat wins slightly less (about 22% vs 25%), as in Catan. Quick mode's head start fixes this; Classic keeps the original rules.
- **Supply Squeeze** is the swingiest card in the deck (it can take 6+ cards). There are only 2.
- Re-run the simulator after any rule change: `node sim/simulate.js 3000 4 mixed` and `node sim/simulate.js 2000 4 solo:expander` (Classic), or add Quick's options as a fifth argument: `'{"vpToWin":8,"setupPayoutBoth":true,"dryRollGrant":1,"seatBonus":{"2":[0,1],"3":[0,1,2],"4":[0,0,1,2]}}'`.
