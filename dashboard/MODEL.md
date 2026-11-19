# How the radar prices a launch

This page answers one question for 226 protocols: **if this protocol issued a token today, what would it
be worth, and what should you do about it?** Every number on the board comes from one sealed snapshot of
DefiLlama's protocol list, and every number can be re-derived from that snapshot alone. Nothing is
hand-tuned per protocol, and no protocol's name appears anywhere in the model.

## The one line

```
implied = TVL × curve(TVL) × tilt × growth × maturity × reach
```

`implied` is a whole number of dollars, and it is the board's rank key: rank 1 is the highest.

## The curve: what the market already pays

A protocol's TVL is not its token's value — a token's value is a *multiple* of TVL, and that multiple is
not constant. The snapshot carries 128 protocols whose token already trades, with both their TVL and
their market cap, so the market's own price per dollar of TVL can be measured instead of assumed. Fit a
line through those 128 points in log-log space:

```
log2(market cap) = a + b × log2(TVL)
```

and the multiple of TVL at any size falls out of it as `2^a × TVL^(b-1)`. On this snapshot the fit gives
`b ≈ 0.52`, so the multiple *falls* with size: about 0.5× at $10M of TVL, 0.09× at $100M, 0.03× at $1B.
That is the single most important fact in this dataset, and a model that prices every protocol at one
flat multiple — the obvious first implementation — gets it badly wrong at both ends.

The coefficients are refitted from whatever snapshot the program is handed, at build time. There is no
hardcoded constant and no cached curve: `fitSizeCurve()` in `lib/model.ts` runs on the snapshot, and the
page prints the `a` and `b` it produced.

## The tilt: a category that the market pays more for

Two protocols of the same size are not worth the same if the market pays their category differently. For
each category with at least three live-token peers, take the median `market cap ÷ TVL` of those peers
against the whole market's median, take the square root (half the difference, so a category can lean the
value but not set it), and clamp to 0.6–1.6:

```
tilt = clamp( sqrt(category median multiple ÷ market median multiple), 0.6, 1.6 )
```

A category with fewer than three live-token peers gets no tilt — one outlier is not a category price —
and the row says `curve` instead of a tilt in the table. The square root and the clamp are deliberate: a
category with three wild peers should not outrank a protocol ten times its size.

## The three multipliers that are not size

- **growth** — `1 + clamp(change_7d, −50, +100)% × 0.35`. Clamped at both ends: a −80% collapse is not a
  launch signal and a +300% week is not a valuation. The 0.35 weight keeps it an adjustment.
- **maturity** — `0.72 + min(age_days, 1460) ÷ 1460 × 0.36`. Age is the days the snapshot has tracked the
  protocol with no token. A protocol that has held deposits for four years without issuing a token has
  more of a launch behind it than one listed last month; past four years the multiplier stops growing.
- **reach** — `1 + 0.05 × (min(chains, 4) − 1)`. A protocol deployed on four chains has more surface to
  farm and more places to be counted, and past four chains the multiplier stops growing.

The backtest below is why these three are small: TVL carries most of the signal, and a model that let
growth and age dominate would rank worse, not better.

## Does it work? The backtest

The honest question about any valuation model is what it does on protocols whose answer is already known.
So the program runs one on itself: for each of the 119 live-token protocols with a market cap, refit the
curve *without that protocol*, measure its category tilt *without that protocol*, price it with the same
function the board uses, and compare.

| Measure | Result |
| --- | --- |
| Protocols tested (left out one at a time) | 119 |
| Median error | 3.7× either way |
| Within a factor of two | 34% |
| Rank correlation with the market's own cap | 0.35 |

And the curve is calibrated in a way that matters more than any single call: in every TVL band, the
multiple the curve pays lands within a third of the median multiple the market actually pays there.

| TVL band | Protocols | Market's median multiple | What the curve pays |
| --- | --- | --- | --- |
| $5M–10M | 27 | 0.654× | 0.566× |
| $10M–100M | 66 | 0.302× | 0.277× |
| $100M–1B | 16 | 0.082× | 0.092× |
| $1B+ | 10 | 0.020× | 0.026× |

**Read that table before you trust a row.** A market cap is not a function of TVL alone: float, supply,
unlock schedule and liquidity all move it, and the snapshot carries none of them. So the model calls the
*size* of a launch, not its price. The 3.7× median error is the band a single row sits in, and the page
prints it next to the number instead of hiding it. What the model is good for is what the board uses it
for: putting 226 protocols in an order a reader can act on, with the reasoning visible.

## Coverage: every protocol is accounted for

The snapshot holds 758 protocols. All 758 are accounted for, and the page says where each one went:

- **226 ranked** — every pre-token protocol the watchlist's rules leave in scope, all 40 watchlist
  protocols among them.
- **128 already trading** — shown apart, at the market's own value. They are never mixed into the board,
  because a protocol whose token exists is not a launch to price; they are the model's input.
- **404 out of scope** — 42 centralised exchanges, 11 versioned pools of another protocol, and the rest
  wrapped, staked or bridged products of another protocol. A wrapped or staked product of a token that
  already trades is not a protocol waiting on a launch of its own.

## The farm plan

Every ranked row carries seven steps, each with what it costs and how long it takes: the wallet, the
position, the second action the protocol's own accounting counts, the weekly cadence, the hold, the claim
discipline (only from the protocol's own domain, never pay to claim), and the unwind plan. The steps are
derived from the protocol's own record — category, chains, TVL, age — so a curator vault gets a vault
plan and a perp desk gets a margin plan, and the capital each one asks for scales with the protocol's
size.

## What this model does not claim

- It does not predict **whether** a token is issued, or when. It prices the token a protocol's record
  implies, if one came.
- It does not know float, supply, unlock or liquidity — none of them are in the snapshot.
- It does not read news, governance or a roadmap. Two protocols with the same record get the same number.
- A 3.7× median error is wide. The board is a ranking with a stated band, not a price target.
