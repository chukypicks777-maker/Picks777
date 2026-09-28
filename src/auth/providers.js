import { loginWithRealGoogle, logoutIdentity } from '../utils/firebase.js';
// Keep popup creation within the tap event; Safari may block it after an async import.
const providers = {
  google: {
    signIn() {
      return loginWithRealGoogle();
    },
    signOut() {
      return logoutIdentity();
    }
  }
};

export function identityProvider(name = 'google') {
  if (!Object.hasOwn(providers, name)) throw new Error('Proveedor de acceso no disponible.');
  return providers[name];
}
