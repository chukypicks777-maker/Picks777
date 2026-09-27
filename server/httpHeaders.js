// These directives do not restrict the Google popup's script/iframe dependencies.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export function securityHeaders(req, res, next) {
  res.set(SECURITY_HEADERS);
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
