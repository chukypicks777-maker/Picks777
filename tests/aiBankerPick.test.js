import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateAiMatchReport } from '../server/services/aiService.js';
import { storage } from '../server/storage.js';
import { poissonModel } from '../server/services/probabilityModel.js';
test('AI cannot inject made-up probabilities, scores, tactics, odds, HTML or unauthorized fact IDs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'picks-ai-grounded-')),oldFile=storage.file,oldFetch=globalThis.fetch;
 storage.file=path.join(dir,'access.json');
 try{
  await storage.updateAiConfig({provider:'custom',baseUrl:'https://vyceai.com/v1',apiKey:'test-only-key',selectedModel:'test-model'});
  const team={name:'Test',gamesPlayed:10,goalsFor:20,goalsAgainst:10},model=poissonModel(team,team);
  const match={id:'test',status:'SCHEDULED',kickoff:new Date(Date.now()+86400000).toISOString(),homeTeam:team,awayTeam:team,model,probabilities:model.probabilities};
  let response={factIds:['goals','score'],topPick:{probability:500},predictedScore:'99 - 99',tacticalAnalysis:'<script>bad</script>'};
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]}));
  const good=await generateAiMatchReport(match,{forceRefresh:true});assert.equal(good.aiAvailable,true);assert.equal(good.predictedScore,model.predictedScore);assert.equal(good.topPick.odds,null);assert.ok(good.topPick.probability<=100);assert.ok(!JSON.stringify(good).includes('<script>'));
  response={factIds:['made-up']};const bad=await generateAiMatchReport(match,{forceRefresh:true});assert.equal(bad.aiAvailable,false);assert.deepEqual(bad.probabilities,model.probabilities);
  response={factIds:[{text:'injected'}]};assert.equal((await generateAiMatchReport(match,{forceRefresh:true})).aiAvailable,false);
 }finally{globalThis.fetch=oldFetch;storage.file=oldFile;await rm(dir,{recursive:true,force:true});}
});
