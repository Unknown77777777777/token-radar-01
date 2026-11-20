// Token Radar — model radar-2.
//
// Everything here is derived from the sealed snapshot's own figures. No
// protocol name is ever special-cased: the same functions score every row.

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  base_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  reach_multiplier: number;
  age_days: number | null;
}

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
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  age_days: number | null;
}

// Model constants (radar-2), stated in the dashboard's model section.
export const MODEL_VERSION = 'radar-2';
export const BASE_MULTIPLE = 0.25;
export const GROWTH_WEIGHT = 0.6;
export const GROWTH_FLOOR = -60;
export const GROWTH_CAP = 150;
export const MATURITY_FLOOR = 0.5;
export const MATURITY_RANGE = 0.5;
export const MATURITY_DAYS = 1095;
export const UNKNOWN_AGE_DAYS = 365;
export const REACH_PER_CHAIN = 0.02;
export const REACH_MAX_CHAINS = 5;

// What never counts as a launch waiting to happen.
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
export const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
// A space followed by a version marker: V2, v2, 2.0, V12, and the like.
const VERSION_MARKER = / (V\d+|v\d+|\d+\.\d+)$/;

const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Whole days from listed_at to as_of, clamped at 0; null when unlisted. */
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(listedAt + 'T00:00:00Z');
  const asOfMs = Date.parse(asOf + 'T00:00:00Z');
  if (Number.isNaN(listed) || Number.isNaN(asOfMs)) return null;
  return Math.max(0, Math.round((asOfMs - listed) / DAY_MS));
}

/** A protocol "records no token" when market cap, CoinGecko id and symbol are all null. */
export function recordsNoToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A pre-token protocol that is a launch waiting to happen. */
export function isLaunchable(p: Protocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  return true;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export function score(p: Protocol, asOf: string): { age: number | null; model: ModelBreakdown; implied: number } {
  const age = ageDays(p.listed_at, asOf);
  const growthPct = clamp(p.change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP);
  const growthMultiplier = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const ageForModel = age ?? UNKNOWN_AGE_DAYS;
  const maturityMultiplier =
    MATURITY_FLOOR + MATURITY_RANGE * (Math.min(Math.max(ageForModel, 0), MATURITY_DAYS) / MATURITY_DAYS);
  const reachMultiplier = 1 + REACH_PER_CHAIN * Math.min(p.chains.length, REACH_MAX_CHAINS);
  const implied = Math.max(1, Math.round(p.tvl_usd * BASE_MULTIPLE * growthMultiplier * maturityMultiplier * reachMultiplier));
  return {
    age,
    model: {
      base_multiple: BASE_MULTIPLE,
      growth_pct: growthPct,
      growth_multiplier: round6(growthMultiplier),
      maturity_multiplier: round6(maturityMultiplier),
      reach_multiplier: round6(reachMultiplier),
      age_days: age,
    },
    implied,
  };
}

// ---------------------------------------------------------------- farm plans

function capitalTier(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category-specific action for step 2, derived from the protocol's own record. */
function stepTwoAction(p: Protocol): string {
  const cat = p.category ?? '';
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const tier = capitalTier(p.tvl_usd);
  const money = `$${tier}`;
  if (cat.includes('Lending') || cat.includes('CDP') || cat.includes('Collateral')) {
    return `Supply ${money} of USDC to ${p.name} on ${chain} as collateral and leave the position open.`;
  }
  if (
    cat === 'Dexs' ||
    cat === 'Yield' ||
    cat === 'Leveraged Farming' ||
    cat === 'Yield Aggregator' ||
    cat === 'Farm' ||
    cat === 'Liquidity Manager'
  ) {
    return `Provide ${money} of liquidity to the main pool of ${p.name} on ${chain} and keep the position in range.`;
  }
  if (cat.includes('Bridge')) {
    return `Bridge ${money} of USDC to ${chain} with ${p.name} and use it inside the app once it arrives.`;
  }
  if (cat.includes('Staking') || cat === 'Restaking') {
    return `Stake ${money} of the ${chain} staking asset through ${p.name} and keep the stake bonded.`;
  }
  if (
    cat === 'Derivatives' ||
    cat === 'Options' ||
    cat === 'Options Vault' ||
    cat === 'Synthetics' ||
    cat === 'Basis Trading' ||
    cat === 'Interest Rate Derivatives'
  ) {
    return `Deposit ${money} of USDC as margin on ${p.name} on ${chain} and open one small hedge.`;
  }
  if (cat === 'Prediction Market' || cat === 'Prediction') {
    return `Fund ${p.name} on ${chain} with ${money} and place one market position.`;
  }
  if (cat === 'Risk Curators' || cat === 'Onchain Capital Allocator') {
    return `Deposit ${money} into a ${p.name} vault on ${chain} and leave the deposit working.`;
  }
  if (cat.includes('Stablecoin') || cat === 'Algo-Stables') {
    return `Mint or deposit ${money} of the stable asset of ${p.name} on ${chain} and hold it.`;
  }
  if (cat === 'RWA') {
    return `Mint ${money} of the yield asset of ${p.name} on ${chain} and hold it.`;
  }
  if (cat === 'Insurance') {
    return `Buy ${money} of cover from ${p.name} on ${chain} for the risk it prices.`;
  }
  return `Deposit ${money} of USDC into ${p.name} on ${chain} and leave the position open.`;
}

export function farmSteps(p: Protocol, asOf: string): string[] {
  const age = ageDays(p.listed_at, asOf);
  const tier = capitalTier(p.tvl_usd);
  const hold = holdDays(age);
  return [
    'Open a fresh wallet that holds only the funds for this farm and keep its seed phrase offline, away from any browser or chat. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
    `${stepTwoAction(p)} Cost: $${tier} of capital and about $4-8 of gas. Time: 15 minutes to set up.`,
    `Do one qualifying action each week on ${p.name} — a deposit, borrow, swap or vote — so the wallet stays active. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position at least ${hold} days so the activity is counted in more than one snapshot. Cost: the capital stays in the position. Time: ${hold} days of holding.`,
    `Before withdrawing, open ${p.name}'s own points or rewards page and claim only from the link it publishes; never pay to claim. Cost: no fee to check. Time: 10 minutes.`,
    'Write the wallet, the dates and every transaction in a farm log so the position can be repeated or unwound. Cost: nothing but the log. Time: 5 minutes.',
  ];
}

// ---------------------------------------------------------------- board + live

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const scored = snapshot.protocols
    .filter(isLaunchable)
    .map((p) => {
      const { age, model, implied } = score(p, snapshot.as_of);
      return { p, age, model, implied };
    })
    .sort((a, b) => (b.implied - a.implied === 0 ? (a.p.slug < b.p.slug ? -1 : 1) : b.implied - a.implied));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: [...s.p.chains],
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: s.model,
    farm_steps: farmSteps(s.p, snapshot.as_of),
  }));
}

/** The 24 live-token protocols by market cap — the market's own values, never ranked. */
export function buildLive(snapshot: Snapshot, limit = 24): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !recordsNoToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || (a.slug < b.slug ? -1 : 1))
    .slice(0, limit)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd as number,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      age_days: ageDays(p.listed_at, snapshot.as_of),
    }));
}
