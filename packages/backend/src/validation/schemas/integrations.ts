import { z } from 'zod';
import { SessionIdSchema } from './primitives';

/** GraphQL IntegrationProvider enum values. */
export const IntegrationProviderSchema = z.enum(['STRAVA']);

export const DisconnectIntegrationSchema = z.object({
  provider: IntegrationProviderSchema,
});

export const SetIntegrationAutoSyncSchema = z.object({
  provider: IntegrationProviderSchema,
  enabled: z.boolean(),
});

export const SyncSessionToIntegrationSchema = z.object({
  provider: IntegrationProviderSchema,
  sessionId: SessionIdSchema,
});
