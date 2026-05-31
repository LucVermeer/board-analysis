// next-auth derives `secureCookie` from `NEXTAUTH_URL?.startsWith('https://')
// ?? !!process.env.VERCEL`. The `??` only kicks in when NEXTAUTH_URL is unset
// — if it's set to an `http://` value, secureCookie silently becomes false and
// next-auth reads/writes `next-auth.session-token` instead of
// `__Secure-next-auth.session-token`. A misconfigured NEXTAUTH_URL in Vercel
// took ws-auth (and all logbook fetches) down once already; this helper is the
// floor so it can't happen again.
export function isSecureCookieContext(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXTAUTH_URL?.startsWith('https://') === true ||
    !!process.env.VERCEL_URL
  );
}

export function sessionCookieName(): string {
  return isSecureCookieContext() ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}
