import { initializeApp, getApps, getApp } from 'firebase/app';
import { FIREBASE_WEB_CONFIG } from '../constants/firebase.js';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut, inMemoryPersistence } from 'firebase/auth';

const firebaseConfig = FIREBASE_WEB_CONFIG;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
export async function loginWithRealGoogle() { return loginWithProvider(googleProvider); }
export async function loginWithRealApple() { return loginWithProvider(appleProvider); }
async function loginWithProvider(provider) {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const token = await user.getIdToken();
  return {
    user: {
      id: user.uid,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0],
      picture: user.photoURL || ''
    },
    token
  };
}

export const logoutIdentity = () => signOut(auth);
