import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Read a request body as a UTF-8 string, rejecting (and destroying the socket)
 * once it exceeds `maxBytes`. Shared by the JWT-authed session handlers so the
 * streaming read + body cap live in one place.
 */
export function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Write a JSON response with the standard headers for per-user session data:
 * `Cache-Control: no-store` (never cache a personal payload) and
 * `X-Content-Type-Options: nosniff`. Extra headers (e.g. `Retry-After`) merge
 * on top.
 */
export function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}
