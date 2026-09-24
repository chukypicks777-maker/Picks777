import test from 'node:test';
import assert from 'node:assert/strict';
import { poissonProbability, poissonCumulative, calculateCornerProbabilities, calculateTeamDetailedStats, calculateDifferential, getTop3Opportunities, getBestBankerPick, getCoherentPredictedScore, getEffectiveOdds } from '../src/utils/mathProbabilities.js';
import { totalLines, scoreSimulation } from '../src/utils/probability.js';
import { poissonModel } from '../server/services/probabilityModel.js';
import { aggregateHistory, readHistoricalSummary, halfGoalModel } from '../server/services/verifiedStats.js';

test('Poisson preserves the degenerate zero distribution and rejects absent rates',()=>{
 assert.equal(poissonProbability(0,0),1); assert.equal(poissonProbability(0,1),0);
 assert.equal(poissonCumulative(0,0),1); assert.equal(poissonCumulative(null,3),null);
 for(const value of [null,undefined,NaN,Infinity,-1,'5']) assert.equal(calculateCornerProbabilities(value).over55,null);
 assert.equal(calculateCornerProbabilities(0).under55,100);
});
test('5.5 corners means six or more, and every ladder is bounded, monotonic and complementary across 401 rates',()=>{
 for(let i=0;i<=400;i++) {
  const rate=i/10,p=calculateCornerProbabilities(rate);
  assert.equal(p.over55,Math.round((1-poissonCumulative(rate,5))*100)); assert.equal(p.over5,p.over55);
  const values=['15','25','35','45','55','65','85','95'];
  values.forEach((key,j)=>{ assert.ok(p[`over${key}`]>=0 && p[`over${key}`]<=100); assert.equal(p[`over${key}`]+p[`under${key}`],100); if(j)assert.ok(p[`over${key}`]<=p[`over${values[j-1]}`]); });
 }
});
test('all score and goal markets come from the same untouched distribution across 121 team combinations',()=>{
 for(let h=0;h<=10;h++) for(let a=0;a<=10;a++) {
  const home={gamesPlayed:10,goalsFor:h*3,goalsAgainst:a*3},away={gamesPlayed:10,goalsFor:a*3,goalsAgainst:h*3};
  const model=poissonModel(home,away),p=model.probabilities;
  assert.ok(Math.abs(p.homeWin+p.draw+p.awayWin-100)<1e-8);
  for(const line of ['05','15','25','35','45']) assert.equal(p[`over${line}`]+p[`under${line}`],100);
  assert.equal(p.bttsYes+p.bttsNo,100);
  assert.ok(p.bttsYes<=p.over15+1e-8);
  for(const item of model.scoreDistribution){ const [x,y]=item.score.split(' - ').map(Number); assert.ok(Math.abs(item.probability-poissonProbability(h*.3,x)*poissonProbability(a*.3,y)*100)<1e-8); }
  assert.equal(getCoherentPredictedScore({model},'99 - 99'),model.predictedScore);
  assert.ok(Math.abs(Object.values(scoreSimulation({model})).reduce((n,v)=>n+v,0)-100)<1e-8);
 }
});
test('missing data never creates teams, scores, odds or picks; zero data stays zero',()=>{
 const s=calculateTeamDetailedStats({}); assert.equal(s.cards,null);assert.equal(s.avgCorners,null);assert.equal(s.avgGF,null);assert.deepEqual(s.form,[]);
 assert.equal(getBestBankerPick(null),null);assert.deepEqual(getTop3Opportunities({}),[]);assert.equal(getCoherentPredictedScore(null),'N/D');
 const t={gamesPlayed:10,goalsFor:0,goalsAgainst:0,avgCorners:0,avgYellowCards:0},m={model:poissonModel(t,t)};
 const detailed=calculateTeamDetailedStats(t,true,m); assert.equal(detailed.over05Rate,0);assert.equal(detailed.under05Rate,100);assert.equal(detailed.cardsOver35,0);
 const diff=calculateDifferential(detailed,detailed,m);assert.equal(diff.matchCardsProbs.under35,100);
 const picks=getTop3Opportunities(m);assert.ok(picks.every(p=>p.odds===null && p.probability<=100));
});
test('half goals use verified split samples, preserve full total and reject small samples',()=>{
 const rows=Array.from({length:5},(_,i)=>({id:String(i),corners:5,cards:2,fouls:10,ownHalves:[1,2],rivalHalves:[0,1]}));
 const stats=aggregateHistory(rows),t={gamesPlayed:10,goalsFor:30,goalsAgainst:10},model=poissonModel(t,t);
 const halves=halfGoalModel(model,stats,stats);assert.ok(halves);
 assert.ok(Math.abs(halves.first.expectedGoals+halves.second.expectedGoals-model.expectedGoals.home-model.expectedGoals.away)<1e-8);
 for(const half of [halves.first,halves.second]) assert.deepEqual(totalLines(half.expectedGoals),Object.fromEntries(Object.entries(half).filter(([k])=>k!=='expectedGoals')));
 assert.equal(halfGoalModel(model,aggregateHistory(rows.slice(0,4)),stats),null);
 assert.equal(aggregateHistory([{cards:null},{cards:0}]).cards,null);
});
test('half parser rejects contradictory scores, extra time, unfinished and future records',()=>{
 const comp={id:'1',date:'2026-01-01',status:{type:{completed:true}},competitors:[{id:'a',score:'3',linescores:[{displayValue:'1'},{displayValue:'2'}]},{id:'b',score:'0',linescores:[{displayValue:'0'},{displayValue:'0'}]}]};
 const data={header:{competitions:[comp]}},cutoff=Date.parse('2026-02-01');
 assert.deepEqual(readHistoricalSummary(data,'a',cutoff).ownHalves,[1,2]);
 comp.competitors[0].score='9';assert.equal(readHistoricalSummary(data,'a',cutoff).ownHalves,null);
 comp.status.type.completed=false;assert.equal(readHistoricalSummary(data,'a',cutoff),null);
 comp.status.type.completed=true;assert.equal(readHistoricalSummary(data,'a',Date.parse('2025-01-01')),null);
 comp.competitors[0].linescores.push({displayValue:'6'});assert.equal(readHistoricalSummary(data,'a',cutoff).ownHalves,null);
});

test('cleanSheetRate and bttsRate are derived from recent matches, history, or Poisson fallback without fake data',()=>{
 const teamA={id:'team-1',name:'Santos',gamesPlayed:10,goalsFor:15,goalsAgainst:10};
 const matchWithRecent={
  recentMatches:[
   {
    teamId:'team-1',
    team:'Santos',
    events:[
     {score:'2 - 0',atVs:'vs'},
     {score:'1 - 1',atVs:'vs'},
     {score:'0 - 0',atVs:'@'},
     {score:'3 - 2',atVs:'@'},
     {score:'1 - 0',atVs:'vs'}
    ]
   }
  ]
 };
 const statsA=calculateTeamDetailedStats(teamA,true,matchWithRecent);
 assert.equal(statsA.cleanSheetRate,60);

 const statsFallback=calculateTeamDetailedStats(teamA,true,{});
 assert.equal(statsFallback.cleanSheetRate,37);

 const statsEmpty=calculateTeamDetailedStats({},true,{});
 assert.equal(statsEmpty.cleanSheetRate,null);

 const sample=[
  {cleanSheet:1,btts:0},
  {cleanSheet:0,btts:1},
  {cleanSheet:1,btts:0},
  {cleanSheet:0,btts:1},
  {cleanSheet:0,btts:1}
 ];
 const agg=aggregateHistory(sample);
 assert.equal(agg.cleanSheetRate,40);
 assert.equal(agg.bttsRate,60);

 const aggSmall=aggregateHistory(sample.slice(0,4));
 assert.equal(aggSmall.cleanSheetRate,null);
 assert.equal(aggSmall.bttsRate,null);
});

test('getEffectiveOdds prefers real published odds, falls back to estimatedOdds from model, and preserves null on invalid data', () => {
  assert.equal(getEffectiveOdds(null), null);
  assert.equal(getEffectiveOdds({ odds: null, probability: null }), null);
  assert.equal(getEffectiveOdds({ odds: 1.85, probability: 60 }), 1.85);
  assert.equal(getEffectiveOdds({ odds: null, estimatedOdds: 1.45, probability: 70 }), 1.45);
  assert.equal(getEffectiveOdds({ odds: null, probability: 80 }), 1.25);
  assert.equal(getEffectiveOdds({ odds: 0.9, probability: 50 }), 2.0);
  assert.equal(getEffectiveOdds({ odds: -1, probability: 0 }), null);
  assert.equal(getEffectiveOdds({ odds: '1.95', probability: '55' }), 1.95);
  assert.equal(getEffectiveOdds({ odds: null, probability: '50' }), 2.0);
  assert.equal(getEffectiveOdds({ odds: null, estimatedOdds: '1.60', probability: 60 }), 1.6);
});

test('parlay candidates always provide finite effective odds > 1 when model probabilities exist', () => {
  const match = {
    id: 'm1',
    status: 'SCHEDULED',
    homeTeam: { name: 'Real Madrid', shortName: 'RMA' },
    awayTeam: { name: 'Barcelona', shortName: 'BAR' },
    probabilities: {
      homeWin: 60,
      draw: 20,
      awayWin: 20,
      over25: 75,
      under25: 25,
      bttsYes: 65,
      bttsNo: 35
    }
  };
  const picks = getTop3Opportunities(match);
  assert.ok(picks.length > 0);
  for (const pick of picks) {
    const odds = getEffectiveOdds(pick);
    assert.ok(Number.isFinite(odds) && odds > 1 && odds <= 100);
  }
});

test('getTop3Opportunities derives opportunities when probabilities are missing but published odds exist', () => {
  const matchOnlyOdds = {
    id: 'm2',
    status: 'SCHEDULED',
    homeTeam: { name: 'Arsenal', shortName: 'ARS' },
    awayTeam: { name: 'Chelsea', shortName: 'CHE' },
    odds: { homeWin: 1.80, draw: 3.50, awayWin: 4.50, over25: 1.70, under25: 2.10 }
  };
  const opps = getTop3Opportunities(matchOnlyOdds);
  assert.ok(opps.length > 0);
  assert.equal(opps[0].key, 'dc1X');
  assert.equal(getEffectiveOdds(opps[0]), 1.27);
  assert.equal(getEffectiveOdds(opps[1]), 1.70);
});

test('getTop3Opportunities falls back to highest-probability candidate or aiPick when probabilities are under 50%', () => {
  const matchLowProbs = {
    id: 'm3',
    status: 'SCHEDULED',
    homeTeam: { name: 'Cadiz', shortName: 'CAD' },
    awayTeam: { name: 'Getafe', shortName: 'GET' },
    probabilities: {
      homeWin: 35,
      draw: 35,
      awayWin: 30,
      over15: 45,
      under15: 55
    }
  };
  const opps = getTop3Opportunities(matchLowProbs);
  assert.ok(opps.length > 0);
  assert.ok(getEffectiveOdds(opps[0]) > 1);

  const matchAiOnly = {
    id: 'm4',
    status: 'SCHEDULED',
    homeTeam: { name: 'Team X' },
    awayTeam: { name: 'Team Y' },
    aiPick: { selection: 'Más de 1.5 Goles', probability: 72, odds: 1.38 }
  };
  const oppsAi = getTop3Opportunities(matchAiOnly);
  assert.equal(oppsAi.length, 1);
  assert.equal(oppsAi[0].selection, 'Más de 1.5 Goles');
  assert.equal(getEffectiveOdds(oppsAi[0]), 1.38);
});
