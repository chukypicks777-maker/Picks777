import { loginWithRealGoogle, loginWithRealApple, logoutIdentity } from '../utils/firebase.js';
import { isNativeApp, mobileSignIn } from './mobileSignIn.js';
// Keep popup creation within the tap event; Safari may block it after an async import.
const providers = {
  apple: {
    signIn() { return isNativeApp() ? mobileSignIn('apple') : loginWithRealApple(); },
    signOut() { return logoutIdentity(); }
  },
  google: {
    signIn() {
      return isNativeApp() ? mobileSignIn() : loginWithRealGoogle();
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
