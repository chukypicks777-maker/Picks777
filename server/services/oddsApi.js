import { createHash, randomUUID } from 'node:crypto';
import { redisConfigured, redisCommand } from './dataCache.js';

// Real bookmaker prices from The Odds API (the-odds-api.com) for competitions
// ESPN publishes without odds, such as ATP/WTA tennis. Inactive until the server
// has ODDS_API_KEY. Snapshots are shared through Redis and refreshed rarely,
// because every odds request spends one credit of the provider plan.
const BASE = 'https://api.the-odds-api.com/v4';
const MEMORY_MS = 10 * 60000, RETRY_FAILED_MS = 15 * 60000;
const memory = new Map(), loading = new Map(), failures = new Map();
// Sharpest books first; any book quoting both players is accepted after them.
const PREFERRED = ['pinnacle', 'betfair_ex_eu', 'bet365', 'williamhill', 'unibet_eu', 'marathonbet', 'onexbet', 'betsson'];

const apiKey = () => String(process.env.ODDS_API_KEY || '').trim();
export const oddsApiConfigured = () => /^[A-Za-z0-9]{20,64}$/.test(apiKey());
const refreshMs = () => {
  const minutes = Number(process.env.ODDS_API_REFRESH_MINUTES || 360);
  return (Number.isFinite(minutes) && minutes >= 30 && minutes <= 1440 ? minutes : 360) * 60000;
};

async function request(path, params = {}) {
  const query = new URLSearchParams({ ...params, apiKey: apiKey() });
  const response = await fetch(`${BASE}${path}?${query}`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  // The key travels in the URL: never include the URL or body in errors.
  if (!response.ok) throw Object.assign(new Error(`The Odds API respondió HTTP ${response.status}.`), { status: response.status });
  return { data: await response.json(), remaining: Number(response.headers.get('x-requests-remaining')) };
}

export const normalizeName = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
// Same surname and first initial; middle names may be omitted by either source.
export function samePlayer(a, b) {
  const x = normalizeName(a), y = normalizeName(b);
  return x.length > 0 && y.length > 0 && x.at(-1) === y.at(-1) && x[0][0] === y[0][0];
}

export function bestQuote(event) {
  const books = (event.bookmakers || []).map(book => {
    const outcomes = book.markets?.find(market => market.key === 'h2h')?.outcomes || [];
    const price = name => outcomes.find(outcome => outcome.name === name)?.price;
    const home = price(event.home_team), away = price(event.away_team);
    return { key: book.key, title: book.title, lastUpdate: book.last_update, home, away };
  }).filter(book => book.home > 1 && book.away > 1 && outcomesCount(event, book.key) === 2);
  books.sort((a, b) => (PREFERRED.indexOf(a.key) + 1 || 99) - (PREFERRED.indexOf(b.key) + 1 || 99));
  return books[0] || null;
}
const outcomesCount = (event, key) => event.bookmakers.find(book => book.key === key)?.markets?.find(market => market.key === 'h2h')?.outcomes?.length;

async function fetchTennisSnapshot(tour) {
  const { data: sports } = await request('/sports'); // Listing sports costs no credit.
  const keys = (Array.isArray(sports) ? sports : []).filter(sport => sport.active && sport.key?.startsWith(`tennis_${tour}_`)).map(sport => sport.key);
  const events = [];
  let remaining = null;
  for (const key of keys) {
    const result = await request(`/sports/${encodeURIComponent(key)}/odds`, { regions: 'eu', markets: 'h2h', oddsFormat: 'decimal' });
    remaining = result.remaining;
    for (const event of Array.isArray(result.data) ? result.data : []) {
      const quote = bestQuote(event);
      if (quote) events.push({ home: event.home_team, away: event.away_team, commence: event.commence_time, sportKey: key,
        bookmaker: quote.title, lastUpdate: quote.lastUpdate, homePrice: quote.home, awayPrice: quote.away });
    }
    if (Number.isFinite(remaining) && remaining < 5) break;
  }
  return { tour, fetchedAt: new Date().toISOString(), events, remaining };
}

const storeKey = tour => `picks:v2:odds-api:tennis:${tour}`;
async function readStored(tour) {
  if (!redisConfigured()) return null;
  try { const raw = await redisCommand('GET', storeKey(tour)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function writeStored(tour, snapshot) {
  if (!redisConfigured()) return;
  try { await redisCommand('SET', storeKey(tour), JSON.stringify(snapshot), 'EX', 2 * 86400); } catch {}
}
// One credit-spending refresh at a time across every serverless instance.
async function lease(tour) {
  if (!redisConfigured()) return true;
  try { return await redisCommand('SET', `picks:v2:lock:odds-api:${createHash('sha256').update(tour).digest('hex').slice(0, 16)}`, randomUUID(), 'NX', 'EX', 120) === 'OK'; }
  catch { return false; }
}

export async function loadTennisQuotes(tour) {
  if (!oddsApiConfigured() || !['atp', 'wta'].includes(tour)) return null;
  const now = Date.now(), local = memory.get(tour);
  if (local && now - local.loadedAt < MEMORY_MS) return local.snapshot;
  if (failures.get(tour) > now) return local?.snapshot || null;
  if (loading.has(tour)) return loading.get(tour);
  const task = (async () => {
    let snapshot = await readStored(tour) || local?.snapshot || null;
    const stale = !snapshot || now - Date.parse(snapshot.fetchedAt) >= refreshMs();
    // Few credits left: keep the last snapshot instead of spending the rest.
    const lowCredits = Number.isFinite(snapshot?.remaining) && snapshot.remaining < 5 && now - Date.parse(snapshot.fetchedAt) < 12 * 3600000;
    if (stale && !lowCredits && await lease(tour)) {
      try { snapshot = await fetchTennisSnapshot(tour); await writeStored(tour, snapshot); }
      catch { failures.set(tour, Date.now() + RETRY_FAILED_MS); }
    }
    if (snapshot) memory.set(tour, { snapshot, loadedAt: Date.now() });
    return snapshot;
  })();
  loading.set(tour, task);
  try { return await task; } finally { loading.delete(tour); }
}

// Attaches a quote only when both players and the start (±36 h; tennis order
// of play moves) identify exactly one priced event.
export function attachTennisQuotes(matches, snapshot) {
  if (!snapshot?.events?.length) return matches;
  return matches.map(match => {
    if (match.status !== 'SCHEDULED' || Number(match.odds?.homeWin) > 1) return match;
    const kickoff = Date.parse(match.kickoff);
    const candidates = snapshot.events.filter(event => Math.abs(Date.parse(event.commence) - kickoff) <= 36 * 3600000).flatMap(event => {
      if (samePlayer(event.home, match.homeTeam?.name) && samePlayer(event.away, match.awayTeam?.name)) return [{ event, home: event.homePrice, away: event.awayPrice }];
      if (samePlayer(event.home, match.awayTeam?.name) && samePlayer(event.away, match.homeTeam?.name)) return [{ event, home: event.awayPrice, away: event.homePrice }];
      return [];
    });
    if (candidates.length !== 1) return match;
    const [{ event, home, away }] = candidates;
    return { ...match, odds: { ...(match.odds || {}), homeWin: home, awayWin: away }, oddsProvider: `${event.bookmaker} · The Odds API`,
      oddsSource: 'The Odds API', oddsFetchedAt: snapshot.fetchedAt, oddsUpdatedAt: event.lastUpdate || null };
  });
}

export function forgetOddsApi() { memory.clear(); failures.clear(); }
