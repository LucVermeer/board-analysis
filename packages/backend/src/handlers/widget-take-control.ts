import type { IncomingMessage, ServerResponse } from 'http';
import { applyCorsHeaders } from './cors';
import { authenticateWidget } from './widget-auth';
import { takeSessionDriverControl } from '../services/session-driver-control';
import { logger } from '../utils/logger';

interface WidgetTakeControlBody {
  sessionId: string;
}

function isValidBody(body: unknown): body is WidgetTakeControlBody {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    const MAX_BODY = 2048;

    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY) {
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
 * Handle widget wall-control claim requests.
 *
 * POST /api/widget/take-control
 * Headers:
 *   Authorization: Bearer <apnsToken>
 * Body: { sessionId: string }
 *
 * The bearer token must be registered to the requested session and must have a
 * bound `userId`. Legacy anonymous token rows are rejected because the backend
 * cannot map them to a stable participant id for driver ownership.
 */
export async function handleWidgetTakeControl(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  let body: unknown;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
    return;
  }

  if (!isValidBody(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Body must include sessionId (string)' }));
    return;
  }

  const { sessionId } = body;
  const authHeader = req.headers['authorization'];
  const authHeaderValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

  const authResult = await authenticateWidget(authHeaderValue, sessionId).catch((error: unknown) => {
    logger.error('[WidgetTakeControl] Auth lookup failed:', error);
    return null;
  });

  if (authResult === null) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Auth error' }));
    return;
  }

  if (authResult.kind !== 'ok') {
    if (authResult.kind === 'wrong-session') {
      logger.info(
        `[WidgetTakeControl] Token bound to session ${authResult.boundSessionId}, request was for ${sessionId}; signaling re-register`,
      );
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Token bound to a different session; re-register' }));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    return;
  }

  if (!authResult.userId) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Widget take-control requires an authenticated participant' }));
    return;
  }

  try {
    await takeSessionDriverControl({
      sessionId,
      participantId: authResult.userId,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    logger.error('[WidgetTakeControl] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
  }
}
