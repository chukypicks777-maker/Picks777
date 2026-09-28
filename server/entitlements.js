import { isOwnerUser } from './config.js';

export function entitlement(user, code, now = Date.now()) {
  if (isOwnerUser(user)) return { role: 'owner', isAdmin: true, plan: 'Owner', isVip: false, isTrial: false, trialExpired: false, daysRemaining: 365, expires: now + 8 * 3600000 };
  const expires = Date.parse(code?.expiresAt);
  if (code?.isClaimed && code.claimedUserId === user.id && !code.revoked && !code.deletedAt && expires > now) {
    return { role: 'vip_user', plan: 'VIP', isVip: true, isTrial: false, trialExpired: false, code: code.code, expires, daysRemaining: Math.ceil((expires - now) / 86400000) };
  }
  const trialEnd = Date.parse(user.trialExpiresAt);
  // A short VIP must not silently revert to a longer introductory trial.
  const isTrial = !user.hasRedeemedVip && !user.vipCode && trialEnd > now;
  return { role: isTrial ? 'trial_user' : 'expired_user', plan: isTrial ? 'Prueba 3 Días' : 'Acceso vencido', isVip: false, isTrial, trialExpired: !isTrial,
    expires: Number.isFinite(expires) ? expires : Number.isFinite(trialEnd) ? trialEnd : 0,
    daysRemaining: isTrial ? Math.ceil((trialEnd - now) / 86400000) : 0 };
}
