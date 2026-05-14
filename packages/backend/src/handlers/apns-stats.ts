import type { IncomingMessage, ServerResponse } from 'http';
import { applyCorsHeaders } from './cors';
import { getApnsMetrics } from '../services/apns';

const APNS_STATS_SECRET = process.env.APNS_STATS_SECRET;

/**
 * GET /api/internal/apns-stats
 *
 * Returns the in-memory APNs metrics counters for the current process. Counters
 * reset on restart — this is a debugging aid, not a long-term metrics store.
 *
 * Gated on the optional `APNS_STATS_SECRET` env var, matching the pattern used
 * by `/sync-cron`. If the env var is unset the endpoint is disabled.
 */
export async function handleApnsStats(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!APNS_STATS_SECRET) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const authHeader = req.headers['authorization'];
  const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authValue !== `Bearer ${APNS_STATS_SECRET}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(getApnsMetrics()));
}
