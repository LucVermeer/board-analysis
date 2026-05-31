import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// TEMP DIAGNOSTIC — remove once we've isolated why getToken returns null on
// boardsesh.com despite a valid session cookie. Logs cookie NAMES (not values),
// presence-only env flags, and whether getToken found a token. No secrets.
function logDiagnostic(request: NextRequest, tokenFound: boolean, error?: unknown) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  const nextAuthCookieNames = cookieNames.filter((n) => n.includes('next-auth'));
  const envFlags = {
    hasSecret: !!process.env.NEXTAUTH_SECRET,
    secretLen: process.env.NEXTAUTH_SECRET?.length ?? 0,
    hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
    nextAuthUrlScheme: process.env.NEXTAUTH_URL?.split('://')[0] ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  };
  console.log(
    '[ws-auth-debug]',
    JSON.stringify({
      cookieCount: cookieNames.length,
      nextAuthCookieNames,
      envFlags,
      tokenFound,
      errorName: error instanceof Error ? error.name : null,
      errorMessage: error instanceof Error ? error.message : null,
    }),
  );
}

/**
 * API endpoint to get a WebSocket authentication token.
 * Returns the NextAuth JWT token that can be passed to the WebSocket backend.
 */
export async function GET(request: NextRequest) {
  try {
    // Get the NextAuth JWT token from the request
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      raw: true, // Get the raw encoded JWT string
    });

    logDiagnostic(request, !!token);

    if (!token) {
      // User is not authenticated - this is OK, just return null
      return NextResponse.json({ token: null, authenticated: false });
    }

    return NextResponse.json({
      token,
      authenticated: true,
    });
  } catch (error) {
    logDiagnostic(request, false, error);
    console.error('[ws-auth] Error getting token:', error);
    return NextResponse.json({ token: null, authenticated: false, error: 'Failed to get token' }, { status: 500 });
  }
}
