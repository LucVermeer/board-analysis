// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { SUPPORTED_BOARDS } from './app/lib/board-data';
import { getListPageCacheTTL } from './app/lib/list-page-cache';
import { CLIMB_SESSION_COOKIE } from './app/lib/climb-session-cookie';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, isSupportedLocale } from './app/lib/i18n/config';
import { detectLocale } from './app/lib/i18n/detect-locale';

const SPECIAL_ROUTES = ['angles', 'grades']; // routes that don't need board validation

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block PHP requests
  if (pathname.includes('.php')) {
    return new NextResponse(null, {
      status: 404,
      statusText: 'Not Found',
    });
  }

  // Check API routes
  if (pathname.startsWith('/api/v1/')) {
    const pathParts = pathname.split('/');
    if (pathParts.length >= 4) {
      const routeIdentifier = pathParts[3].toLowerCase(); // either a board name or special route

      // Allow special routes to pass through
      if (SPECIAL_ROUTES.includes(routeIdentifier)) {
        return NextResponse.next();
      }

      // For all other routes, validate board name
      if (!(SUPPORTED_BOARDS as readonly string[]).includes(routeIdentifier)) {
        console.info('Middleware board_name check returned 404');
        return new NextResponse(null, {
          status: 404,
          statusText: 'Not Found',
        });
      }
    }
  }

  // Backward compat: redirect old ?session= URLs to clean URLs with cookie.
  // The redirect cost (~150ms) is far less than a CDN cache miss (1.3-1.6s).
  const sessionParam = request.nextUrl.searchParams.get('session');
  if (sessionParam) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('session');
    const response = NextResponse.redirect(cleanUrl, 307);
    response.cookies.set(CLIMB_SESSION_COOKIE, sessionParam, {
      path: '/',
      sameSite: 'lax',
      maxAge: 86400,
    });
    return response;
  }

  // Detect locale from URL prefix. API routes don't carry a locale prefix —
  // skip them so we don't mangle their paths.
  const isApi = pathname.startsWith('/api/');
  const { locale, strippedPath, needsRewrite } = isApi
    ? { locale: DEFAULT_LOCALE, strippedPath: pathname, needsRewrite: false }
    : detectLocale(pathname);

  // Cookie-driven sticky locale: when a page request arrives without a locale
  // prefix and the visitor previously chose a non-default locale, send them
  // to the prefixed URL so subsequent navigation stays in their language.
  if (!isApi && locale === DEFAULT_LOCALE) {
    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    if (isSupportedLocale(cookieLocale) && cookieLocale !== DEFAULT_LOCALE) {
      const target = new URL(`/${cookieLocale}${pathname}`, request.url);
      target.search = request.nextUrl.search;
      // 307 (not 308): browsers cache 308 indefinitely, so a user who
      // clears their locale cookie would still be redirected to /es/...
      // from the browser cache. 307 is revalidated on every request.
      return NextResponse.redirect(target, 307);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);

  let response: NextResponse;
  if (needsRewrite) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = strippedPath;
    response = NextResponse.rewrite(rewrittenUrl, {
      request: { headers: requestHeaders },
    });
  } else {
    response = NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Sticky cookie: any visit on a non-default locale URL writes the cookie so
  // a shared /es/... link from a friend persists for the recipient too.
  if (locale !== DEFAULT_LOCALE) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Use Vercel-CDN-Cache-Control because Next.js overwrites Cache-Control
  // for dynamic pages (pages that use searchParams) with "private, no-store".
  // Vercel-CDN-Cache-Control is the highest-priority header for Vercel's CDN
  // and is not touched by Next.js rendering.
  // Cache-key follows the original (locale-prefixed) URL, so en and es never collide.
  const cacheTTL = getListPageCacheTTL(strippedPath, request.nextUrl.searchParams);
  if (cacheTTL !== null) {
    const cdnCacheValue = `s-maxage=${cacheTTL}, stale-while-revalidate=${cacheTTL * 7}`;
    response.headers.set('Vercel-CDN-Cache-Control', cdnCacheValue);
    response.headers.set('CDN-Cache-Control', cdnCacheValue);
  }

  return response;
}

export const config = {
  matcher: [
    '/api/v1/:path*',
    // Match all page routes but skip static files, Next.js internals, and Vercel Flags Explorer
    '/((?!_next/static|_next/image|favicon.ico|monitoring|\\.well-known/|.*\\..*).*)',
  ],
};
