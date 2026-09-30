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
const paths = ['/', '/beisbol', '/tenis', '/basquetbol', '/api/health', '/api/auth/session', '/api/admin/codes', '/api/matches', '/.env', '/server/data/access-v2.json', '/privacidad.html'];
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
  const markers = ['sport-panel-', 'beisbol', 'tenis', 'basquetbol', 'Próximamente'];
  const digest = createHash('sha256').update(text).digest('hex');
  let localAssetMatches = false;
  try { localAssetMatches = digest === createHash('sha256').update(await fs.readFile('dist' + asset)).digest('hex'); } catch {}
  checks.push({ path: asset, status: response.status, pass: response.ok && markers.every(marker => text.includes(marker)), sha256: digest, localAssetMatches });
} else checks.push({ path: 'frontend-asset', pass: false });
const deniedOrigin = await read('/api/auth/redeem-code', { method: 'POST',
  headers: { Origin: 'https://untrusted.example.invalid', 'Content-Type': 'application/json' }, body: '{}' });
checks.push({ path: 'cross-origin-redeem', status: deniedOrigin.response.status, pass: deniedOrigin.response.status === 403 });
const forged = await read('/api/matches', { headers: { Cookie: 'picks_session=unsigned.invalid' } });
checks.push({ path: 'forged-session', status: forged.response.status, pass: forged.response.status === 401 });
const report = { checkedAt: new Date().toISOString(), origin, localCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  pass: checks.every(check => check.pass), checks,
  limitation: 'Anonymous production checks only. Authenticated expiry, deletion and VIP tests run against isolated fixtures, not production users.' };
await fs.mkdir('artifacts', { recursive: true });
await fs.writeFile('artifacts/security-review-production.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
