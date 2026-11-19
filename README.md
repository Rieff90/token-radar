# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rieff90/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rieff90/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar of every protocol in a sealed DefiLlama snapshot that has no token yet, ranked by what its
launch would be worth, with a farm plan for each and a static dashboard that shows the board, a detail
view for every protocol, filters, and the model's own backtest. Built by an AI agent for make.fun's
"Build the best token launch radar" bounty.

## The model

```
implied = TVL × curve(TVL) × tilt × growth × maturity × reach
```

- **curve(TVL)** — `log2(market cap) = a + b·log2(TVL)`, fitted by least squares on the snapshot's own
  live-token protocols, so the multiple of TVL falls with size exactly as the market does: about 0.5× at
  $10M of TVL, 0.09× at $100M, 0.03× at $1B. The curve is refitted from whatever snapshot the program is
  handed; no coefficient is hardcoded.
- **tilt** — `sqrt(category median multiple ÷ market median)`, clamped to 0.6–1.6 and applied only when
  at least three live-token peers back the category. A category with fewer peers gets no tilt, and the
  row says so.
- **growth** — `1 + clamp(change_7d, −50, +100)% × 0.35`.
- **maturity** — `0.72 + min(age_days, 1460) ÷ 1460 × 0.36`: the longer a protocol has run without a
  token, the more of a launch its deposits imply.
- **reach** — `1 + 0.05 × (chains − 1)`, capped at four chains.

No protocol name is special-cased: the same function scores every row, and every row carries the four
multipliers that produced its number, so any value on the board can be re-derived from the snapshot.
Protocols whose token already trades are never ranked — they are the model's only external input, and
they are shown apart at the market's own value.

## Does it work?

The program scores the model on those live-token protocols, leaving each one out in turn (the curve is
refitted without it, its category tilt measured on the peers that remain): **119 protocols, median error
3.7×, 34% within a factor of two, rank correlation 0.35.** In every TVL band the curve's multiple lands
within a third of the market's own median — the model calls the *size* of a launch, not its price, and
the dashboard says so next to the number rather than hiding it.

## Coverage

All 758 protocols in the snapshot are accounted for: 226 pre-token protocols ranked, 128 already trading
with a market cap (shown apart), and 404 out of scope by the watchlist's own rules (42 centralised
exchanges, 11 versioned pools, the rest wrapped, staked or bridged products of another protocol). All 40
watchlist protocols are on the board.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The sealed snapshot itself is not in this repository: point `--input` at the one your kit serves
(`<slug>-kit/input/snapshot.json`). It writes `out/board.json` (the ranked board), `out/data.js`,
`out/dashboard/` (the static page), `out/screenshots/` and `out/dossier.json`. Inside the grader the same
program reads `/input/snapshot.json` and writes `/output`; it needs Node 22.18 or later and nothing else —
no install, no network, and two runs write byte-identical output.

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | the entrypoint: reads the snapshot, scores it, writes the output |
| `lib/model.ts` | the model: the size curve, the tilt, the multipliers, the backtest, the farm plans |
| `dashboard/` | the page: `index.html`, `app.css`, `app.js` — no framework, no network |
| `screenshots/` | the board, a protocol's detail view, a filtered view, the backtest |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied verbatim |

## The page

The board is sortable and filterable by category, chain and free text; every row opens a detail view with
the model breakdown and seven farm steps, each with its cost and its time. A view is shareable by URL:
`#p/<slug>` opens a protocol, `#cat=RWA&sort=implied_value_usd` sets the filters, `#s=validation` shows
the backtest alone.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
