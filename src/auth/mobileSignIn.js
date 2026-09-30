import { sessionRequest } from './sessionClient.js';
import { isIOSApp } from './platform.js';
export const isAndroidApp = () => /Picks777Android\/1/.test(navigator.userAgent);
export const isNativeApp = () => isAndroidApp() || isIOSApp();
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
let pending = null;
export const cancelMobileSignIn = () => pending?.abort();
if (typeof window !== 'undefined') window.addEventListener('picks-mobile-auth-cancel', cancelMobileSignIn);
export async function mobileSignIn(provider = 'google') {
  if (!['google', 'apple'].includes(provider)) throw new Error('Proveedor de acceso no disponible.');
  if (pending) throw new Error('Ya hay un acceso en curso. Termínalo o espera a que venza.');
  const controller = new AbortController();
  pending = controller;
  try {
    const verifier = hex(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const request = await sessionRequest('mobile/start', { challenge }, controller.signal);
    if (controller.signal.aborted) throw new Error('Inicio de sesión cancelado.');
    // Only the request id travels to the browser. The secret stays in this WebView's memory.
    window.location.assign('/mobile-auth' + (provider === 'apple' ? '?provider=apple' : '') + '#' + request.id);
    const deadline = Math.min(request.expiresAt, Date.now() + 300000);
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (controller.signal.aborted) throw new Error('Inicio de sesión cancelado.');
      const result = await sessionRequest('mobile/poll', { id: request.id, verifier }, controller.signal);
      if (result.credential) return { token: result.credential };
    }
    throw new Error('El acceso venció. Pulsa Continuar con Google para intentarlo otra vez.');
  } finally { pending = null; }
}
