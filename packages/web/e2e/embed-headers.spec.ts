import { test, expect, type APIResponse } from '@playwright/test';

/**
 * Security headers for the /embed/** iframe widgets (board view + gym
 * leaderboard) — the ONLY routes Boardsesh serves without a frame-denying
 * X-Frame-Options.
 *
 * Contract under test (next.config.mjs headers() + middleware.ts carve-out):
 *  - /embed/** responses carry `Content-Security-Policy: frame-ancestors *`,
 *    NO X-Frame-Options, and NO Set-Cookie (embeds are cookieless: the
 *    middleware bypasses locale detection, so the sticky-locale cookie can
 *    never be written on an embed response).
 *  - Every other route (including 404s) keeps X-Frame-Options: SAMEORIGIN.
 *  - Locale-prefixed embed paths 308 to the un-prefixed path, because the
 *    header matcher sees the ORIGINAL request path — /es/embed/** served
 *    directly would dodge the embed rule and arrive frame-denying.
 *
 * The assertions run against nonexistent uuids on purpose: next.config
 * `headers()` match the request PATH, not the response status, so they
 * exercise the exact header split without needing seeded embed data. The
 * status differs by environment — 404 when the GraphQL backend is up (the
 * resolver answers "no such board/gym"), 200 when it's down (the embed's
 * transient-failure retry screen renders instead of bricking the iframe) —
 * so status assertions accept both; the HEADER contract is identical.
 */

const MISSING_BOARD_UUID = '00000000-0000-4000-8000-000000000000';
const MISSING_GYM_UUID = '00000000-0000-4000-8000-000000000001';

function headerValue(response: APIResponse, name: string): string | undefined {
  return response.headers()[name];
}

function setCookieValues(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);
}

test.describe('embed security headers', () => {
  test('board embed is frameable, cookieless, and drops X-Frame-Options (even on 404)', async ({ request }) => {
    const response = await request.get(`/embed/board/${MISSING_BOARD_UUID}`, { maxRedirects: 0 });

    // Nonexistent board → 404 (backend up) or the retry screen (backend
    // down); the route headers apply either way.
    expect([200, 404]).toContain(response.status());
    expect(headerValue(response, 'content-security-policy')).toContain('frame-ancestors *');
    expect(headerValue(response, 'x-frame-options')).toBeUndefined();
    expect(setCookieValues(response)).toEqual([]);
    // The rest of the security-header set still rides along on embeds.
    expect(headerValue(response, 'x-content-type-options')).toBe('nosniff');
    expect(headerValue(response, 'referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  test('gym leaderboard embed carries the same frameable, cookieless headers', async ({ request }) => {
    const response = await request.get(`/embed/gym/${MISSING_GYM_UUID}/leaderboard?period=day`, { maxRedirects: 0 });

    expect([200, 404]).toContain(response.status());
    expect(headerValue(response, 'content-security-policy')).toContain('frame-ancestors *');
    expect(headerValue(response, 'x-frame-options')).toBeUndefined();
    expect(setCookieValues(response)).toEqual([]);
  });

  test('non-embed routes keep X-Frame-Options: SAMEORIGIN', async ({ request }) => {
    const homeResponse = await request.get('/', { maxRedirects: 0 });
    expect(homeResponse.status()).toBe(200);
    expect(headerValue(homeResponse, 'x-frame-options')).toBe('SAMEORIGIN');

    // A kiosk TV page (here a nonexistent one → 404) is NOT frameable either —
    // only /embed/** opted out of the frame-denying default.
    const kioskResponse = await request.get('/kiosk/whatever', { maxRedirects: 0 });
    expect(headerValue(kioskResponse, 'x-frame-options')).toBe('SAMEORIGIN');
    expect(headerValue(kioskResponse, 'content-security-policy') ?? '').not.toContain('frame-ancestors *');
  });

  test('an embed-lookalike path outside /embed/ keeps the frame-denying default', async ({ request }) => {
    // Regex sanity for the `/((?!embed/).*)` exclusion: only the /embed/**
    // subtree opts out, not paths merely starting with the word "embed".
    const response = await request.get('/embedded', { maxRedirects: 0 });
    expect(headerValue(response, 'x-frame-options')).toBe('SAMEORIGIN');
  });

  test('locale-prefixed embed paths 308 to the un-prefixed embed path, cookieless', async ({ request }) => {
    const spanishResponse = await request.get('/es/embed/board/x', { maxRedirects: 0 });
    expect(spanishResponse.status()).toBe(308);
    expect(new URL(spanishResponse.headers()['location'], 'http://localhost').pathname).toBe('/embed/board/x');
    expect(setCookieValues(spanishResponse)).toEqual([]);

    const frenchResponse = await request.get(`/fr/embed/gym/${MISSING_GYM_UUID}/leaderboard?period=day&board=abc`, {
      maxRedirects: 0,
    });
    expect(frenchResponse.status()).toBe(308);
    const frenchLocation = new URL(frenchResponse.headers()['location'], 'http://localhost');
    expect(frenchLocation.pathname).toBe(`/embed/gym/${MISSING_GYM_UUID}/leaderboard`);
    // The redirect preserves the widget's query string.
    expect(frenchLocation.search).toBe('?period=day&board=abc');
  });
});
