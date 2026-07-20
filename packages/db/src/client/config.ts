export type ConnectionConfig = {
  connectionString: string;
  readReplicaUrl: string | null;
  isLocal: boolean;
  isTest: boolean;
};

export function isLocalDevelopment(): boolean {
  return process.env.VERCEL_ENV === 'development' || process.env.NODE_ENV === 'development';
}

export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/**
 * The backend's resolved Sentry `environment`. SENTRY_ENVIRONMENT (Sentry's
 * standard var) wins when set; otherwise 'production' in a prod-like runtime
 * (Railway leaves NODE_ENV unset — see issue #3603) and NODE_ENV / 'development'
 * in local dev or under the test runner.
 *
 * Single source of truth for both the `Sentry.init({ enabled, environment })`
 * gate in the backend's instrument.ts and the SentryWinstonTransport gate, so
 * the two can't drift.
 */
export function resolveSentryEnvironment(): string {
  const explicit = process.env.SENTRY_ENVIRONMENT;
  if (explicit) return explicit;
  const isProductionLike = !isLocalDevelopment() && !isTestEnvironment();
  return isProductionLike ? 'production' : (process.env.NODE_ENV ?? 'development');
}

/**
 * Whether the backend should report to the *production* Sentry project. Only a
 * resolved environment of 'production' sends. Preview / staging deploys run with
 * NODE_ENV=production too (branch-deploy.yml) and are otherwise indistinguishable
 * from real prod, so they declare SENTRY_ENVIRONMENT=preview and stay out. Railway
 * prod leaves both NODE_ENV and SENTRY_ENVIRONMENT unset, so it resolves to
 * 'production' and remains enabled (no ops change, keeps the #3603 fix intact).
 */
export function isProductionSentryEnvironment(): boolean {
  return resolveSentryEnvironment() === 'production';
}

export function getConnectionConfig(): ConnectionConfig {
  const connectionString = process.env.DATABASE_URL;
  const readReplicaUrl = process.env.READ_REPLICA_URL || null;
  const isLocal = isLocalDevelopment();
  const isTest = isTestEnvironment();

  if (!connectionString && isLocal && !isTest) {
    return {
      connectionString: 'postgres://postgres:password@localhost:5432/main',
      readReplicaUrl,
      isLocal,
      isTest,
    };
  }

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return { connectionString, readReplicaUrl, isLocal, isTest };
}
