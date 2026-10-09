// Pure football probability engine shared by the API and the evaluation scripts.
// Every function is deterministic and free of I/O, so the retrospective backtest
// evaluates exactly the calculation served to members.
const DAY = 86400000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

// Parameters were selected only on 2021-22 to 2023-24 (five European leagues)
// and checked on 2024-25 to 2026-27; see scripts/backtest-football.mjs.
export const FOOTBALL_MODEL = Object.freeze({
  version: 'football-ratings-2026-10-08',
  goals: {
    // Supremacy reacts faster than the scoring level, which needs more shrinkage.
    supremacy: { halfLifeDays: 240, priorGames: 6 },
    total: { halfLifeDays: 540, priorGames: 24 },
    shots: { halfLifeDays: 240, priorGames: 8, supremacyWeight: 0.25, totalWeight: 0.4 },
    newcomer: { attack: 0.85, defense: 1.18 },
    rho: -0.07
  },
  // Negative binomial sizes measured on the training seasons' out-of-sample residuals.
  corners: { halfLifeDays: 365, priorGames: 32, size: { total: 76, home: 10.8, away: 10.9 } },
  cards: { halfLifeDays: 120, priorGames: 16, size: { total: 106 } },
  minTeamGames: 4,
  maxGoals: 12,
  // Without team history or a goals price the draw price alone sets the total;
  // it overstates lopsided fixtures (a 90% favourite's draw implied 6.3 goals
  // and Over 1.5 at 99%) and understates balanced ones. T = scale * draw^power,
  // within the totals bookmakers price; fitted on 2021-24 outcomes, checked on
  // 2024-27 (scripts/backtest/experiment-draw-total.mjs): Over 2.5 log loss
  // 0.6725 -> 0.6709, Over 1.5 0.5249 -> 0.5236, gap to the market 3.1 -> 2.5
  // points. With team ratings the validated blend with the raw draw total is
  // kept: calibrating it there scored worse (Over 2.5 0.6727 -> 0.6732).
  drawTotal: { scale: 1.18, power: 0.86, min: 1.8, max: 4.6 }
});

export const decayWeight = (ageMs, halfLifeDays) => halfLifeDays > 0 ? 0.5 ** (Math.max(0, ageMs) / (halfLifeDays * DAY)) : 1;

// Multiplicative strengths: E[home] = baseHome × attack(home) × defense(away).
// Iterative proportional fitting maximizes the time-weighted Poisson likelihood;
// a Gamma prior worth `priorGames` average matches shrinks small samples.
export function fitStrengths(games, { asOf, halfLifeDays = 180, priorGames = 6, prior = () => null, iterations = 80 } = {}) {
  if (!finite(asOf)) return null;
  const ids = new Map(), names = [];
  const index = id => {
    const key = String(id);
    if (!ids.has(key)) { ids.set(key, names.length); names.push(key); }
    return ids.get(key);
  };
  const H = [], A = [], HV = [], AV = [], W = [];
  let weight = 0, homeTotal = 0, awayTotal = 0;
  for (const game of games || []) {
    if (!(game.time < asOf) || game.home == null || game.away == null || String(game.home) === String(game.away)
      || !finite(game.hv) || !finite(game.av) || game.hv < 0 || game.av < 0) continue;
    const w = decayWeight(asOf - game.time, halfLifeDays);
    if (w < 1e-4) continue;
    H.push(index(game.home)); A.push(index(game.away)); HV.push(game.hv); AV.push(game.av); W.push(w);
    weight += w; homeTotal += w * game.hv; awayTotal += w * game.av;
  }
  const rows = W.length, size = names.length;
  if (rows < 20 || !(weight > 0)) return null;
  let baseHome = homeTotal / weight, baseAway = awayTotal / weight;
  if (!(baseHome > 0) || !(baseAway > 0)) return null;
  const priorOf = id => {
    const value = prior(id);
    return { attack: finite(value?.attack) && value.attack > 0 ? value.attack : 1, defense: finite(value?.defense) && value.defense > 0 ? value.defense : 1 };
  };
  const priors = names.map(priorOf);
  const attack = Float64Array.from(priors, p => p.attack), defense = Float64Array.from(priors, p => p.defense);
  const gamesPlayed = new Int32Array(size), teamWeight = new Float64Array(size);
  for (let i = 0; i < rows; i++) { gamesPlayed[H[i]]++; gamesPlayed[A[i]]++; teamWeight[H[i]] += W[i]; teamWeight[A[i]] += W[i]; }
  const strength = priorGames * (baseHome + baseAway) / 2;
  const numerator = new Float64Array(size), denominator = new Float64Array(size);
  for (let iteration = 0; iteration < iterations; iteration++) {
    let change = 0;
    for (const side of [attack, defense]) {
      numerator.fill(0); denominator.fill(0);
      for (let i = 0; i < rows; i++) {
        const h = H[i], a = A[i], w = W[i];
        if (side === attack) {
          numerator[h] += w * HV[i]; denominator[h] += w * baseHome * defense[a];
          numerator[a] += w * AV[i]; denominator[a] += w * baseAway * defense[h];
        } else {
          numerator[a] += w * HV[i]; denominator[a] += w * baseHome * attack[h];
          numerator[h] += w * AV[i]; denominator[h] += w * baseAway * attack[a];
        }
      }
      for (let t = 0; t < size; t++) {
        const next = (numerator[t] + strength * (side === attack ? priors[t].attack : priors[t].defense)) / (denominator[t] + strength);
        change = Math.max(change, Math.abs(next - side[t]));
        side[t] = next;
      }
    }
    if (change < 1e-7) break;
  }
  // Scale the league rates so the fitted sample is unbiased in total.
  let expectedHome = 0, expectedAway = 0;
  for (let i = 0; i < rows; i++) {
    expectedHome += W[i] * baseHome * attack[H[i]] * defense[A[i]];
    expectedAway += W[i] * baseAway * attack[A[i]] * defense[H[i]];
  }
  baseHome *= homeTotal / expectedHome;
  baseAway *= awayTotal / expectedAway;
  const teams = new Map(names.map((name, t) => [name, { attack: attack[t], defense: defense[t], games: gamesPlayed[t], weight: teamWeight[t] }]));
  return { baseHome, baseAway, teams, games: rows, weight, prior: priorOf };
}

export function expectedPair(fit, homeId, awayId, { minGames = FOOTBALL_MODEL.minTeamGames } = {}) {
  if (!fit) return null;
  const read = id => fit.teams.get(String(id)) || { ...fit.prior(String(id)), games: 0 };
  const home = read(homeId), away = read(awayId);
  if (home.games < minGames || away.games < minGames) return null;
  return { home: fit.baseHome * home.attack * away.defense, away: fit.baseAway * away.attack * home.defense,
    sample: { home: home.games, away: away.games } };
}

function poissonVector(rate, size) {
  const values = [Math.exp(-rate)];
  for (let k = 1; k <= size; k++) values.push(values[k - 1] * rate / k);
  return values;
}

// Dixon-Coles adjusts only the four low scores; rho is clamped to keep them valid.
export function scoreMatrix(lambda, mu, rho = FOOTBALL_MODEL.goals.rho) {
  if (!finite(lambda) || !finite(mu) || lambda <= 0 || mu <= 0 || lambda > 12 || mu > 12) return null;
  const size = Math.max(FOOTBALL_MODEL.maxGoals, Math.ceil(Math.max(lambda, mu) + 10 * Math.sqrt(Math.max(lambda, mu)) + 2));
  const r = Math.min(Math.max(rho, Math.max(-1 / lambda, -1 / mu) + 1e-9), Math.min(1 / (lambda * mu), 1) - 1e-9);
  const ph = poissonVector(lambda, size), pa = poissonVector(mu, size);
  const matrix = ph.map((p, h) => pa.map((q, a) => {
    const tau = h === 0 && a === 0 ? 1 - lambda * mu * r : h === 0 && a === 1 ? 1 + lambda * r
      : h === 1 && a === 0 ? 1 + mu * r : h === 1 && a === 1 ? 1 - r : 1;
    return p * q * tau;
  }));
  const mass = matrix.reduce((sum, row) => sum + row.reduce((s, v) => s + v, 0), 0);
  return matrix.map(row => row.map(value => value / mass));
}

export const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
const lineKey = line => String(line).replace('.', '');

export function goalMarkets(matrix) {
  if (!matrix) return null;
  let homeWin = 0, draw = 0, awayWin = 0, bttsYes = 0;
  const totals = new Map(), homeGoals = new Map(), awayGoals = new Map(), scores = [];
  matrix.forEach((row, h) => row.forEach((p, a) => {
    if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
    if (h > 0 && a > 0) bttsYes += p;
    totals.set(h + a, (totals.get(h + a) || 0) + p);
    homeGoals.set(h, (homeGoals.get(h) || 0) + p); awayGoals.set(a, (awayGoals.get(a) || 0) + p);
    scores.push({ score: `${h} - ${a}`, probability: p });
  }));
  const over = (distribution, line) => [...distribution].reduce((sum, [n, p]) => sum + (n > line ? p : 0), 0);
  const probabilities = { homeWin: homeWin * 100, draw: draw * 100, awayWin: awayWin * 100,
    bttsYes: bttsYes * 100, bttsNo: (1 - bttsYes) * 100 };
  for (const line of GOAL_LINES) {
    const value = over(totals, line);
    probabilities[`over${lineKey(line)}`] = value * 100;
    probabilities[`under${lineKey(line)}`] = (1 - value) * 100;
  }
  scores.sort((a, b) => b.probability - a.probability);
  const team = distribution => Object.fromEntries([0.5, 1.5, 2.5].flatMap(line => {
    const value = over(distribution, line);
    return [[`over${lineKey(line)}`, value * 100], [`under${lineKey(line)}`, (1 - value) * 100]];
  }));
  return { probabilities, homeGoals: team(homeGoals), awayGoals: team(awayGoals),
    predictedScore: scores[0].score, scoreDistribution: scores.slice(0, 9).map(s => ({ score: s.score, probability: s.probability * 100 })) };
}

// Increasing f: the argument whose value equals target (clamped to the interval).
function bisect(f, low, high, target, steps = 50) {
  for (let i = 0; i < steps; i++) {
    const mid = (low + high) / 2;
    if (f(mid) < target) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

// The Dixon-Coles terms move mass between draws and one-goal wins equally,
// so P(home) − P(away) and every total above 2.5 equal the independent model.
function supremacy(lambda, mu) {
  const size = Math.ceil(Math.max(lambda, mu) + 8 * Math.sqrt(Math.max(lambda, mu)) + 4);
  const ph = poissonVector(lambda, size), pa = poissonVector(mu, size);
  // P(H) − P(A) = Σ_k p_k · F_away(k − 1) − Σ_k q_k · F_home(k − 1).
  let difference = 0, homeCdf = ph[0], awayCdf = pa[0];
  for (let k = 1; k <= size; k++) {
    difference += ph[k] * awayCdf - pa[k] * homeCdf;
    homeCdf += ph[k]; awayCdf += pa[k];
  }
  return difference * 100;
}
const poissonOver = (rate, line) => (1 - poissonVector(rate, Math.floor(line)).reduce((s, v) => s + v, 0)) * 100;

// Goal rates that reproduce one complete quote snapshot. A total-goals quote
// identifies the total; otherwise the statistical (or league) total is kept and
// only the supremacy is taken from the 1X2 prices.
export function solveGoalRates(target, { total = 2.7 } = {}) {
  const pH = target?.homeWin, pA = target?.awayWin, pO = target?.over25;
  if (!finite(pH) || !finite(pA) || pH <= 0 || pA <= 0 || pH + pA >= 100) return null;
  const T = finite(pO) && pO > 1 && pO < 99 ? bisect(t => poissonOver(t, 2.5), 0.2, 9, pO)
    : finite(total) && total > 0.4 ? Math.min(total, 7) : 2.7;
  const share = bisect(s => supremacy(T * s, T * (1 - s)), 0.02, 0.98, pH - pA);
  return { home: T * share, away: T * (1 - share), total: T, totalSource: finite(pO) && pO > 1 && pO < 99 ? 'market' : 'prior' };
}

// Negative binomial count model: variance = mean + mean² / size (size → ∞ is Poisson).
export function countDistribution(mean, size = Infinity, maxK = null) {
  if (!finite(mean) || mean < 0 || mean > 80) return null;
  const limit = maxK ?? Math.ceil(mean + 12 * Math.sqrt(mean + (finite(size) ? mean * mean / size : 0)) + 10);
  if (!finite(size) || size > 1e6) return poissonVector(mean, limit);
  const p = size / (size + mean);
  const values = [Math.exp(size * Math.log(p))];
  for (let k = 1; k <= limit; k++) values.push(values[k - 1] * (k - 1 + size) / k * (1 - p));
  return values;
}

export function countLines(distribution, lines) {
  if (!distribution) return Object.fromEntries(lines.flatMap(line => [[`over${lineKey(line)}`, null], [`under${lineKey(line)}`, null]]));
  const mass = distribution.reduce((s, v) => s + v, 0);
  return Object.fromEntries(lines.flatMap(line => {
    const under = distribution.slice(0, Math.floor(line) + 1).reduce((s, v) => s + v, 0) / mass;
    return [[`over${lineKey(line)}`, (1 - under) * 100], [`under${lineKey(line)}`, under * 100]];
  }));
}

// Method of moments for the extra-Poisson variance of fitted counts.
export function estimateDispersion(pairs) {
  let squared = 0, excess = 0;
  for (const { mean, value } of pairs) {
    if (!finite(mean) || !finite(value) || mean <= 0) continue;
    squared += mean * mean; excess += (value - mean) ** 2 - mean;
  }
  return excess > 0 && squared > 0 ? squared / excess : Infinity;
}

// Power de-vig: p_i = (1 / price_i)^k with Σ p_i = 1. It removes more margin
// from long prices than proportional scaling and scored better out of sample.
export function devigPower(odds, keys) {
  const inverse = keys.map(key => { const price = Number(odds?.[key]); return price > 1 && Number.isFinite(price) ? 1 / price : null; });
  if (inverse.some(value => value === null)) return null;
  const total = inverse.reduce((a, b) => a + b, 0);
  let k = 1;
  if (total > 1) {
    let low = 1, high = 4;
    for (let i = 0; i < 60; i++) { k = (low + high) / 2; if (inverse.reduce((s, q) => s + q ** k, 0) > 1) low = k; else high = k; }
  }
  const raw = inverse.map(q => q ** k), mass = raw.reduce((a, b) => a + b, 0);
  return { probabilities: Object.fromEntries(keys.map((key, i) => [key, raw[i] / mass * 100])), overround: (total - 1) * 100 };
}

function drawProbability(lambda, mu, rho) {
  const size = Math.ceil(Math.max(lambda, mu) + 8 * Math.sqrt(Math.max(lambda, mu)) + 4);
  const ph = poissonVector(lambda, size), pa = poissonVector(mu, size);
  let draw = 0;
  for (let k = 0; k <= size; k++) draw += ph[k] * pa[k];
  return (draw - 2 * lambda * mu * rho * Math.exp(-lambda - mu)) * 100;
}

// The goals total implied by a 1X2 quote: with the supremacy fixed, the draw
// price falls as the expected total rises.
export function drawImpliedTotal(market, rho = FOOTBALL_MODEL.goals.rho) {
  const { homeWin, draw, awayWin } = market || {};
  if (![homeWin, draw, awayWin].every(v => finite(v) && v > 0 && v < 100)) return null;
  let low = 0.4, high = 7;
  for (let i = 0; i < 40; i++) {
    const total = (low + high) / 2, rates = solveGoalRates({ homeWin, awayWin }, { total });
    if (drawProbability(rates.home, rates.away, rho) > draw) low = total; else high = total;
  }
  return (low + high) / 2;
}

const calibrateDrawTotal = raw => {
  if (!finite(raw)) return null;
  const { scale, power, min, max } = FOOTBALL_MODEL.drawTotal;
  return Math.min(max, Math.max(min, scale * raw ** power));
};
export const calibratedDrawTotal = (market, rho = FOOTBALL_MODEL.goals.rho) => calibrateDrawTotal(drawImpliedTotal(market, rho));

const geometric = (x, y, w) => ({ home: x.home ** (1 - w) * y.home ** w, away: x.away ** (1 - w) * y.away ** w });

// games: [{ time, home, away, hg, ag, hst?, ast?, hc?, ac?, hy?, ay?, hthg?, htag? }]
// Teams without a game before `seasonStart` receive the newcomer prior.
export function fitFootballLeague(games, { asOf = Date.now(), seasonStart = null } = {}) {
  const rows = (games || []).filter(g => finite(g.time) && g.time < asOf);
  const firstSeen = new Map();
  for (const g of rows) for (const id of [g.home, g.away]) {
    const key = String(id);
    if (!firstSeen.has(key) || firstSeen.get(key) > g.time) firstSeen.set(key, g.time);
  }
  const hasEarlierSeason = finite(seasonStart) && rows.some(g => g.time < seasonStart);
  const prior = id => hasEarlierSeason && (firstSeen.get(String(id)) ?? Infinity) >= seasonStart ? FOOTBALL_MODEL.goals.newcomer : null;
  const select = (h, a) => rows.filter(g => finite(g[h]) && finite(g[a])).map(g => ({ time: g.time, home: g.home, away: g.away, hv: g[h], av: g[a] }));
  const goals = select('hg', 'ag'), shots = select('hst', 'ast'), corners = select('hc', 'ac'), cards = select('hy', 'ay');
  const { supremacy, total, shots: shotParams } = FOOTBALL_MODEL.goals;
  const fit = (data, params, withPrior = true) => data.length >= 60 ? fitStrengths(data, { asOf, ...params, prior: withPrior ? prior : () => null }) : null;
  // League share of goals scored before half-time, from games with both halves.
  const halfRows = rows.filter(g => finite(g.hthg) && finite(g.htag) && finite(g.hg) && finite(g.ag) && g.hthg <= g.hg && g.htag <= g.ag);
  const halfGoals = halfRows.reduce((s, g) => s + g.hthg + g.htag, 0), fullGoals = halfRows.reduce((s, g) => s + g.hg + g.ag, 0);
  return {
    asOf, games: rows.length,
    supremacy: fit(goals, supremacy), total: fit(goals, total), shots: fit(shots, shotParams),
    corners: fit(corners, FOOTBALL_MODEL.corners, false), cards: fit(cards, FOOTBALL_MODEL.cards, false),
    firstHalfShare: halfRows.length >= 60 && fullGoals > 0 ? halfGoals / fullGoals : null, halfSample: halfRows.length,
    samples: { goals: goals.length, shots: shots.length, corners: corners.length, cards: cards.length, halves: halfRows.length }
  };
}

export function expectedGoals(fits, homeId, awayId) {
  const sup = expectedPair(fits?.supremacy, homeId, awayId), level = expectedPair(fits?.total, homeId, awayId);
  if (!sup || !level) return null;
  let share = sup, total = level, usedShots = false;
  const shots = expectedPair(fits.shots, homeId, awayId);
  if (shots) {
    // Shots on target, converted with the same window's league scoring rate.
    const converted = { home: shots.home * fits.total.baseHome / fits.shots.baseHome, away: shots.away * fits.total.baseAway / fits.shots.baseAway };
    share = geometric(sup, converted, FOOTBALL_MODEL.goals.shots.supremacyWeight);
    total = geometric(level, converted, FOOTBALL_MODEL.goals.shots.totalWeight);
    usedShots = true;
  }
  const T = total.home + total.away, s = share.home / (share.home + share.away);
  return { home: T * s, away: T * (1 - s), total: T, sample: level.sample, usedShots };
}

const CORNER_TOTAL_LINES = [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
const CORNER_TEAM_LINES = [2.5, 3.5, 4.5, 5.5, 6.5];
const CARD_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
const HALF_LINES = [0.5, 1.5, 2.5, 3.5];
const round2 = value => finite(value) ? Math.round(value * 100) / 100 : null;
const roundAll = object => Object.fromEntries(Object.entries(object).map(([k, v]) => [k, round2(v)]));

export function forecastFootball(fits, homeId, awayId, odds = {}) {
  const { rho } = FOOTBALL_MODEL.goals;
  const stat = fits ? expectedGoals(fits, homeId, awayId) : null;
  const market = devigPower(odds, ['homeWin', 'draw', 'awayWin']);
  const goalsMarket = devigPower(odds, ['over25', 'under25']);
  let rates = stat, totalSource = stat ? 'statistical-model' : null;
  if (market) {
    const drawTotal = goalsMarket ? null : drawImpliedTotal(market.probabilities, rho);
    const total = goalsMarket ? undefined : stat && drawTotal ? Math.sqrt(stat.total * drawTotal) : calibrateDrawTotal(drawTotal) ?? stat?.total;
    rates = solveGoalRates({ ...market.probabilities, over25: goalsMarket?.probabilities.over25 }, { total });
    totalSource = goalsMarket ? 'published-odds' : stat ? 'draw-price-and-model' : 'draw-price';
  }
  if (!rates) return null;
  const markets = goalMarkets(scoreMatrix(rates.home, rates.away, rho));
  if (!markets) return null;
  const probabilities = { ...markets.probabilities, ...(market?.probabilities || {}), ...(goalsMarket?.probabilities || {}) };
  const sources = Object.fromEntries(Object.keys(probabilities).map(key => [key,
    market && ['homeWin', 'draw', 'awayWin'].includes(key) || goalsMarket && ['over25', 'under25'].includes(key) ? 'published-odds'
      : market ? 'market-derived-model' : 'statistical-model']));
  const cornerRates = expectedPair(fits?.corners, homeId, awayId), cardRates = expectedPair(fits?.cards, homeId, awayId);
  const size = FOOTBALL_MODEL.corners.size;
  const corners = cornerRates ? {
    expected: { home: round2(cornerRates.home), away: round2(cornerRates.away), total: round2(cornerRates.home + cornerRates.away) },
    total: roundAll(countLines(countDistribution(cornerRates.home + cornerRates.away, size.total), CORNER_TOTAL_LINES)),
    home: roundAll(countLines(countDistribution(cornerRates.home, size.home), CORNER_TEAM_LINES)),
    away: roundAll(countLines(countDistribution(cornerRates.away, size.away), CORNER_TEAM_LINES)),
    sample: cornerRates.sample, distribution: 'Binomial negativa'
  } : null;
  const cards = cardRates ? {
    expected: { home: round2(cardRates.home), away: round2(cardRates.away), total: round2(cardRates.home + cardRates.away) },
    total: roundAll(countLines(countDistribution(cardRates.home + cardRates.away, FOOTBALL_MODEL.cards.size.total), CARD_LINES)),
    sample: cardRates.sample, distribution: 'Binomial negativa'
  } : null;
  const share = fits?.firstHalfShare;
  const half = part => ({ expectedGoals: round2((rates.home + rates.away) * part), ...roundAll(countLines(countDistribution((rates.home + rates.away) * part), HALF_LINES)) });
  const halves = finite(share) && share > 0.2 && share < 0.7
    ? { first: half(share), second: half(1 - share), firstHalfShare: round2(share * 100), sampleSize: fits.halfSample } : null;
  return {
    probabilities: roundAll(probabilities), sources,
    expectedGoals: { home: round2(rates.home), away: round2(rates.away) },
    statisticalExpectedGoals: stat ? { home: round2(stat.home), away: round2(stat.away) } : null,
    statisticalProbabilities: stat ? roundAll(goalMarkets(scoreMatrix(stat.home, stat.away, rho)).probabilities) : null,
    totalSource, usedShots: Boolean(stat?.usedShots), sample: stat?.sample || null,
    predictedScore: markets.predictedScore,
    scoreDistribution: markets.scoreDistribution.map(s => ({ score: s.score, probability: round2(s.probability) })),
    homeGoals: roundAll(markets.homeGoals), awayGoals: roundAll(markets.awayGoals),
    corners, cards, halves, overround: market ? round2(market.overround) : null
  };
}
