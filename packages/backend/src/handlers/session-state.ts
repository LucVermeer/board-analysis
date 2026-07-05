import type { IncomingMessage, ServerResponse } from 'http';
import { parseBoardPath } from '@boardsesh/board-config';
import { applyCorsHeaders } from './cors';
import { authenticateSessionRequest } from './session-auth';
import { verifyWidgetSession } from './widget-session-guard';
import { roomManager } from '../services/room-manager';
import { logger } from '../utils/logger';

/**
 * GET /api/session/state?sessionId=<uuid>
 * Headers: Authorization: Bearer <mobile JWT>
 *
 * A slim, poll-friendly snapshot of a session's current climb for clients that
 * cannot hold a WebSocket subscription (the Garmin watch). Deliberately omits
 * the heavy `queue` array and every climb's `frames` string — the watch has
 * kilobytes of memory, so we return only what it needs to render the current
 * climb AND to build a `saveTick` (board resolution comes from the session's
 * `boardPath`, parsed server-side so the watch never has to).
 *
 * `sequence` / `stateHash` let the watch skip a re-render when nothing changed
 * between polls. 401 (auth) / 403 (not a participant) / 410 (session ended).
 */

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export async function handleSessionState(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const auth = await authenticateSessionRequest(req);
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.error });
    return;
  }

  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    sendJson(res, 400, { error: 'sessionId query parameter is required' });
    return;
  }

  const guard = await verifyWidgetSession(sessionId, auth.userId);
  if (!guard.ok) {
    sendJson(res, guard.status, { error: guard.error });
    return;
  }

  try {
    // verifyWidgetSession already confirmed the session exists and is active;
    // re-fetch here to read its boardPath for board resolution.
    const session = await roomManager.getSessionById(sessionId);
    if (!session) {
      // Raced with session end between the guard and here.
      sendJson(res, 410, { error: 'Session has ended; re-register' });
      return;
    }

    const queueState = await roomManager.getQueueState(sessionId);
    const parsedBoard = parseBoardPath(session.boardPath);

    const currentItem = queueState.currentClimbQueueItem;
    const currentIndex = currentItem ? queueState.queue.findIndex((q) => q.uuid === currentItem.uuid) : -1;

    const climb = currentItem
      ? {
          climbUuid: currentItem.climb.uuid,
          name: currentItem.climb.name,
          difficulty: currentItem.climb.difficulty,
          angle: currentItem.climb.angle,
          mirrored: currentItem.climb.mirrored === true,
          isBenchmark: currentItem.climb.benchmark_difficulty != null && currentItem.climb.benchmark_difficulty !== '',
        }
      : null;

    sendJson(res, 200, {
      sessionId,
      sequence: queueState.sequence,
      stateHash: queueState.stateHash,
      currentIndex,
      queueLength: queueState.queue.length,
      boardType: parsedBoard?.boardName ?? null,
      layoutId: parsedBoard?.layoutId ?? null,
      sizeId: parsedBoard?.sizeId ?? null,
      setIds: parsedBoard?.setIds ?? null,
      angle: parsedBoard?.angle ?? null,
      climb,
    });
  } catch (error) {
    logger.error('[SessionState] Error:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}
