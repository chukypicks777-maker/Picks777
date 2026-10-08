import { fetchJson } from './dataCache.js';

// Real-money prices for ATP and WTA singles, which ESPN publishes without odds,
// from Kalshi: a US exchange regulated by the CFTC whose market data is public
// (no key, no credits). Snapshots live only in instance memory, never in Redis.
const BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const SERIES = { atp: 'KXATPMATCH', wta: 'KXWTAMATCH' };
const MEMORY_MS = 5 * 60000, RETRY_FAILED_MS = 5 * 60000, MAX_PAGES = 5;
// Kalshi dates its match events loosely (often the US day before play), so the
// pairing window is wider than for bookmakers; both names must still match.
export const KALSHI_WINDOW_HOURS = 72;
const MAX_SPREAD = 0.05, MAX_OVERROUND = 1.08;
const memory = new Map(), loading = new Map(), failures = new Map();

export const kalshiEnabled = () => !/^(0|off|false|no)$/i.test(String(process.env.KALSHI_TENNIS_ODDS || '').trim());
const price = value => { const number = Number(value); return Number.isFinite(number) ? number : NaN; };

// The price to back each player is the ask of their YES contract (decimal odds
// 1 / ask). Both sides must be quoted, with a tight spread and a coherent book;
// thin or one-sided markets are skipped rather than shown as a price.
export function kalshiQuote(event) {
  const markets = (event?.markets || []).filter(market => market.status === 'active' && market.yes_sub_title);
  if (markets.length !== 2) return null;
  const sides = markets.map(market => ({ name: market.yes_sub_title, bid: price(market.yes_bid_dollars), ask: price(market.yes_ask_dollars),
    updated: market.updated_time || null, commence: market.occurrence_datetime || market.expected_expiration_time || null }));
  const tradable = sides.every(side => side.bid >= 0.01 && side.ask <= 0.99 && side.ask >= side.bid && side.ask - side.bid <= MAX_SPREAD);
  const overround = sides[0].ask + sides[1].ask;
  if (!tradable || overround < 1 || overround > MAX_OVERROUND) return null;
  const [home, away] = sides;
  return { home: home.name, away: away.name, commence: home.commence || away.commence, bookmaker: 'Kalshi', lastUpdate: [home.updated, away.updated].filter(Boolean).sort().at(-1) || null,
    homePrice: Math.round(10000 / home.ask) / 10000, awayPrice: Math.round(10000 / away.ask) / 10000 };
}

async function fetchSnapshot(tour) {
  const events = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ series_ticker: SERIES[tour], status: 'open', with_nested_markets: 'true', limit: '200', ...(cursor ? { cursor } : {}) });
    const data = await fetchJson(`${BASE}/events?${query}`);
    if (!Array.isArray(data?.events)) throw new Error('Formato Kalshi no reconocido.');
    for (const event of data.events) { const quote = kalshiQuote(event); if (quote) events.push(quote); }
    cursor = data.cursor || '';
    if (!cursor) break;
  }
  return { tour, source: 'Kalshi', sourceUrl: 'https://kalshi.com', fetchedAt: new Date().toISOString(), events };
}

export async function loadKalshiTennis(tour) {
  if (!kalshiEnabled() || !SERIES[tour]) return null;
  const now = Date.now(), local = memory.get(tour);
  if (local && now - local.loadedAt < MEMORY_MS) return local.snapshot;
  if (failures.get(tour) > now) return local?.snapshot || null;
  if (loading.has(tour)) return loading.get(tour);
  const task = fetchSnapshot(tour)
    .then(snapshot => { memory.set(tour, { snapshot, loadedAt: Date.now() }); failures.delete(tour); return snapshot; })
    .catch(() => { failures.set(tour, Date.now() + RETRY_FAILED_MS); return local?.snapshot || null; })
    .finally(() => loading.delete(tour));
  loading.set(tour, task);
  return task;
}

export function forgetKalshi() { memory.clear(); failures.clear(); loading.clear(); }
