// Provider SDKs are loaded on demand; components only depend on this contract.
const providers = {
  google: {
    async signIn() {
      const { loginWithRealGoogle } = await import('../utils/firebase.js');
      return loginWithRealGoogle();
    },
    async signOut() {
      const { logoutIdentity } = await import('../utils/firebase.js');
      return logoutIdentity();
    }
  }
};

export function identityProvider(name = 'google') {
  if (!Object.hasOwn(providers, name)) throw new Error('Proveedor de acceso no disponible.');
  return providers[name];
}
