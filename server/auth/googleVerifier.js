import { CONFIG } from '../config.js';
import { FIREBASE_WEB_CONFIG } from '../../src/constants/firebase.js';

export async function verifyGoogleToken(credential) {
  if (typeof credential !== 'string' || credential.length > 12000 || !credential) return null;
  try {
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json();
      if (data.aud === CONFIG.GOOGLE_CLIENT_ID && ['accounts.google.com', 'https://accounts.google.com'].includes(data.iss) && Number(data.exp) * 1000 > Date.now() && [true, 'true'].includes(data.email_verified) && data.sub && data.email) return data;
    }
  } catch {}
  try {
    const key = FIREBASE_WEB_CONFIG.apiKey;
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: credential }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const data = await response.json(), user = data.users?.[0];
    if (!user?.localId || !user.emailVerified || !user.email || user.disabled || !user.providerUserInfo?.some(p => p.providerId === 'google.com')) return null;
    return { sub: user.localId, email: user.email, name: user.displayName, picture: user.photoUrl };
  } catch { return null; }
}

// Firebase validates Apple OAuth and the project-bound ID token on its server.
// Never trust an email or provider name supplied by the client.
export async function verifyAppleToken(credential) {
  if (typeof credential !== 'string' || !credential || credential.length > 12000) return null;
  try {
    const key = FIREBASE_WEB_CONFIG.apiKey;
    const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: credential }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const user = (await response.json()).users?.[0];
    if (!user?.localId || !user.emailVerified || !user.email || user.disabled || !user.providerUserInfo?.some(p => p.providerId === 'apple.com')) return null;
    return { sub: user.localId, email: user.email, name: user.displayName, picture: user.photoUrl };
  } catch { return null; }
}
