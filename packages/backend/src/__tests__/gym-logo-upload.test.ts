import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { sql } from 'drizzle-orm';
import type { ConnectionContext } from '@boardsesh/shared-schema';

const validateTokenMock = vi.hoisted(() => vi.fn());

vi.mock('../middleware/auth', () => ({
  validateToken: validateTokenMock,
}));

const { db } = await import('../db/client');
const { handleGymLogoUpload, getGymLogosDir } = await import('../handlers/gym-logos');
const { handleStaticGymLogo } = await import('../handlers/static');
const { parseSizeParam } = await import('../lib/image-resize');
const { socialGymQueries, socialGymMutations } = await import('../graphql/resolvers/social/gyms');

/**
 * Real-DB + real-HTTP coverage for POST /api/gym-logos. Mirrors
 * avatar-upload.test.ts (a live loopback server + fetch/FormData) but seeds
 * gyms/members so the handler's userCanEditGym authorization runs for real. Only
 * `validateToken` is mocked (to stamp the caller's user id without a real JWT).
 */

const OWNER = 'gl-owner';
const ADMIN_MEMBER = 'gl-admin';
const EDITOR_MEMBER = 'gl-editor';
const RANDOM = 'gl-random';
const ALL_USERS = [OWNER, ADMIN_MEMBER, EDITOR_MEMBER, RANDOM];

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9]);

let gymUuid: string;

const authCtx = (userId: string): ConnectionContext =>
  ({ connectionId: `conn-${userId}`, isAuthenticated: true, userId }) as ConnectionContext;

const insertUser = (id: string) =>
  db.execute(sql`
    INSERT INTO "users" (id, email, name, created_at, updated_at)
    VALUES (${id}, ${id + '@test.com'}, ${'User ' + id}, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

async function startLogoServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (url.pathname === '/api/gym-logos' && req.method === 'POST') {
        await handleGymLogoUpload(req, res);
        return;
      }
      if (url.pathname.startsWith('/static/gym-logos/') && req.method === 'GET') {
        const fileName = url.pathname.slice('/static/gym-logos/'.length);
        await handleStaticGymLogo(req, res, fileName, parseSizeParam(url.searchParams.get('size')));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    })().catch((error: unknown) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function removeUploadedLogos(): Promise<void> {
  const dir = getGymLogosDir();
  await Promise.all(
    ['jpg', 'png', 'gif', 'webp'].map((ext) => rm(path.join(dir, `${gymUuid}.${ext}`), { force: true })),
  );
}

async function uploadLogo(
  baseUrl: string,
  opts: { token?: string; gymUuid?: string; blob?: Blob; fileName?: string; omitFile?: boolean },
): Promise<Response> {
  const formData = new FormData();
  if (opts.gymUuid !== undefined) formData.set('gymUuid', opts.gymUuid);
  if (!opts.omitFile) {
    formData.set('logo', opts.blob ?? new Blob([JPEG_BYTES], { type: 'image/jpeg' }), opts.fileName ?? 'logo.jpg');
  }
  return fetch(`${baseUrl}/api/gym-logos`, {
    method: 'POST',
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
    body: formData,
  });
}

beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE "gym_members", "user_boards", "gyms" RESTART IDENTITY CASCADE
  `);
  vi.clearAllMocks();

  await Promise.all(ALL_USERS.map(insertUser));

  gymUuid = uuidv4();
  const result = await db.execute(sql`
    INSERT INTO gyms (uuid, name, slug, owner_id, is_public, created_at, updated_at)
    VALUES (${gymUuid}, ${'Logo Gym'}, ${gymUuid}, ${OWNER}, true, now(), now())
    RETURNING id
  `);
  const gymId = Number(Array.from(result as Iterable<{ id: number }>)[0].id);
  await db.execute(sql`
    INSERT INTO gym_members (gym_id, user_id, role, created_at)
    VALUES (${gymId}, ${ADMIN_MEMBER}, 'admin', now()), (${gymId}, ${EDITOR_MEMBER}, 'editor', now())
  `);
});

afterEach(async () => {
  vi.clearAllMocks();
  await removeUploadedLogos();
});

describe('POST /api/gym-logos', () => {
  it('requires an Authorization header', async () => {
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { gymUuid });
      expect(response.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects an invalid/expired token', async () => {
    validateTokenMock.mockResolvedValue(null);
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'bad', gymUuid });
      expect(response.status).toBe(401);
    } finally {
      await closeServer(server);
    }
  });

  it('lets the gym owner upload a logo, serves it, and it persists via updateGym', async () => {
    validateTokenMock.mockResolvedValue({ userId: OWNER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'owner', gymUuid });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { success?: boolean; logoUrl?: string };
      expect(body.success).toBe(true);
      expect(body.logoUrl).toMatch(new RegExp(`^/static/gym-logos/${gymUuid}\\.jpg\\?v=[0-9a-f-]{36}$`));

      // The static route serves the uploaded bytes back.
      const staticResponse = await fetch(`${baseUrl}${body.logoUrl}`);
      expect(staticResponse.status).toBe(200);
      expect(Buffer.from(await staticResponse.arrayBuffer())).toEqual(JPEG_BYTES);

      // And the returned static path passes updateGym's logo validation + persists.
      await socialGymMutations.updateGym(null, { input: { gymUuid, logoUrl: body.logoUrl! } }, authCtx(OWNER));
      const gym = await socialGymQueries.gym(null, { gymUuid }, authCtx(OWNER));
      expect(gym!.logoUrl).toBe(body.logoUrl);
    } finally {
      await closeServer(server);
    }
  });

  it('allows a gym admin member', async () => {
    validateTokenMock.mockResolvedValue({ userId: ADMIN_MEMBER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'admin', gymUuid });
      expect(response.status).toBe(200);
    } finally {
      await closeServer(server);
    }
  });

  it('allows a gym editor member', async () => {
    validateTokenMock.mockResolvedValue({ userId: EDITOR_MEMBER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'editor', gymUuid });
      expect(response.status).toBe(200);
    } finally {
      await closeServer(server);
    }
  });

  it('forbids a user with no edit access (403)', async () => {
    validateTokenMock.mockResolvedValue({ userId: RANDOM });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'random', gymUuid });
      expect(response.status).toBe(403);
    } finally {
      await closeServer(server);
    }
  });

  it('404s for an unknown gym', async () => {
    validateTokenMock.mockResolvedValue({ userId: OWNER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'owner', gymUuid: uuidv4() });
      expect(response.status).toBe(404);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects a non-image (SVG) mime type', async () => {
    validateTokenMock.mockResolvedValue({ userId: OWNER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, {
        token: 'owner',
        gymUuid,
        blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }),
        fileName: 'logo.svg',
      });
      expect(response.status).toBe(400);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects a file over 2MB', async () => {
    validateTokenMock.mockResolvedValue({ userId: OWNER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const oversized = new Blob([Buffer.alloc(2 * 1024 * 1024 + 1, 0)], { type: 'image/png' });
      const response = await uploadLogo(baseUrl, { token: 'owner', gymUuid, blob: oversized, fileName: 'big.png' });
      expect(response.status).toBe(400);
    } finally {
      await closeServer(server);
    }
  });

  it('requires a gymUuid field', async () => {
    validateTokenMock.mockResolvedValue({ userId: OWNER });
    const { baseUrl, server } = await startLogoServer();
    try {
      const response = await uploadLogo(baseUrl, { token: 'owner' });
      expect(response.status).toBe(400);
    } finally {
      await closeServer(server);
    }
  });
});
