import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBgSdnJJMaR2yIJqk3mRUIbUSimn7e7Lj8",
  authDomain: "ia-luz.firebaseapp.com",
  projectId: "ia-luz",
  storageBucket: "ia-luz.firebasestorage.app",
  messagingSenderId: "102504637276",
  appId: "1:102504637276:web:19e05e46caaac04f159799"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
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
