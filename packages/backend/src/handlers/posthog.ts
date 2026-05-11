import type { IncomingMessage, ServerResponse } from 'http';
import { applyCorsHeaders } from './cors';

const POSTHOG_UPSTREAM = 'https://us.i.posthog.com';
const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;
const PROXY_PATH_PREFIX = '/api/posthog';

function getClientIp(req: IncomingMessage): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? null;
}

function readBody(req: IncomingMessage, limitBytes: number): Promise<Buffer | { tooLarge: true }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limitBytes) {
        resolve({ tooLarge: true });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Reverse proxy for PostHog ingestion.
 *
 * Forwards POST /api/posthog/<rest> → https://us.i.posthog.com/<rest>, preserving
 * the query string and request body. The whole point is to make events first-party
 * so ad-blockers that target *.posthog.com don't drop them.
 *
 * posthog-js-lite uses Content-Type: text/plain and no custom headers, so the
 * browser treats this as a CORS-safelisted "simple" request — no preflight.
 */
export async function handlePosthogProxy(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const rest = url.pathname.slice(PROXY_PATH_PREFIX.length);
  if (!rest || !rest.startsWith('/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const body = await readBody(req, MAX_BODY_BYTES);
  if ('tooLarge' in body) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Payload too large' }));
    return;
  }

  const upstreamUrl = `${POSTHOG_UPSTREAM}${rest}${url.search}`;
  const headers: Record<string, string> = {
    'Content-Type': typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : 'text/plain',
  };
  const clientIp = getClientIp(req);
  if (clientIp) headers['X-Forwarded-For'] = clientIp;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    // PostHog ingestion only accepts text payloads (JSON in a text/plain body),
    // so it's safe to forward as a UTF-8 string. Avoids @types/node BodyInit
    // friction with Buffer/Uint8Array.
    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: body.toString('utf8'),
      signal: controller.signal,
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') ?? 'application/json';

    res.writeHead(upstream.status, { 'Content-Type': contentType });
    res.end(responseBody);

    console.info('[posthog-proxy]', { status: upstream.status, durationMs: Date.now() - startedAt, path: rest });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    console.error('[posthog-proxy] upstream error', {
      aborted,
      durationMs: Date.now() - startedAt,
      path: rest,
      message: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream unavailable' }));
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
