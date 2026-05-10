// Sentry initialization. MUST be imported before anything else in the backend
// entry point so OpenTelemetry can patch HTTP/Postgres/Redis/etc. modules
// before they're loaded. See https://docs.sentry.io/platforms/javascript/guides/node/install/
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const inheritedEnvKeys = new Set(Object.keys(process.env));
const dotenvConfigPath = process.env.DOTENV_CONFIG_PATH;
if (dotenvConfigPath) {
  dotenv.config({ path: dotenvConfigPath });
} else {
  dotenv.config();
}

function applyGeneratedDevDbEnv(): void {
  const sourceFile = fileURLToPath(import.meta.url);
  const generatedEnvFile = resolve(dirname(sourceFile), '../../..', '.boardsesh', 'dev-db.env');
  if (!existsSync(generatedEnvFile)) return;

  const lines = readFileSync(generatedEnvFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmedLine.slice(0, separatorIndex);
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    if (inheritedEnvKeys.has(key)) continue;

    process.env[key] = trimmedLine.slice(separatorIndex + 1);
  }
}

applyGeneratedDevDbEnv();
dotenv.config({ path: '.env.development.local', override: true });

import * as Sentry from '@sentry/node';

const isProduction = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: 'https://f55e6626faf787ae5291ad75b010ea14@o4510644927660032.ingest.us.sentry.io/4510644930150400',
  enabled: isProduction,
  enableLogs: true,
  // Matches the web service. Backend tags events with userId / clientIp from
  // ConnectionContext for incident triage; the data is already in our own
  // logs and is not exfiltrated beyond Sentry.
  sendDefaultPii: true,
  // Read SENTRY_ENVIRONMENT (Sentry's standard env var) with NODE_ENV as
  // fallback. Deliberately platform-neutral — no RAILWAY_*-style branching.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  serverName: 'boardsesh-backend',
});

// Sentry's default integrations install onUncaughtExceptionIntegration and
// onUnhandledRejectionIntegration, which capture *and* preserve Node's
// "exit on unhandled" behavior. Don't add manual process.on() handlers here:
// they'd shadow Sentry's, and a bare captureException without exit leaves
// the process in an undefined state (per Node docs).
