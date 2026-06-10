import { and, eq } from 'drizzle-orm';
import type { ConnectionContext, IntegrationStatus, IntegrationExportResult } from '@boardsesh/shared-schema';
import { db } from '../../../db/client';
import * as dbSchema from '@boardsesh/db/schema';
import { applyRateLimit, requireAuthenticated, validateInput } from '../shared/helpers';
import {
  DisconnectIntegrationSchema,
  IntegrationProviderArgsSchema,
  SetIntegrationAutoSyncSchema,
  SyncSessionToIntegrationSchema,
} from '../../../validation/schemas';
import { providerEnumToDb, providerDbToEnum, type ProviderName } from '../../../integrations/registry';
import { disconnect, setAutoSync, type IntegrationCredentialRow } from '../../../integrations/credentials';
import { signIntegrationHandoff } from '../../../integrations/state';
import { syncPartySessionForUser } from '../../../integrations/export-service';
import { generateSessionSummary } from '../sessions/session-summary';

function credentialRowToStatus(provider: ProviderName, row: IntegrationCredentialRow): IntegrationStatus {
  return {
    provider: providerDbToEnum(provider),
    connected: true,
    externalAccountName: row.externalAccountName,
    autoSyncEnabled: row.autoSyncEnabled,
    status: row.status as IntegrationStatus['status'],
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastError: row.lastError,
  };
}

export const integrationMutations = {
  /**
   * Mint the short-lived, single-use handoff code that authenticates the
   * browser navigation to GET /integrations/:provider/start. The session JWT
   * stays in this authenticated GraphQL call's headers; only the 60-second
   * purpose-bound code ever appears in a URL.
   */
  createIntegrationOAuthHandoff: async (
    _: unknown,
    args: { provider: IntegrationStatus['provider'] },
    ctx: ConnectionContext,
  ): Promise<string> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 10, 'createIntegrationOAuthHandoff');
    const { provider } = validateInput(IntegrationProviderArgsSchema, args, 'args');
    return signIntegrationHandoff({ userId: ctx.userId!, provider: providerEnumToDb(provider) });
  },

  /** Revoke + delete the user's credential for a provider. */
  disconnectIntegration: async (
    _: unknown,
    args: { provider: IntegrationStatus['provider'] },
    ctx: ConnectionContext,
  ): Promise<boolean> => {
    requireAuthenticated(ctx);
    const { provider } = validateInput(DisconnectIntegrationSchema, args, 'args');
    const userId = ctx.userId!;
    await disconnect(userId, providerEnumToDb(provider));
    return true;
  },

  /** Toggle automatic upload of finished sessions for a connected provider. */
  setIntegrationAutoSync: async (
    _: unknown,
    args: { provider: IntegrationStatus['provider']; enabled: boolean },
    ctx: ConnectionContext,
  ): Promise<IntegrationStatus> => {
    requireAuthenticated(ctx);
    const { provider, enabled } = validateInput(SetIntegrationAutoSyncSchema, args, 'args');
    const userId = ctx.userId!;
    const providerName = providerEnumToDb(provider);

    const updated = await setAutoSync(userId, providerName, enabled);
    if (!updated) {
      throw new Error('Integration not connected');
    }
    return credentialRowToStatus(providerName, updated);
  },

  /**
   * Manually export a party session to a provider. Upload failures return a
   * result with the `error` field set (rather than throwing) so the mobile
   * client can surface a toast and offer a retry.
   */
  syncSessionToIntegration: async (
    _: unknown,
    args: { provider: IntegrationStatus['provider']; sessionId: string },
    ctx: ConnectionContext,
  ): Promise<IntegrationExportResult> => {
    requireAuthenticated(ctx);
    await applyRateLimit(ctx, 10, 'syncSessionToIntegration');
    const { provider, sessionId } = validateInput(SyncSessionToIntegrationSchema, args, 'args');
    const userId = ctx.userId!;
    const providerName = providerEnumToDb(provider);

    const [session] = await db
      .select({
        createdByUserId: dbSchema.boardSessions.createdByUserId,
        boardPath: dbSchema.boardSessions.boardPath,
        startedAt: dbSchema.boardSessions.startedAt,
        endedAt: dbSchema.boardSessions.endedAt,
      })
      .from(dbSchema.boardSessions)
      .where(eq(dbSchema.boardSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error('Session not found');
    }
    if (!session.endedAt) {
      throw new Error('Session has not ended');
    }

    // Authorize: the caller must be the session creator or have logged at least
    // one tick in it. Mirrors the creator-or-has-ticks check in
    // setInferredSessionHealthKitWorkoutId, adapted to party ticks.
    if (session.createdByUserId !== userId) {
      const [participantTick] = await db
        .select({ uuid: dbSchema.boardseshTicks.uuid })
        .from(dbSchema.boardseshTicks)
        .where(and(eq(dbSchema.boardseshTicks.sessionId, sessionId), eq(dbSchema.boardseshTicks.userId, userId)))
        .limit(1);
      if (!participantTick) {
        throw new Error('Not a participant of this session');
      }
    }

    if (!session.startedAt) {
      throw new Error('Session has no start time');
    }

    const summary = await generateSessionSummary(sessionId);
    if (!summary) {
      throw new Error('Session has no recorded activity');
    }

    try {
      return await syncPartySessionForUser(providerName, userId, sessionId, summary, session.boardPath, {
        allowErrorStatus: true,
      });
    } catch (error) {
      // Upload-time failures are surfaced through the result rather than thrown
      // so the mobile client can toast them. The error export row is already
      // recorded inside syncPartySessionForUser.
      return {
        provider: providerDbToEnum(providerName),
        sessionId,
        externalActivityId: null,
        externalActivityUrl: null,
        syncedAt: null,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  },
};
