// Shared scoring for the blind tests: every forecast uses only information
// available before its match; outcomes and casino prices are compared after.
import fs from 'node:fs/promises';

export const OUT = 'artifacts/blind-test';
export const CACHE = 'artifacts/backtest-cache';
const clamp = p => Math.min(1 - 1e-9, Math.max(1e-9, p));

// Binary event: probability that "yes" happens. Tracks hit rate of the side
// the forecast favours, Brier, log loss and calibration by 10-point bands.
export class Binary {
  constructor() { this.n = 0; this.hits = 0; this.brier = 0; this.loss = 0; this.bands = new Map(); }
  add(p, yes) {
    if (!Number.isFinite(p)) return;
    this.n++; this.hits += Number((p >= 0.5) === yes);
    this.brier += (p - Number(yes)) ** 2; this.loss -= Math.log(clamp(yes ? p : 1 - p));
    // Bands use the probability of the favoured side (50-100%).
    const said = Math.max(p, 1 - p), band = Math.min(9, Math.floor(said * 10));
    const b = this.bands.get(band) || { n: 0, said: 0, happened: 0 };
    b.n++; b.said += said; b.happened += Number((p >= 0.5) === yes); this.bands.set(band, b);
  }
  report() {
    if (!this.n) return null;
    return { n: this.n, hitRate: round(this.hits / this.n * 100, 1), brier: round(this.brier / this.n, 4), logLoss: round(this.loss / this.n, 4),
      calibration: [...this.bands].sort((a, b) => a[0] - b[0]).map(([k, b]) => ({ band: `${k * 10}-${k * 10 + 10}%`, n: b.n,
        said: round(b.said / b.n * 100, 1), happened: round(b.happened / b.n * 100, 1) })) };
  }
}

// Several exclusive outcomes (for example 1X2): hit rate of the most likely one.
export class Multi {
  constructor() { this.n = 0; this.hits = 0; this.brier = 0; this.loss = 0; }
  add(probs, outcome) {
    if (!probs.every(Number.isFinite)) return;
    const sum = probs.reduce((a, b) => a + b, 0), p = probs.map(v => v / sum);
    this.n++; this.hits += Number(p.indexOf(Math.max(...p)) === outcome);
    this.brier += p.reduce((s, v, i) => s + (v - Number(i === outcome)) ** 2, 0); this.loss -= Math.log(clamp(p[outcome]));
  }
  report() { return this.n ? { n: this.n, hitRate: round(this.hits / this.n * 100, 1), brier: round(this.brier / this.n, 4), logLoss: round(this.loss / this.n, 4) } : null; }
}

// Model against casino on the same matches.
export class VersusCasino {
  constructor() { this.n = 0; this.agree = 0; this.absDiff = 0; this.modelHits = 0; this.casinoHits = 0; this.modelLoss = 0; this.casinoLoss = 0; this.within5 = 0; this.within10 = 0; }
  // model, casino: probability that "yes" (for example, home wins).
  add(model, casino, yes) {
    if (!Number.isFinite(model) || !Number.isFinite(casino)) return;
    this.n++; this.agree += Number((model >= 0.5) === (casino >= 0.5));
    const diff = Math.abs(model - casino); this.absDiff += diff;
    this.within5 += Number(diff <= 0.05); this.within10 += Number(diff <= 0.1);
    this.modelHits += Number((model >= 0.5) === yes); this.casinoHits += Number((casino >= 0.5) === yes);
    this.modelLoss -= Math.log(clamp(yes ? model : 1 - model)); this.casinoLoss -= Math.log(clamp(yes ? casino : 1 - casino));
  }
  report() {
    if (!this.n) return null;
    return { n: this.n, sameFavourite: round(this.agree / this.n * 100, 1), meanDifferencePoints: round(this.absDiff / this.n * 100, 1),
      within5Points: round(this.within5 / this.n * 100, 1), within10Points: round(this.within10 / this.n * 100, 1),
      modelHitRate: round(this.modelHits / this.n * 100, 1), casinoHitRate: round(this.casinoHits / this.n * 100, 1),
      modelLogLoss: round(this.modelLoss / this.n, 4), casinoLogLoss: round(this.casinoLoss / this.n, 4) };
  }
}

export const round = (value, digits) => Number(value.toFixed(digits));
export const americanToProbability = value => { const n = Number(value); return !Number.isFinite(n) || Math.abs(n) < 100 ? null : n > 0 ? 100 / (n + 100) : -n / (-n + 100); };
// Two-way no-vig probability from two prices.
export const noVig = (a, b) => Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? a / (a + b) : null;

export async function cachedJson(name, loader) {
  const file = `${CACHE}/${name}.json`;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
  const value = await loader();
  await fs.mkdir(CACHE, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
  return value;
}

export async function pool(items, size, worker) {
  const results = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; try { results[i] = await worker(items[i], i); } catch { results[i] = null; } }
  }));
  return results;
}

// DraftKings snapshot ESPN keeps for a finished event (moneyline, total, spread).
export async function espnEventOdds(sport, league, ids) {
  return cachedJson(`espn-odds-${league}-${ids.length}-${ids[0]}-${ids.at(-1)}`, async () => {
    const out = {};
    await pool(ids, 8, async id => {
      const response = await fetch(`https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${league}/events/${id}/competitions/${id}/odds`);
      if (!response.ok) return;
      const item = (await response.json()).items?.[0];
      if (!item) return;
      out[id] = { provider: item.provider?.name, home: item.homeTeamOdds?.moneyLine ?? null, away: item.awayTeamOdds?.moneyLine ?? null,
        total: item.overUnder ?? null, over: item.overOdds ?? null, under: item.underOdds ?? null, spread: item.spread ?? null,
        homeSpreadOdds: item.homeTeamOdds?.spreadOdds ?? null, awaySpreadOdds: item.awayTeamOdds?.spreadOdds ?? null };
    });
    return out;
  });
}

export async function writeReport(name, report) {
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(`${OUT}/${name}.json`, JSON.stringify(report, null, 2));
}
