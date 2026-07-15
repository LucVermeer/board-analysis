import type { IncomingMessage, ServerResponse } from 'http';
import Busboy from 'busboy';
import path from 'path';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, access } from 'fs/promises';
import { eq, and, isNull } from 'drizzle-orm';
import { applyCorsHeaders } from './cors';
import { validateToken } from '../middleware/auth';
import { isS3Configured, uploadToS3, deleteGymLogosFromS3 } from '../storage/s3';
import { logger } from '../utils/logger';
import { buildStaticGymLogoUrl } from '../lib/gym-logo-url';
import { db } from '../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { userCanEditGym } from '../graphql/resolvers/social/gyms';

// Gym logo upload configuration. Deliberately mirrors avatars.ts: 2MB cap, the
// same raster mime allowlist (NO svg — an inline <svg> logo would execute
// script when rendered on the kiosk/embed surfaces), S3 or local-dev storage.
const GYM_LOGOS_DIR = './gym-logos';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// UUID validation regex for path traversal prevention (the uuid becomes the S3
// key / local filename).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateGymUuid(gymUuid: string): boolean {
  return UUID_REGEX.test(gymUuid);
}

// Track if directory has been initialized
let gymLogosDirInitialized = false;

/**
 * Ensure gym-logos directory exists (called on first local-dev upload).
 */
async function ensureGymLogosDir(): Promise<void> {
  if (gymLogosDirInitialized) return;

  try {
    await mkdir(GYM_LOGOS_DIR, { recursive: true });
    gymLogosDirInitialized = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      gymLogosDirInitialized = true;
    } else {
      throw error;
    }
  }
}

/**
 * Extract auth token from Authorization header (Bearer <token>).
 */
function extractAuthTokenFromHeader(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Delete existing local logo files for a gym (all extensions).
 */
async function deleteExistingLocalLogos(gymUuid: string): Promise<void> {
  const extensions = ['jpg', 'png', 'gif', 'webp'];
  for (const ext of extensions) {
    const filePath = path.join(GYM_LOGOS_DIR, `${gymUuid}.${ext}`);
    try {
      await access(filePath);
      await unlink(filePath);
    } catch {
      // File doesn't exist, ignore
    }
  }
}

/**
 * Gym logo upload handler
 * POST /api/gym-logos
 *
 * Expects multipart form data with:
 * - logo: the image file
 * - gymUuid: the gym UUID (UUID format)
 *
 * Requires authentication via Authorization header (Bearer token). The caller
 * must have edit access to the gym (owner, gym admin/editor, or a covering
 * community admin/leader), enforced by userCanEditGym.
 */
export async function handleGymLogoUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!applyCorsHeaders(req, res)) return;

  // Validate authentication
  const token = extractAuthTokenFromHeader(req);
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return;
  }

  const authResult = await validateToken(token);
  if (!authResult) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired token' }));
    return;
  }

  const authenticatedUserId = authResult.userId;

  // Check S3 configuration
  const useS3 = isS3Configured();
  const isProduction = process.env.NODE_ENV === 'production';

  // In production, S3 must be configured for logo uploads
  if (isProduction && !useS3) {
    logger.error('Gym logo upload attempted in production without S3 configured');
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Gym logo uploads are not configured. Please contact the administrator.',
      }),
    );
    return;
  }

  // Ensure local-dev directory exists (only needed without S3)
  if (!useS3) {
    try {
      await ensureGymLogosDir();
    } catch (error) {
      logger.error('Failed to create gym-logos directory:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error' }));
      return;
    }
  }

  return new Promise<void>((resolve) => {
    let busboy: ReturnType<typeof Busboy>;

    try {
      busboy = Busboy({
        headers: req.headers as { 'content-type': string },
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      });
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request format' }));
      resolve();
      return;
    }

    let gymUuid: string | undefined;
    let fileBuffer: Buffer | undefined;
    let mimeType: string | undefined;
    let fileTruncated = false;
    let invalidMimeType = false;

    busboy.on('field', (name: string, value: string) => {
      if (name === 'gymUuid') gymUuid = value;
    });

    busboy.on('file', (name: string, stream: NodeJS.ReadableStream, info: { mimeType: string }) => {
      if (name !== 'logo') {
        stream.resume();
        return;
      }

      mimeType = info.mimeType;
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        invalidMimeType = true;
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
      stream.on('limit', () => {
        fileTruncated = true;
      });
    });

    busboy.on('finish', async () => {
      // Validate file size
      if (fileTruncated) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File size must be less than 2MB' }));
        resolve();
        return;
      }

      // Validate MIME type
      if (invalidMimeType) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only JPG, PNG, GIF, and WebP images are allowed' }));
        resolve();
        return;
      }

      // Validate gymUuid
      if (!gymUuid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'gymUuid is required' }));
        resolve();
        return;
      }

      if (!validateGymUuid(gymUuid)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid gymUuid format' }));
        resolve();
        return;
      }

      // Validate file was uploaded
      if (!fileBuffer || !mimeType) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No file uploaded' }));
        resolve();
        return;
      }

      // Load the gym (not deleted) and authorize: the caller must be able to edit
      // it. A missing gym is a 404; an unauthorized caller is a 403. The whole
      // block is try/caught: an unhandled rejection inside this detached async
      // listener would otherwise escape to the process level (killing the server
      // under Node's default policy) AND leave the wrapping Promise unsettled, so
      // the request would hang forever.
      try {
        const [gym] = await db
          .select()
          .from(dbSchema.gyms)
          .where(and(eq(dbSchema.gyms.uuid, gymUuid), isNull(dbSchema.gyms.deletedAt)))
          .limit(1);

        if (!gym) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Gym not found' }));
          resolve();
          return;
        }

        const canEdit = await userCanEditGym(gym, authenticatedUserId);
        if (!canEdit) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'You do not have permission to edit this gym' }));
          resolve();
          return;
        }
      } catch (authzErr) {
        logger.error('Failed to authorize gym logo upload:', authzErr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to authorize gym logo upload' }));
        resolve();
        return;
      }

      // Determine file extension
      const ext = MIME_TO_EXT[mimeType] || 'jpg';
      const logoFileName = `${gymUuid}.${ext}`;
      let logoUrl: string;

      try {
        if (useS3) {
          // Remove any prior logo (other extensions) so a re-upload can't leave
          // a stale file at a different key.
          await deleteGymLogosFromS3(gymUuid);

          const s3Key = `gym-logos/${logoFileName}`;
          await uploadToS3(fileBuffer, s3Key, mimeType);
          // Backend-relative URL — we proxy the bytes from S3 ourselves, so no
          // public-read ACL is required.
          logoUrl = buildStaticGymLogoUrl(logoFileName, randomUUID());
        } else {
          await deleteExistingLocalLogos(gymUuid);

          const filePath = path.join(GYM_LOGOS_DIR, logoFileName);
          await writeFile(filePath, fileBuffer);
          logoUrl = buildStaticGymLogoUrl(logoFileName, randomUUID());
        }
      } catch (saveErr) {
        logger.error('Failed to save gym logo:', saveErr);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save gym logo' }));
        resolve();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, logoUrl }));
      resolve();
    });

    busboy.on('error', (err: Error) => {
      logger.error('Busboy error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      resolve();
    });

    req.pipe(busboy);
  });
}

/**
 * Get the gym-logos directory path (for static file serving).
 */
export function getGymLogosDir(): string {
  return GYM_LOGOS_DIR;
}
