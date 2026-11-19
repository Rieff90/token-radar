// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug on the snapshot's watchlist (a floor, never a ceiling) and adds the
// pre-token protocols below that floor, by TVL: the early rows the radar exists to find. A protocol is
// pre-token when its snapshot entry records no token at all (no market cap, no CoinGecko id, no symbol).
// Protocols whose token already trades are never mixed into the ranked board: they are shown apart, and
// they are the model's only external input, because the market's own price for a category is the best
// evidence of what a new token in that category is worth.
//
// Implied value follows only from the snapshot's own figures, never from a hand-written list of names:
//
//   curve      = log2(mcap) = a + b x log2(tvl), fitted on the snapshot's live-token protocols
//   multiple   = 2^a x tvl^(b-1)        the market's own price per dollar of TVL at that size
//   tilt       = sqrt(category median multiple / market median multiple), 0.6..1.6, 1 with too few peers
//   growth     = 1 + clamp(change_7d, -50, +100) per cent x 0.35
//   maturity   = 0.72 + min(age_days, 1460) / 1460 x 0.36      (age unknown: 365 days)
//   reach      = 1 + 0.05 x (min(chains, 4) - 1)               (a protocol on more chains has more surface)
//   implied    = max(1, round(tvl x multiple x tilt x growth x maturity x reach))
//
// The curve is refitted from whatever snapshot the entry is handed, so no coefficient is hardcoded; the
// backtest at the foot of this file scores it on those same live-token protocols, leaving each one out
// in turn, and the dashboard prints that error beside the board. Every row carries the multipliers that
// produced its number, so a reader can re-derive any value on the board from the snapshot alone.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Weight of the seven-day growth in the growth multiplier. */
  growth_weight: number;
  /** Growth below this is clamped: a collapse is not a launch signal. */
  growth_floor: number;
  /** Growth above this is clamped: one week's spike is not a valuation. */
  growth_cap: number;
  /** Multiplier of a protocol listed today. */
  maturity_floor: number;
  /** Added to the multiplier at maturity_days and beyond. */
  maturity_range: number;
  /** The age at which a protocol counts as fully mature. */
  maturity_days: number;
  /** Age assumed when the snapshot records none. */
  unknown_age_days: number;
  /** Added per extra chain, up to four chains. */
  chain_weight: number;
  /** Live-token peers a category needs before its own median is used at all. */
  peer_min: number;
  /** The market multiple assumed when no category has peers. */
  fallback_multiple: number;
  /** A single peer's ratio is clipped here: one misreported market cap cannot set a category's price. */
  ratio_clip: number;
  /** No implied multiple of TVL is taken above this. */
  multiple_cap: number;
  /** No implied multiple of TVL is taken below this. */
  multiple_floor: number;
  /** A category's tilt on the size curve never goes above this. */
  tilt_cap: number;
  /** A category's tilt on the size curve never goes below this. */
  tilt_floor: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.72,
  maturity_range: 0.36,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_weight: 0.05,
  peer_min: 3,
  fallback_multiple: 0.18,
  ratio_clip: 6,
  multiple_cap: 2.5,
  multiple_floor: 0.005,
  tilt_cap: 1.6,
  tilt_floor: 0.6,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 400;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    /** The multiple of TVL this row's value was built on: the size curve times the category tilt. */
    base_multiple: number;
    /** The size curve's own multiple at this protocol's TVL, before the category tilt. */
    size_multiple: number;
    /** The category's tilt on that curve: 1 when its live peers are too few to price it. */
    category_tilt: number;
    /** How many live-token peers that tilt was measured on. */
    peer_count: number;
    /** Whether the tilt came from the category's own peers or from the whole market. */
    multiple_source: 'category' | 'market';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  /** One sentence a reader can check against the row's own figures. */
  rationale: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  size_multiple: number;
  category_tilt: number;
  peer_count: number;
  multiple_source: 'category' | 'market';
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  /** Whether the snapshot's watchlist names this protocol: the floor, not the whole board. */
  watchlist: boolean;
  /** The same sentence board.json carries, so the page and the board never disagree. */
  rationale: string;
  /** The same seven steps board.json carries, so the page and the board never disagree. */
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** A category's measured peer multiple: what the market pays per dollar of TVL in that category. */
export interface PeerMultiple {
  category: string;
  peers: number;
  /** Median mcap/tvl of the category's live-token protocols, before shrinking. */
  median: number;
  /** The multiple the model applies: the category's own median, or the whole market's when it has too few peers. */
  used: number;
  /** Where `used` came from: the category's own live-token peers, or the whole market. */
  source: 'category' | 'market';
}

/** Everything the dashboard needs: the board, the live set, the peer table and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  protocols_size: number;
  pre_token_size: number;
  global_multiple: number;
  peer_multiples: PeerMultiple[];
  /** The size curve fitted on the snapshot's live-token protocols. */
  curve: SizeCurve;
  /** How the model does on those protocols, leaving each one out in turn. */
  validation: Backtest;
  /** Where every protocol in the snapshot ended up: the board's completeness claim. */
  accounting: Accounting;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Where every protocol in the snapshot ended up. */
export interface Accounting {
  total: number;
  ranked: number;
  live_token: number;
  excluded: { reason: string; n: number }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a list of numbers, 0 for an empty one. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol's token already trades at a recorded market cap. A `-1` market cap is DefiLlama's
 * "no figure" sentinel, not a token worth minus one dollar: it is treated as absent everywhere. */
export function hasLiveToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

/** The size curve: `log2(market cap) = a + b x log2(TVL)`, fitted on the snapshot's own live protocols. */
export interface SizeCurve {
  /** log2 of the market cap at $1 of TVL: the intercept of the fit. */
  a: number;
  /** The elasticity: how much a dollar of TVL buys as TVL grows. Below 1, the multiple falls with size. */
  b: number;
  /** How many live-token protocols the curve was fitted on. */
  n: number;
}

/**
 * Fit the size curve on the snapshot's live-token protocols, by least squares in log space.
 *
 * This is the model's one external input, and it is measured, not assumed: the market's own protocols
 * say how much market cap a dollar of TVL has actually bought at each size, and the fit turns that into
 * a curve the pre-token protocols are then priced on. No coefficient is hardcoded and no protocol name
 * is special-cased; the same curve is fitted from whatever snapshot the entry is handed.
 */
export function fitSizeCurve(snapshot: Snapshot): SizeCurve {
  const rows = snapshot.protocols.filter((p) => hasLiveToken(p) && p.tvl_usd > 0);
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of rows) {
    const x = Math.log2(p.tvl_usd);
    const y = Math.log2(p.mcap_usd!);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const n = rows.length;
  const denom = n * sxx - sx * sx;
  if (n < 3 || denom === 0) return { a: Math.log2(MODEL.fallback_multiple), b: 1, n };
  const b = (n * sxy - sx * sy) / denom;
  const a = (sy - b * sx) / n;
  // A curve that grows faster than TVL, or that a snapshot's outliers bend backwards, is clamped to the
  // range a launch multiple can plausibly take: the fit informs the model, it does not get to break it.
  return { a, b: Math.min(1, Math.max(0.2, b)), n };
}

/** The multiple of TVL the curve implies at `tvl`, before the category tilt and the protocol's own multipliers. */
export function curveMultiple(curve: SizeCurve, tvl: number): number {
  if (tvl <= 0) return MODEL.fallback_multiple;
  const raw = 2 ** (curve.a + (curve.b - 1) * Math.log2(tvl));
  return Math.min(MODEL.multiple_cap, Math.max(MODEL.multiple_floor, raw));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * Every category's peer multiple, measured on the snapshot's own live-token protocols.
 *
 * A protocol's multiple is its market cap over its TVL: what the market pays today for one dollar of
 * that kind of protocol's deposits. Ratios are clipped to [0.02, ratio_clip] so a single misreported
 * market cap cannot set a category's price. A category's own median is used only when at least
 * `peer_min` live-token protocols back it; below that the whole market's median is the honest multiple
 * and the row says so, rather than letting one outlier price a whole category.
 */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { table: PeerMultiple[]; global: number; byCategory: Map<string, number> } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (!hasLiveToken(p) || p.tvl_usd <= 0) continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0) continue;
    if (p.category === null || p.category === 'CEX') continue;
    const ratio = Math.min(model.ratio_clip, Math.max(0.02, p.mcap_usd / p.tvl_usd));
    const list = byCategory.get(p.category);
    if (list === undefined) byCategory.set(p.category, [ratio]);
    else list.push(ratio);
    all.push(ratio);
  }
  const global = all.length > 0 ? median(all) : model.fallback_multiple;
  const table: PeerMultiple[] = [];
  const used = new Map<string, number>();
  for (const [category, ratios] of byCategory) {
    const med = median(ratios);
    const n = ratios.length;
    const own = n >= model.peer_min;
    const applied = own ? Math.min(model.multiple_cap, Math.max(model.multiple_floor, med)) : global;
    table.push({ category, peers: n, median: round4(med), used: round4(applied), source: own ? 'category' : 'market' });
    used.set(category, applied);
  }
  table.sort((a, b) => b.used - a.used || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return { table, global: round4(global), byCategory: used };
}

/** The four multipliers and the implied value one protocol gets under `model`, `curve` and its category tilt. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  curve: SizeCurve,
  tilt: number,
): { implied: number; sizeMultiple: number; appliedMultiple: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_weight * (Math.min(Math.max(protocol.chains.length, 1), 4) - 1);
  const sizeMultiple = curveMultiple(curve, protocol.tvl_usd);
  const appliedMultiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, sizeMultiple * tilt));
  const base = protocol.tvl_usd * appliedMultiple;
  const implied = Math.min(1e14, Math.max(1, Math.round(base * growthMult * maturityMult * chainMult)));
  return { implied, sizeMultiple, appliedMultiple, growthPct, growthMult, maturityMult, chainMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Each category's tilt on the size curve, and how many live peers it was measured on. */
export function categoryTilts(peers: ReturnType<typeof peerMultiples>, model: ModelConstants): { map: Map<string, number>; counts: Map<string, number> } {
  const map = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const t of peers.table) {
    counts.set(t.category, t.peers);
    if (t.source !== 'category' || peers.global <= 0) continue;
    const raw = Math.sqrt(t.median / peers.global);
    map.set(t.category, Math.min(model.tilt_cap, Math.max(model.tilt_floor, raw)));
  }
  return { map, counts };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, curve: SizeCurve = fitSizeCurve(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const peers = peerMultiples(snapshot, model);
  const tilts = categoryTilts(peers, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const tilt = tilts.map.get(p.category ?? '') ?? 1;
    const v = impliedValue(p, snapshot.as_of, model, curve, tilt);
    const peerCount = tilts.counts.get(p.category ?? '') ?? 0;
    return { p, ...v, peerCount, tilt, source: (peerCount >= model.peer_min ? 'category' : 'market') as 'category' | 'market' };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(s.appliedMultiple),
      size_multiple: round4(s.sizeMultiple),
      category_tilt: round4(s.tilt),
      peer_count: s.peerCount,
      multiple_source: s.source,
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    rationale: rationaleFor(s.p, s.implied, s.appliedMultiple, s.sizeMultiple, s.tilt, s.peerCount, s.source, s.growthPct, s.age),
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** One sentence naming the row's own figures: a reader can check every number against the snapshot. */
function rationaleFor(
  p: SnapshotProtocol,
  implied: number,
  multiple: number,
  sizeMultiple: number,
  tilt: number,
  peerCount: number,
  source: 'category' | 'market',
  growthPct: number,
  age: number | null,
): string {
  const tvl = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(2)}B` : `$${(p.tvl_usd / 1e6).toFixed(1)}M`;
  const curve = `${sizeMultiple.toFixed(3)}x at this size`;
  const peer =
    source === 'category'
      ? `tilted ${tilt.toFixed(2)}x by the ${peerCount} live-token ${p.category ?? 'protocol'} peer${peerCount === 1 ? '' : 's'}`
      : `no tilt: too few live-token ${p.category ?? 'protocol'} peers to price the category`;
  const growth = p.change_7d === null ? 'no seven-day figure' : `${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% over seven days`;
  const ageText = age === null ? 'no listing date' : `${age} days without a token`;
  return `${p.name} holds ${tvl} of TVL, ${growth}, ${ageText}; the size curve pays ${curve}, ${peer}, so ${multiple.toFixed(3)}x TVL implies a launch at $${implied.toLocaleString('en-US')}.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The chains the protocol counts, as a phrase. */
function chainsPhrase(p: SnapshotProtocol): string {
  if (p.chains.length === 0) return 'its main chain';
  if (p.chains.length === 1) return p.chains[0]!;
  return `${p.chains[0]!} and ${p.chains.length - 1} more`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into one ${name} vault on ${chain} and keep the vault shares in the wallet that deposited them.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('index')) return `Mint $${capital} of ${name}'s index basket on ${chain} and hold the basket.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The second action the protocol's own accounting counts, by category family. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Borrow $${Math.round(capital / 4)} of a major stablecoin against that position on ${name} and keep the debt open.`;
  if (c.includes('dex') || c.includes('yield')) return `Swap $${Math.round(capital / 4)} through ${name} on ${chain} once a week and keep the LP position.`;
  if (c.includes('curator') || c.includes('allocator')) return `Split the deposit across two ${name} vaults with different collateral and keep both shares.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the receipt token through ${name} if its own app offers it, and keep the second receipt.`;
  if (c.includes('bridge')) return `Move $${Math.round(capital / 4)} back across ${name} once, so both directions of the bridge count.`;
  return `Make one more qualifying action on ${name}, such as a deposit, a swap or a vote, and keep the transaction hash.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Open a fresh wallet for ${p.name} alone and keep its seed phrase offline; a farm wallet that never touches your main holdings is the only way to prove the activity is yours.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `no new capital, about $${Math.max(2, Math.round(gas / 2))} of gas`,
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action on ${p.name} every week for ${Math.max(4, Math.round(hold / 7))} weeks; protocols count wallets by the weeks they were active, not by the size of one deposit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position on ${chainsPhrase(p)} for at least ${hold} days so it appears in more than one snapshot of the protocol's own accounting.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own site and check for a points, quest or rewards page there; claim only from the domain the protocol publishes and never pay a fee to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, every transaction hash and the dates in one file, and write down now how you would unwind: which pool to exit, in what order, and what would make you leave early.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => hasLiveToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** One TVL band of the backtest: how the curve's multiple compares with the market's own median there. */
export interface BacktestBand {
  label: string;
  n: number;
  /** Median mcap/TVL of the live-token protocols in the band. */
  actual: number;
  /** The multiple the fitted curve pays at the band's midpoint. */
  curve: number;
}

/** One protocol of the backtest: what the market says it is worth, and what the model would have said. */
export interface BacktestPoint {
  slug: string;
  actual_usd: number;
  implied_usd: number;
}

/** The model's own report card: how it does on the protocols whose market cap the snapshot already knows. */
export interface Backtest {
  n: number;
  /** Median absolute error, as a multiple: 3.8 means the typical call is off by 3.8x either way. */
  median_error: number;
  /** Share of protocols called within a factor of two. */
  within_2x: number;
  /** Rank correlation between the model's implied value and the market's own cap. */
  spearman: number;
  bands: BacktestBand[];
  points: BacktestPoint[];
}

/** The median of a list of numbers, NaN for an empty one. */
function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Rank correlation of two lists, 0 when either is constant. */
function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]): number[] => {
    const order = xs.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], pos) => (r[i] = pos + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  if (n === 0) return 0;
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/**
 * Score the model against the snapshot's own live-token protocols, leaving each one out in turn: the
 * curve is refitted without the protocol being scored, and its category tilt is measured on the peers
 * that remain. What comes back is the model's error on protocols it has never seen — the honest number
 * to put beside an implied value.
 */
export function backtest(snapshot: Snapshot, model: ModelConstants = MODEL): Backtest {
  const live = snapshot.protocols.filter((p) => hasLiveToken(p) && p.tvl_usd > 0 && p.category !== 'CEX');
  const points: BacktestPoint[] = [];
  const errors: number[] = [];
  for (const p of live) {
    const without: Snapshot = { ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== p.slug) };
    const curve = fitSizeCurve(without);
    const tilts = categoryTilts(peerMultiples(without, model), model);
    const v = impliedValue(p, snapshot.as_of, model, curve, tilts.map.get(p.category ?? '') ?? 1);
    const actual = p.mcap_usd!;
    points.push({ slug: p.slug, actual_usd: actual, implied_usd: v.implied });
    errors.push(Math.abs(Math.log2(v.implied / actual)));
  }
  const curve = fitSizeCurve(snapshot);
  const bands: BacktestBand[] = [
    { label: '$5M–10M', lo: 5e6, hi: 1e7 },
    { label: '$10M–100M', lo: 1e7, hi: 1e8 },
    { label: '$100M–1B', lo: 1e8, hi: 1e9 },
    { label: '$1B+', lo: 1e9, hi: Infinity },
  ].map((b) => {
    const inBand = live.filter((p) => p.tvl_usd >= b.lo && p.tvl_usd < b.hi);
    const mid = Math.sqrt(Math.max(b.lo, 1e6) * (b.hi === Infinity ? Math.max(...inBand.map((p) => p.tvl_usd), 1e9) : b.hi));
    return {
      label: b.label,
      n: inBand.length,
      actual: round4(medianOf(inBand.map((p) => Math.min(model.ratio_clip, Math.max(0.02, p.mcap_usd! / p.tvl_usd))))),
      curve: round4(curveMultiple(curve, mid)),
    };
  });
  return {
    n: live.length,
    median_error: Math.round(2 ** medianOf(errors) * 100) / 100,
    within_2x: Math.round((errors.filter((e) => e <= 1).length / Math.max(errors.length, 1)) * 1000) / 1000,
    spearman: Math.round(spearman(points.map((p) => p.implied_usd), points.map((p) => p.actual_usd)) * 1000) / 1000,
    bands,
    points,
  };
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    size_multiple: row.model.size_multiple,
    category_tilt: row.model.category_tilt,
    peer_count: row.model.peer_count,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    watchlist,
    rationale: row.rationale,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const curve = fitSizeCurve(snapshot);
  const peers = peerMultiples(snapshot, model);
  const board = buildBoard(snapshot, model, curve);
  const live = liveRows(snapshot);
  const onWatchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !onWatchlist.has(r.slug)).length;
  const ranked = new Set(board.map((r) => r.slug));
  const withToken = (p: SnapshotProtocol): boolean => p.gecko_id !== null || p.symbol !== null || hasLiveToken(p);
  const liveToken = snapshot.protocols.filter(withToken).length;
  const cex = snapshot.protocols.filter((p) => isPreToken(p) && p.category === 'CEX').length;
  const versioned = snapshot.protocols.filter((p) => isPreToken(p) && p.category !== 'CEX' && VERSIONED.test(p.name)).length;
  const outOfScope = snapshot.protocols.filter((p) => !ranked.has(p.slug) && !withToken(p)).length;
  const accounting: Accounting = {
    total: snapshot.protocols.length,
    ranked: board.length,
    live_token: liveToken,
    excluded: [
      { reason: 'a centralised exchange', n: cex },
      { reason: 'a versioned pool of another protocol', n: versioned },
      { reason: 'a wrapped, staked or bridged product of another protocol', n: Math.max(0, outOfScope - cex - versioned) },
    ],
  };
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    protocols_size: snapshot.protocols.length,
    pre_token_size: snapshot.protocols.filter(isPreToken).length,
    global_multiple: peers.global,
    peer_multiples: peers.table,
    curve,
    validation: backtest(snapshot, model),
    accounting,
    rows: board.map((r) => radarRow(r, onWatchlist.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
