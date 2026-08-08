import { and, desc, eq } from 'drizzle-orm';
import type { ConnectionContext, PrivateAttemptVideo } from '@boardsesh/shared-schema';
import * as dbSchema from '@boardsesh/db/schema';
import { db } from '../../../db/client';
import { requireAuthenticated } from '../shared/helpers';
import { MOONBOARD_2024_ANGLES, MOONBOARD_2024_LAYOUT_ID } from '../../../services/private-attempt-videos';

export const privateAttemptVideoQueries = {
  privateAttemptVideos: async (
    _: unknown,
    { climbUuid, layoutId, angle }: { climbUuid: string; layoutId: number; angle: number },
    ctx: ConnectionContext,
  ): Promise<PrivateAttemptVideo[]> => {
    requireAuthenticated(ctx);
    if (layoutId !== MOONBOARD_2024_LAYOUT_ID || !MOONBOARD_2024_ANGLES.has(angle)) return [];

    const rows = await db
      .select()
      .from(dbSchema.privateAttemptVideos)
      .where(
        and(
          eq(dbSchema.privateAttemptVideos.ownerUserId, ctx.userId!),
          eq(dbSchema.privateAttemptVideos.boardType, 'moonboard'),
          eq(dbSchema.privateAttemptVideos.layoutId, MOONBOARD_2024_LAYOUT_ID),
          eq(dbSchema.privateAttemptVideos.climbUuid, climbUuid),
          eq(dbSchema.privateAttemptVideos.angle, angle),
          eq(dbSchema.privateAttemptVideos.status, 'ready'),
        ),
      )
      .orderBy(desc(dbSchema.privateAttemptVideos.recordedAt));

    return rows.flatMap((row) => {
      if (!row.tickUuid || row.durationMs == null) return [];
      return [
        {
          uuid: row.uuid,
          tickUuid: row.tickUuid,
          boardType: row.boardType,
          climbProvider: row.climbProvider,
          climbUuid: row.climbUuid,
          layoutId: row.layoutId,
          angle: row.angle,
          isMirror: row.isMirror,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          durationMs: row.durationMs,
          recordedAt: row.recordedAt,
          createdAt: row.createdAt,
          playbackPath: `/api/internal/attempt-videos/${row.uuid}/stream`,
        },
      ];
    });
  },
};
