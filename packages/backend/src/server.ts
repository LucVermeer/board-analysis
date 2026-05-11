import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync } from 'node:fs';
import type { WebSocketServer } from 'ws';
import { pubsub } from './pubsub/index';
import { roomManager } from './services/room-manager';
import { redisClientManager } from './redis/client';
import { eventBroker, NotificationWorker } from './events/index';
import { initCors, applyCorsHeaders } from './handlers/cors';
import { handleHealthCheck } from './handlers/health';
import { handleSessionJoin } from './handlers/join';
import { handleAvatarUpload } from './handlers/avatars';
import { handleStaticAvatar, handleStaticBetaThumbnail } from './handlers/static';
import { handleSyncCron } from './handlers/sync';
import { handleOcrTestDataUpload } from './handlers/ocr-test-data';
import { handlePosthogProxy } from './handlers/posthog';
import { handleUserDataExport, handleUserDataExportDownload } from './handlers/user-data-export';
import { createYogaInstance } from './graphql/yoga';
import { setupWebSocketServer } from './websocket/setup';
import { warmPopularConfigsCache } from './graphql/resolvers/social/boards';

/**
 * Start the Boardsesh Backend server
 *
 * This server uses GraphQL Yoga for HTTP GraphQL requests and graphql-ws
 * for WebSocket subscriptions. Non-GraphQL routes are handled by custom
 * request handlers.
 */
export type ServerResources = {
  wss: WebSocketServer;
  httpServer: ReturnType<typeof createServer>;
  cleanupIntervals: () => void;
  shutdownServices: () => Promise<void>;
};

export async function startServer(): Promise<ServerResources> {
  // Initialize PubSub (connects to Redis if configured)
  // This must happen before we start accepting connections
  await pubsub.initialize();

  // Initialize RoomManager with Redis for session persistence
  if (redisClientManager.isRedisConfigured() && redisClientManager.isRedisConnected()) {
    const { publisher, streamConsumer } = redisClientManager.getClients();
    await roomManager.initialize(publisher);

    // Initialize EventBroker and NotificationWorker (requires Redis)
    try {
      await eventBroker.initialize(publisher, streamConsumer);
      const notificationWorker = new NotificationWorker(eventBroker);
      notificationWorker.start();
      console.info('[Server] EventBroker and NotificationWorker started');
    } catch (error) {
      console.error('[Server] Failed to initialize EventBroker:', error);
    }
  } else {
    await roomManager.initialize(); // Postgres-only mode
    console.info('[Server] No Redis - EventBroker disabled, inline notification fallback active');
  }

  const PORT = parseInt(process.env.PORT || '8080', 10);
  const BOARDSESH_URL = process.env.BOARDSESH_URL || 'https://boardsesh.com';

  // Initialize CORS with allowed origins
  initCors(BOARDSESH_URL);

  // Create GraphQL Yoga instance
  const yoga = createYogaInstance();

  /**
   * Custom request handler that routes requests to appropriate handlers
   */
  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // Health check endpoint
      if (pathname === '/health' && req.method === 'GET') {
        await handleHealthCheck(req, res);
        return;
      }

      // Session join redirect endpoint
      if (pathname.startsWith('/join/') && req.method === 'GET') {
        const sessionId = pathname.slice('/join/'.length);
        await handleSessionJoin(req, res, sessionId, PORT, BOARDSESH_URL);
        return;
      }

      // Avatar upload endpoint (handle OPTIONS for CORS preflight)
      if (pathname === '/api/avatars' && (req.method === 'POST' || req.method === 'OPTIONS')) {
        await handleAvatarUpload(req, res);
        return;
      }

      // OCR test data upload endpoint (handle OPTIONS for CORS preflight)
      if (pathname === '/api/ocr-test-data' && (req.method === 'POST' || req.method === 'OPTIONS')) {
        await handleOcrTestDataUpload(req, res);
        return;
      }

      // PostHog analytics reverse proxy — forwards /api/posthog/* to https://us.i.posthog.com/*
      // so ad-blockers that target *.posthog.com don't drop our events.
      if (pathname.startsWith('/api/posthog/') && (req.method === 'POST' || req.method === 'OPTIONS')) {
        await handlePosthogProxy(req, res, url);
        return;
      }

      // User data export endpoints (request/status + authenticated download)
      if (
        pathname === '/api/user-data-export' &&
        (req.method === 'GET' || req.method === 'POST' || req.method === 'OPTIONS')
      ) {
        await handleUserDataExport(req, res, url);
        return;
      }

      if (pathname === '/api/user-data-export/download' && (req.method === 'GET' || req.method === 'OPTIONS')) {
        await handleUserDataExportDownload(req, res, url);
        return;
      }

      // Static avatar files
      if (pathname.startsWith('/static/avatars/')) {
        const fileName = pathname.slice('/static/avatars/'.length);
        if (fileName) {
          await handleStaticAvatar(req, res, fileName);
          return;
        }
      }

      // Static beta-link thumbnails (Instagram / TikTok), proxied from S3
      if (pathname.startsWith('/static/beta-link-thumbnails/')) {
        const remainder = pathname.slice('/static/beta-link-thumbnails/'.length);
        const slashIndex = remainder.indexOf('/');
        if (slashIndex > 0) {
          const platform = remainder.slice(0, slashIndex);
          const fileName = remainder.slice(slashIndex + 1);
          if (fileName) {
            await handleStaticBetaThumbnail(req, res, platform, fileName);
            return;
          }
        }
        res.writeHead(400);
        res.end();
        return;
      }

      // Sync cron endpoint (triggered by external cron service)
      if (pathname === '/sync-cron' && (req.method === 'POST' || req.method === 'OPTIONS')) {
        await handleSyncCron(req, res);
        return;
      }

      // GraphQL endpoint - delegate to Yoga
      if (pathname === '/graphql') {
        // Apply CORS for GraphQL requests
        if (!applyCorsHeaders(req, res)) return;

        // Yoga handles the request and writes directly to the response
        await yoga.handle(req, res);
        return;
      }

      // 404 for all other routes
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      console.error('Request handler error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  }

  // Create HTTP or HTTPS server with custom request handler.
  // DEV_HTTPS_CERT_FILE / DEV_HTTPS_KEY_FILE are injected by the dev
  // orchestrator when it provisions a Tailscale cert so phones can reach the
  // dev backend over a secure context (required for DeviceMotion, Bluetooth,
  // etc. in mobile browsers). In any other environment both are unset and
  // we fall through to plain HTTP.
  const certFile = process.env.DEV_HTTPS_CERT_FILE;
  const keyFile = process.env.DEV_HTTPS_KEY_FILE;
  const tlsEnabled = !!(certFile && keyFile);
  const httpServer = tlsEnabled
    ? createHttpsServer({ cert: readFileSync(certFile!), key: readFileSync(keyFile!) }, handleRequest)
    : createServer(handleRequest);

  // Setup WebSocket server for GraphQL subscriptions (includes ping/pong heartbeat)
  const { wss, pingInterval } = setupWebSocketServer(httpServer);

  // Track intervals for cleanup
  const intervals: NodeJS.Timeout[] = [pingInterval];

  console.info(`Boardsesh Backend starting on port ${PORT}...`);

  // Start HTTP server (WebSocket server is attached to it)
  const httpScheme = tlsEnabled ? 'https' : 'http';
  const wsScheme = tlsEnabled ? 'wss' : 'ws';
  httpServer.listen(PORT, () => {
    console.info(`Boardsesh Backend is running on port ${PORT}${tlsEnabled ? ' (TLS)' : ''}`);
    console.info(`  GraphQL HTTP: ${httpScheme}://0.0.0.0:${PORT}/graphql`);
    console.info(`  GraphQL WS: ${wsScheme}://0.0.0.0:${PORT}/graphql`);
    console.info(`  Health check: ${httpScheme}://0.0.0.0:${PORT}/health`);
    console.info(`  Join session: ${httpScheme}://0.0.0.0:${PORT}/join/:sessionId`);
    console.info(`  Avatar upload: ${httpScheme}://0.0.0.0:${PORT}/api/avatars`);
    console.info(`  Avatar files: ${httpScheme}://0.0.0.0:${PORT}/static/avatars/`);
    console.info(`  OCR test data: ${httpScheme}://0.0.0.0:${PORT}/api/ocr-test-data`);
    console.info(`  PostHog proxy: ${httpScheme}://0.0.0.0:${PORT}/api/posthog/*`);
    console.info(`  User data export: ${httpScheme}://0.0.0.0:${PORT}/api/user-data-export`);
    console.info(`  Sync cron: ${httpScheme}://0.0.0.0:${PORT}/sync-cron`);

    // Warm up popular board configs cache in the background.
    // Uses a Redis lock so only one node across the cluster runs the query.
    warmPopularConfigsCache().catch((err) => {
      console.error('[Server] Popular configs cache warm-up failed:', err);
    });
  });

  httpServer.on('error', (error) => {
    console.error('HTTP server error:', error);
  });

  /**
   * Clean up intervals and timers on shutdown
   */
  function cleanupIntervals(): void {
    console.info(`[Server] Cleaning up ${intervals.length} intervals`);
    intervals.forEach((interval) => clearInterval(interval));
    intervals.length = 0;
  }

  /**
   * Shutdown services (EventBroker + RoomManager).
   * Called by the centralized shutdown handler in index.ts.
   */
  async function shutdownServices(): Promise<void> {
    eventBroker.shutdown();

    try {
      await roomManager.shutdown();
      console.info('[Server] RoomManager shutdown complete');
    } catch (error) {
      console.error('[Server] Error during RoomManager shutdown:', error);
    }
  }

  // Periodic flush as backup (every 60 seconds)
  const flushInterval = setInterval(async () => {
    try {
      await roomManager.flushPendingWrites();
    } catch (error) {
      console.error('[Server] Error in periodic flush:', error);
    }
  }, 60000);
  intervals.push(flushInterval);

  // Periodic TTL refresh for active sessions (every 2 minutes)
  const ttlRefreshInterval = setInterval(async () => {
    try {
      if (redisClientManager.isRedisConnected()) {
        await roomManager.refreshActiveSessionTTLs();
      }
    } catch (error) {
      console.error('[Server] Error in periodic TTL refresh:', error);
    }
  }, 120000); // 2 minutes
  intervals.push(ttlRefreshInterval);

  return { wss, httpServer, cleanupIntervals, shutdownServices };
}
