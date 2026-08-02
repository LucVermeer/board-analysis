const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'postgres-test']);

export type LocationSyncIntegrationConfig =
  | {
      databaseUrl: string;
      required: boolean;
      skipReason: null;
    }
  | {
      databaseUrl: null;
      required: false;
      skipReason: string;
    };

function unavailable(required: boolean, reason: string): LocationSyncIntegrationConfig {
  if (required) {
    throw new Error(`location-sync integration is required, but ${reason}`);
  }

  return { databaseUrl: null, required: false, skipReason: reason };
}

/**
 * Resolve the database used by the real location-sync tests without ever
 * allowing the suite to touch a remote database. Local developer runs remain
 * opt-in; the dedicated CI job arms fail-closed behavior with the exact value
 * `REQUIRE_LOCATION_SYNC_INTEGRATION=1`.
 */
export function resolveLocationSyncIntegrationConfig(
  environment: Readonly<Record<string, string | undefined>>,
): LocationSyncIntegrationConfig {
  const required = environment.REQUIRE_LOCATION_SYNC_INTEGRATION === '1';
  const databaseUrl = environment.DATABASE_URL;

  if (!databaseUrl) {
    return unavailable(required, 'DATABASE_URL is not set');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    return unavailable(required, 'DATABASE_URL is malformed');
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    return unavailable(required, 'DATABASE_URL is not a valid PostgreSQL URL');
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    return unavailable(required, `DATABASE_URL targets non-local host ${hostname}`);
  }

  return { databaseUrl, required, skipReason: null };
}
