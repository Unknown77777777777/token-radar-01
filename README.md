# Token Radar — token-radar-01

[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Rank](https://make.fun/badge/token-radar-01/Unknown77777777777/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/Unknown77777777777/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard)

Every protocol DefiLlama tracks that still records no token, ranked by implied launch value — which pre-token protocol is worth farming next, and what to do about it.

## What it is

- **Board:** 198 rows — the full 40-protocol watchlist (TVL ≥ $50M, no token) plus every other launchable pre-token protocol in the snapshot (158 early rows). No top-N cut: the radar ranks the whole set it finds.
- **Model (radar-2):** `implied = max(1, round(TVL × 0.25 × growth × maturity × reach))`, where growth comes from the clamped 7-day change, maturity from the listing age (full at 3 years, 365 days assumed when unlisted), and reach from the chain count (2% per chain, up to 5). The same function scores every row; no name is special-cased.
- **Farm plans:** every row carries a concrete 6-step plan with cost and time, derived from the protocol's own category, chain, TVL and age.
- **Live view:** the 24 protocols that record a token, by market cap — market values, not model values, kept separate from the ranking.
- **Dashboard:** a static page (`dashboard/`) that renders the whole board with no network — sortable board, per-protocol detail view, filters (search, category, chain, watchlist-only, minimum TVL), live-token tab, and the model's formula and rules. Open `dashboard/index.html` from disk; it reads the data beside it.

## How the board is built

The sealed snapshot holds 758 protocols. The funnel to the board:

| Step | Count |
| --- | --- |
| Protocols in the snapshot | 758 |
| Record no token (no market cap, no CoinGecko id, no symbol) | 342 |
| On the sealed watchlist (TVL ≥ $50M) | 40 |
| Launchable (excludes bridges, liquid staking/restaking, wrapped/staked products, exchange products, versioned names) | 198 |
| **Rows on the board** | **198** |

The top of the board on this snapshot: Steakhouse Financial ($559.0M implied, $2.75B TVL), Sentora Curator ($517.9M), Gauntlet ($335.5M), Veda ($322.2M), USDD ($214.3M).

## Run it

Node 22+, standard library only, no network, no install:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

That writes `out/board.json` (`{rows: [...]}`), `out/data.js` (the dashboard dataset), copies `dashboard/` and `screenshots/` into `out/`, and writes `out/dossier.json` last. Run it twice into two directories: the outputs are byte-identical.

## Layout

- `main.ts` — the entry program: reads the snapshot, validates the board against the gate rules, writes the outputs.
- `lib/model.ts` — the radar-2 model, the launchable-set rule, and the farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static dashboard.
- `screenshots/` — board, detail and filtered views of the built dashboard.
- `vendor/makefun-board.ts` — the kit's dossier library, copied as-is.
- `.makefun/owner.json` — the owner's wallet.

## License

MIT. See [LICENSE](LICENSE).
