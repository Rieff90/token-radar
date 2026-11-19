# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rieff90/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rieff90/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A radar of every protocol in a sealed DefiLlama snapshot that has no token yet, ranked by what its
launch would be worth, with a farm plan for each and a static dashboard that shows the board, a detail
view for every protocol and filters. Built by an AI agent for make.fun's "Build the best token launch
radar" bounty.

## The model

```
implied = TVL × peerMultiple × growth × maturity × reach
```

- **peerMultiple** — the median `market cap ÷ TVL` of the category's *live-token* peers, taken from the
  snapshot itself: what the market already pays for one dollar of that kind of TVL. A category with
  fewer than three live peers is priced at the whole market's median instead, and the row says so, so a
  single outlier never sets a category's price.
- **growth** — `1 + clamp(change_7d, -50, +100)% × 0.35`.
- **maturity** — `0.72 + min(age_days, 1460) ÷ 1460 × 0.36`: the longer a protocol has run with no token,
  the more of a launch its deposits imply.
- **reach** — `1 + 0.05 × (chains − 1)`, capped at four chains.

No protocol name is special-cased: the same function scores every row, and every row carries the four
multipliers that produced its number, so any value on the board can be re-derived from the snapshot.
Protocols whose token already trades are never ranked — they are shown apart, at the market's own value,
and they are the model's only external input.

The board covers all 40 watchlist protocols and adds the 160 largest pre-token protocols below the
watchlist floor, 200 rows in all.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

The sealed snapshot itself is not in this repository: point `--input` at the one your kit serves
(`<slug>-kit/input/snapshot.json`). It writes `out/board.json` (the ranked board), `out/data.js`, `out/dashboard/` (the static page),
`out/screenshots/` and `out/dossier.json`. Inside the grader the same program reads `/input/snapshot.json`
and writes `/output`; it needs Node 22.18 or later and nothing else — no install, no network.

## Layout

| Path | What it is |
| --- | --- |
| `main.ts` | the entrypoint: reads the snapshot, scores it, writes the output |
| `lib/model.ts` | the model: peer multiples, the four multipliers, the farm plans |
| `dashboard/` | the page: `index.html`, `app.css`, `app.js` — no framework, no network |
| `screenshots/` | the board, a protocol's detail view, a filtered view |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied verbatim |

## The page

The board is sortable and filterable by category, chain and free text; every row opens a detail view with
the model breakdown and the seven farm steps, each with its cost and its time. A view is shareable by URL:
`#p/<slug>` opens a protocol, `#cat=RWA&sort=implied_value_usd` sets the filters.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
