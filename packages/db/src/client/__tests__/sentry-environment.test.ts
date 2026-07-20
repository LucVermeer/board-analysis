import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isProductionSentryEnvironment, resolveSentryEnvironment } from '../config';

// These helpers read process.env at call time, so each case sets exactly the vars
// it cares about and the afterEach hook restores the runner's original values.
// Cast away the repo's readonly NODE_ENV augmentation so the test can mutate it.
const env = process.env as Record<string, string | undefined>;
const TOUCHED = ['SENTRY_ENVIRONMENT', 'NODE_ENV', 'VERCEL_ENV', 'VITEST'] as const;
const original = new Map<string, string | undefined>(TOUCHED.map((key) => [key, env[key]]));

function setEnv(overrides: Partial<Record<(typeof TOUCHED)[number], string | undefined>>): void {
  for (const key of TOUCHED) {
    const value = key in overrides ? overrides[key] : undefined;
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

void describe('resolveSentryEnvironment', () => {
  afterEach(() => {
    for (const key of TOUCHED) {
      const value = original.get(key);
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  void it('prefers an explicit SENTRY_ENVIRONMENT', () => {
    setEnv({ SENTRY_ENVIRONMENT: 'preview', NODE_ENV: 'production' });
    assert.equal(resolveSentryEnvironment(), 'preview');
    assert.equal(isProductionSentryEnvironment(), false);
  });

  void it("resolves to 'production' when nothing is set (mirrors Railway prod)", () => {
    setEnv({});
    assert.equal(resolveSentryEnvironment(), 'production');
    assert.equal(isProductionSentryEnvironment(), true);
  });

  void it("treats an explicit SENTRY_ENVIRONMENT='production' as production", () => {
    setEnv({ SENTRY_ENVIRONMENT: 'production' });
    assert.equal(isProductionSentryEnvironment(), true);
  });

  void it('is not production in local development', () => {
    setEnv({ NODE_ENV: 'development' });
    assert.equal(resolveSentryEnvironment(), 'development');
    assert.equal(isProductionSentryEnvironment(), false);
  });

  void it('is not production under the test runner', () => {
    setEnv({ NODE_ENV: 'test' });
    assert.equal(isProductionSentryEnvironment(), false);
  });

  void it('keeps preview/staging deploys (NODE_ENV=production) out of the prod project', () => {
    setEnv({ SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production' });
    assert.equal(isProductionSentryEnvironment(), false);
  });
});
