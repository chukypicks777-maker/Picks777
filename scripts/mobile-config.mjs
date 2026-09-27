import { readFile, mkdir, writeFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../mobile.config.json', import.meta.url)));
const origin = new URL(config.origin);
if (origin.protocol !== 'https:' || origin.origin !== config.origin || origin.username || origin.password || origin.port) throw new Error('Se requiere un origen HTTPS, sin ruta ni credenciales.');
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(config.applicationId)) throw new Error('applicationId inválido');
if (!Number.isInteger(config.versionCode) || config.versionCode < 1) throw new Error('versionCode inválido');
const fingerprints = config.sha256CertFingerprints;
if (!Array.isArray(fingerprints) || fingerprints.some(value => !/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) throw new Error('Huellas SHA-256 inválidas');
const statements = fingerprints.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: {
  namespace: 'android_app', package_name: config.applicationId, sha256_cert_fingerprints: fingerprints
} }] : [];
const directory = new URL('../public/.well-known/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('assetlinks.json', directory), JSON.stringify(statements, null, 2) + '\n');
if (!fingerprints.length) console.warn('Pendiente: añade la huella del certificado de firma de Play en mobile.config.json para verificar la TWA.');
