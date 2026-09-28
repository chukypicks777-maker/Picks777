import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const apkPath = fileURLToPath(new URL('../artifacts/android/picks777-preview.apk', import.meta.url));
const metadataPath = new URL('../artifacts/android/release.json', import.meta.url);
export async function mobileRelease() {
  try {
    const release = JSON.parse(await readFile(metadataPath, 'utf8'));
    const file = await stat(apkPath);
    const hash = createHash('sha256').update(await readFile(apkPath)).digest('hex');
    if (hash !== release.sha256 || file.size !== release.bytes) throw new Error('Artifact mismatch');
    return { available: true, versionName: release.versionName, versionCode: release.versionCode,
      sha256: hash, bytes: file.size, builtAt: release.builtAt,
      downloadUrl: '/api/admin/mobile/apk', origin: release.origin };
  } catch {
    return { available: false, message: 'El APK firmado todavía no está incluido en este despliegue. Ejecuta npm run android:preview y vuelve a desplegar.' };
  }
}
