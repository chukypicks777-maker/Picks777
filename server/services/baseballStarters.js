// MLB probable starting pitchers. A starter's quality is his FIP (home runs,
// walks, hit batters and strikeouts per inning, the parts a pitcher controls)
// from this season and the previous one, shrunk toward the league with a few
// dozen innings. The runs his team allows are scaled by
// 1 + weight x (starter FIP / reference FIP - 1).
// Tuned on MLB 2025 and scored blind on MLB 2026 (2,100 games,
// scripts/backtest/experiment-baseball-starters.mjs): accuracy 53.6% -> 55.0%,
// log loss 0.6872 -> 0.6840, mean gap to the ESPN BET close 5.0 -> 4.1 points,
// same favourite 72.9% -> 77.9%. (Shrinking with 320 innings and full weight
// scores the same; the milder setting is kept.) No bookmaker price is used.
export const STARTERS = Object.freeze({ reference: 'league', shrinkInnings: 120, previousWeight: 0.5, weight: 0.6, leagueFip: 4.1, constant: 3.1 });

const fipRaw = t => t.outs > 0 ? (13 * t.hr + 3 * (t.bb + t.hbp) - 2 * t.k) / (t.outs / 3) : null;
// FIP of a pitcher's totals { current, previous } (each { outs, hr, bb, hbp, k }),
// shrunk toward the league average.
export function pitcherFip(totals, params = STARTERS) {
  if (!totals) return params.leagueFip;
  const c = totals.current || {}, p = totals.previous || {}, w = params.previousWeight;
  const merged = ['outs', 'hr', 'bb', 'hbp', 'k'].reduce((t, key) => ({ ...t, [key]: (c[key] || 0) + w * (p[key] || 0) }), {});
  const innings = merged.outs / 3, raw = fipRaw(merged);
  const fip = raw === null ? params.leagueFip : raw + params.constant;
  return (fip * innings + params.leagueFip * params.shrinkInnings) / (innings + params.shrinkInnings);
}

// Factor on the runs allowed by the starter's team. The team reference uses
// the starters of the last weeks, whose work is already inside the rating.
export function starterFactor(starter, rotation = null, params = STARTERS) {
  if (!starter || !(params.weight > 0)) return 1;
  const own = pitcherFip(starter, params);
  const reference = params.reference === 'team' && rotation?.length ? rotation.reduce((s, t) => s + pitcherFip(t, params), 0) / rotation.length : params.leagueFip;
  return Math.max(0.6, Math.min(1.5, 1 + params.weight * (own / reference - 1)));
}

// Season totals (this season and the previous one, MLB only) of the announced
// starters, from the MLB Stats API. Kept 6 hours in instance memory.
const memory = new Map();
const MEMORY_MS = 6 * 3600000;
export function parsePitcherSeasons(person, season) {
  const totals = year => (person.stats || []).flatMap(stat => stat.splits || [])
    .filter(split => Number(split.season) === year && split.sport?.id === 1 && split.team)
    .reduce((t, split) => ({ outs: t.outs + (split.stat.outs || 0), hr: t.hr + (split.stat.homeRuns || 0), bb: t.bb + (split.stat.baseOnBalls || 0),
      hbp: t.hbp + (split.stat.hitByPitch || 0), k: t.k + (split.stat.strikeOuts || 0) }), { outs: 0, hr: 0, bb: 0, hbp: 0, k: 0 });
  return { name: person.fullName || null, current: totals(season), previous: totals(season - 1) };
}
export async function loadStarterTotals(ids, season) {
  const now = Date.now(), wanted = [...new Set(ids.filter(Boolean).map(String))];
  const missing = wanted.filter(id => !(memory.get(`${id}:${season}`)?.loadedAt > now - MEMORY_MS));
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=stats(group=%5Bpitching%5D,type=%5ByearByYear%5D)`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      for (const person of (await response.json()).people || []) memory.set(`${person.id}:${season}`, { value: parsePitcherSeasons(person, season), loadedAt: now });
    } catch { /* Without stats the forecast keeps the team ratings alone. */ }
  }
  return Object.fromEntries(wanted.map(id => [id, memory.get(`${id}:${season}`)?.value]).filter(([, value]) => value));
}
