import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { applyCorsHeaders } from './cors';
import { analysisServiceUrl, authorizeAnalyzedBetaVideo } from '../services/analyzed-beta-videos';
import { logger } from '../utils/logger';

const VIDEO_ID_PATTERN = /^scraped-[A-Za-z0-9._-]+$/;

export async function handleAnalyzedBetaVideo(
  req: IncomingMessage,
  res: ServerResponse,
  requestUrl: URL,
  videoId: string,
  action: string,
): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    res.writeHead(404).end();
    return;
  }
  const climbUuid = requestUrl.searchParams.get('climbUuid') ?? '';
  if (!climbUuid || climbUuid.length > 100) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'climbUuid is required' }));
    return;
  }

  const beta = await authorizeAnalyzedBetaVideo(videoId, climbUuid);
  if (!beta || (action === 'moves' && !beta.has_move_analysis)) {
    res.writeHead(404).end();
    return;
  }

  const upstreamUrl =
    action === 'stream'
      ? analysisServiceUrl(`/review-media/${encodeURIComponent(videoId)}`)
      : analysisServiceUrl(`/api/moves?id=${encodeURIComponent(videoId)}`);
  if (!upstreamUrl) {
    res.writeHead(503).end();
    return;
  }

  const headers = new Headers();
  const range = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
  if (range && action === 'stream') headers.set('Range', range);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
    for (const name of ['accept-ranges', 'content-length', 'content-range', 'content-type']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    res.writeHead(upstream.status, responseHeaders);
    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }
    const stream = Readable.fromWeb(upstream.body as never);
    stream.on('error', (error) => {
      logger.warn('[AnalyzedBetaVideos] Upstream stream failed:', error);
      res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    logger.warn('[AnalyzedBetaVideos] Proxy request failed:', error);
    if (!res.headersSent) res.writeHead(503);
    res.end();
  }
}
