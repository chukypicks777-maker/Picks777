// Read-only production smoke checks. No account, credential or membership is created.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const origin = 'https://picks777.vercel.app';
const checks = [];
async function read(path, init = {}) {
  const response = await fetch(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { 'Cache-Control': 'no-cache', ...init.headers } });
  return { response, text: await response.text() };
}
const paths = ['/', '/femenil', '/beisbol', '/tenis', '/basquetbol', '/api/health', '/api/auth/session', '/api/admin/codes', '/api/matches', '/api/sports/beisbol', '/api/sports/tenis', '/api/sports/basquetbol',
  '/api/sports/beisbol?category=bankers', '/api/sports/tenis?category=bankers', '/api/sports/basquetbol?category=bankers',
  '/.env', '/server/data/access-v2.json', '/privacidad.html'];
const responses = await Promise.all(paths.map(async path => ({ path, ...await read(path) })));
for (const { path, response, text } of responses) {
  let pass;
  const isApi = path.startsWith('/api/');
  const data = isApi ? JSON.parse(text) : null;
  if (path === '/api/health') pass = response.status === 200 && data.status === 'ready' && data.storage === 'redis';
  else if (path === '/api/auth/session') pass = response.status === 200 && data.valid === false;
  else if (isApi) pass = response.status === 401 && data.success === false;
  else pass = response.status === 200 && response.headers.get('content-type')?.includes('text/html') && text.includes('<html');
  if (isApi) pass &&= response.headers.get('cache-control')?.includes('no-store');
  if (path === '/privacidad.html') pass &&= text.includes('huella criptográfica');
  checks.push({ path, status: response.status, pass: Boolean(pass) });
}
const html = responses.find(result => result.path === '/').text;
const asset = html.match(/src="([^"]+\.js)"/)?.[1];
if (asset) {
  const { response, text } = await read(asset);
  const markers = ['sport-panel-', 'femenil', 'beisbol', 'tenis', 'basquetbol', 'Primer inning', 'KBO', 'Top 10 Banqueros', 'HECHOS PRIORIZADOS POR IA'];
  const digest = createHash('sha256').update(text).digest('hex');
  let localAssetMatches = false;
  let localAsset = null;
  try {
    // Vite's filename hash can differ by build platform even for identical bytes.
    const localHtml = await fs.readFile('dist/index.html', 'utf8');
    localAsset = localHtml.match(/src="([^"]+\.js)"/)?.[1];
    localAssetMatches = Boolean(localAsset) && digest === createHash('sha256').update(await fs.readFile('dist' + localAsset)).digest('hex');
  } catch {}
  checks.push({ path: asset, status: response.status, pass: response.ok && localAssetMatches && markers.every(marker => text.includes(marker)), sha256: digest, localAsset, localAssetMatches });
} else checks.push({ path: 'frontend-asset', pass: false });
const deniedOrigin = await read('/api/auth/redeem-code', { method: 'POST',
  headers: { Origin: 'https://untrusted.example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
checks.push({ path: 'cross-origin-redeem', status: deniedOrigin.response.status, pass: deniedOrigin.response.status === 403 });
const forged = await read('/api/matches', { headers: { Cookie: 'picks_session=unsigned.invalid' } });
checks.push({ path: 'forged-session', status: forged.response.status, pass: forged.response.status === 401 });
for (const sport of ['beisbol', 'tenis', 'basquetbol']) {
  const result = await read(`/api/sports/${sport}/unauthorized-test/ai-analysis`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forceRefresh: true }) });
  checks.push({ path: `${sport}:anonymous-ai-denied`, status: result.response.status,
    pass: result.response.status === 401 && result.response.headers.get('cache-control')?.includes('no-store') && JSON.parse(result.text).success === false });
}
const activeModel = await read('/api/settings/active-model');
const metadata = JSON.parse(activeModel.text);
checks.push({ path: 'configured-ai-metadata', status: activeModel.response.status, model: metadata.selectedModel,
  pass: activeModel.response.status === 200 && metadata.success === true && metadata.isConfigured === true && !('apiKey' in metadata) });
const report = { checkedAt: new Date().toISOString(), origin, localCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  pass: checks.every(check => check.pass), checks,
  limitation: 'Anonymous production checks only. Authenticated expiry, deletion and VIP tests run against isolated fixtures, not production users.' };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/sports-production-verification-2026-10-05.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
