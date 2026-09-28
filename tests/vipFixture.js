export async function vipFixture(storage, code) {
  const { setSession } = await import('../server/session.js');
  const user = await storage.upsertGoogleUser({ googleId: 'fixture-' + code, email: code.toLowerCase() + '@example.invalid' });
  const result = await storage.redeemUserCode({ userId: user.id, code });
  if (!result.success) throw new Error(result.message);
  let cookie;
  setSession({ cookie: (key, value) => { cookie = key + '=' + value; } }, { userId: user.id, role: 'vip_user', code, expires: Date.parse(result.expiresAt) });
  return cookie;
}
