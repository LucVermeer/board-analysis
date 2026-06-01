import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isSecureCookieContext, sessionCookieName } from '@/app/lib/auth/secure-cookies';

/**
 * API endpoint to get a WebSocket authentication token.
 * Returns the NextAuth JWT token that can be passed to the WebSocket backend.
 */
export async function GET(request: NextRequest) {
  try {
    const secureCookie = isSecureCookieContext();
    // Pass cookieName + secureCookie explicitly: next-auth's internal derivation
    // breaks if NEXTAUTH_URL is set to an http:// value (the `??` only falls back
    // when NEXTAUTH_URL is unset, not when it's wrong).
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie,
      cookieName: sessionCookieName(),
      raw: true,
    });

    if (!token) {
      // User is not authenticated - this is OK, just return null
      return NextResponse.json({ token: null, authenticated: false });
    }

    return NextResponse.json({
      token,
      authenticated: true,
    });
  } catch (error) {
    console.error('[ws-auth] Error getting token:', error);
    return NextResponse.json({ token: null, authenticated: false, error: 'Failed to get token' }, { status: 500 });
  }
}
