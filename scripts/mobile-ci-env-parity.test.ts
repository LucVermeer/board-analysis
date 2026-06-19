/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the env the three mobile workflows share, for two reasons:
//
//   1. Fingerprint parity. runtimeVersion uses the `fingerprint` policy
//      (packages/mobile/app.config.ts), so an OTA only reaches a binary whose
//      fingerprint matches. The fingerprint hashes the *resolved Expo config*
//      (NOT the JS bundle), so only the config-affecting vars below move it:
//      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (→ google-signin iosUrlScheme),
//      GOOGLE_MAPS_API_KEY (handled per-platform, see the dedicated test), and —
//      once the committed cert activates the self-hosted updates block —
//      EXPO_UPDATES_URL + EXPO_UPDATES_CHANNEL. If any of these drift between the
//      OTA publish (mobile-ota-production.yml) and the native builds
//      (ios-testflight-rn.yml / android-apk-rn.yml), the published fingerprint
//      won't match the shipped binary and the OTA silently never lands.
//   2. Bundle correctness. The remaining EXPO_PUBLIC_* are inlined into the JS
//      bundle (not the fingerprint); drift there ships an OTA pointing at the
//      wrong backend/analytics — a runtime bug, not a delivery failure.
//
// Either failure is silent in CI, so this test fails the build when the env
// blocks drift.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIR = resolve(REPO_ROOT, '.github/workflows');

const NATIVE_IOS = 'ios-testflight-rn.yml';
const NATIVE_ANDROID = 'android-apk-rn.yml';
const OTA = 'mobile-ota-production.yml';

// Job-level env keys that feed the resolved config (fingerprint) and/or the
// inlined JS bundle (runtime correctness). Every one must be declared identically
// in all three workflows. GOOGLE_MAPS_API_KEY is handled separately (it's
// step-scoped and Android-only — see the dedicated test below).
const SHARED_ENV_KEYS = [
  'EXPO_PUBLIC_BACKEND_URL',
  'EXPO_PUBLIC_WS_URL',
  'EXPO_PUBLIC_WEB_URL',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_POSTHOG_KEY',
  'EXPO_UPDATES_CHANNEL',
  'EXPO_UPDATES_URL',
] as const;

function readWorkflow(name: string): string {
  return readFileSync(resolve(WORKFLOW_DIR, name), 'utf8');
}

/** Extract a job-level `env:` value (6-space indent) by key, or null if absent. */
function jobEnvValue(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^ {6}${key}:[ \\t]*(.+?)\\s*$`, 'm'));
  return match ? match[1] : null;
}

describe('mobile CI env parity (OTA fingerprint invariant)', () => {
  const workflows = [NATIVE_IOS, NATIVE_ANDROID, OTA];

  it.each(SHARED_ENV_KEYS)('declares %s identically across all three workflows', (key) => {
    const values = workflows.map((name) => ({ name, value: jobEnvValue(readWorkflow(name), key) }));

    for (const { name, value } of values) {
      expect(value, `${key} missing from ${name} job env`).not.toBeNull();
    }

    const distinct = new Set(values.map((entry) => entry.value));
    expect(
      distinct.size,
      `${key} drifted across the mobile workflows: ${JSON.stringify(values)}. For a ` +
        `config-affecting var this desyncs the fingerprint runtimeVersion (the OTA never reaches ` +
        `the binary); for a bundle-only var it ships an OTA pointing at the wrong backend/analytics. ` +
        `Keep all three workflows in lockstep.`,
    ).toBe(1);
  });

  it('publishes the Android OTA with the same GOOGLE_MAPS_API_KEY the Android build bakes in', () => {
    // GOOGLE_MAPS_API_KEY is set only on the Android prebuild (iOS uses Apple
    // Maps) and changes the resolved android.config block — hence the fingerprint.
    // The OTA workflow must set the same value on its Android publish step, and
    // must NOT set it on the iOS publish, or one platform's OTA can never match.
    const androidBuild = readWorkflow(NATIVE_ANDROID);
    const ota = readWorkflow(OTA);
    const keyExpr = /GOOGLE_MAPS_API_KEY:\s*\$\{\{\s*secrets\.GOOGLE_MAPS_API_KEY\s*\}\}/;

    expect(androidBuild).toMatch(keyExpr);
    expect(ota, 'OTA workflow must set GOOGLE_MAPS_API_KEY for the Android publish').toMatch(keyExpr);
    // Exactly one occurrence in the OTA workflow → it scopes to the Android step,
    // not the iOS publish (which must run without it).
    expect(ota.match(/GOOGLE_MAPS_API_KEY:/g)?.length ?? 0).toBe(1);
  });

  it('keeps the OTA publish on the self-hosted server (production channel)', () => {
    const ota = readWorkflow(OTA);
    expect(jobEnvValue(ota, 'EXPO_UPDATES_CHANNEL')).toBe('production');
    expect(ota).toMatch(/--channel production --platform ios/);
    expect(ota).toMatch(/--channel production --platform android/);
  });
});
