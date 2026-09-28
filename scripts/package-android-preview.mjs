import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const config = JSON.parse(await fs.readFile('mobile.config.json', 'utf8'));
const apk = await fs.readFile('android/app/build/outputs/apk/release/app-release.apk');
await fs.mkdir('artifacts/android', { recursive: true });
await fs.writeFile('artifacts/android/picks777-preview.apk', apk);
await fs.writeFile('artifacts/android/release.json', JSON.stringify({
  versionName: config.versionName, versionCode: config.versionCode, origin: config.origin,
  sha256: createHash('sha256').update(apk).digest('hex'), bytes: apk.length, builtAt: new Date().toISOString()
}, null, 2));
console.log('APK firmado y manifiesto preparados para el panel owner.');
