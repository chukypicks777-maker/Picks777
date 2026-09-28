import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut, inMemoryPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBgSdnJJMaR2yIJqk3mRUIbUSimn7e7Lj8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ia-luz.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ia-luz",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ia-luz.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "102504637276",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:102504637276:web:19e05e46caaac04f159799"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function loginWithRealGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
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
