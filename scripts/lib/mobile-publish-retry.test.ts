/// <reference types="node" />

import { describe, expect, it, vi } from 'vitest';
import {
  classifyPublishFailure,
  PublishFailureEvidenceScanner,
  publishPlatformsSequentially,
  publishSelfHostedPlatformWithRetry,
  SELF_HOSTED_PUBLISH_MAX_ATTEMPTS,
  SELF_HOSTED_PUBLISH_RETRY_DELAYS_MS,
  type PublishCommandRunner,
  type TextOutput,
} from './mobile-publish-retry';

function outputCollector(): { output: TextOutput; read: () => string } {
  const chunks: string[] = [];
  return {
    output: { write: (chunk) => chunks.push(chunk) },
    read: () => chunks.join(''),
  };
}

describe('self-hosted publish failure classification', () => {
  it('recognizes only the complete S3 SlowDown XML evidence', () => {
    expect(
      classifyPublishFailure('<Error><Code>SlowDown</Code><Message>Please reduce your request rate.</Message></Error>'),
    ).toBe('s3-slowdown');
    expect(classifyPublishFailure('S3 SlowDown: please retry')).toBe('unknown');
    expect(classifyPublishFailure('<Code>SlowDown</Code>')).toBe('unknown');
  });

  it('recognizes explicit HTTP 5xx statuses but not unrelated numbers', () => {
    expect(classifyPublishFailure('request failed with HTTP/1.1 503 Service Unavailable')).toBe('http-5xx');
    expect(classifyPublishFailure('response status: 502')).toBe('http-5xx');
    expect(classifyPublishFailure('Response code: 503')).toBe('http-5xx');
    expect(classifyPublishFailure('uploaded 503 assets')).toBe('unknown');
  });

  it('lets permanent evidence veto retryable evidence', () => {
    expect(classifyPublishFailure('HTTP 503, then response status 403')).toBe('permanent');
    expect(classifyPublishFailure('Response code: 503; retry returned Response code: 401')).toBe('permanent');
    expect(
      classifyPublishFailure(
        '<Code>SlowDown</Code><Message>Please reduce your request rate.</Message><Code>AccessDenied</Code>',
      ),
    ).toBe('permanent');
  });

  it('classifies evidence split across output chunks', () => {
    const scanner = new PublishFailureEvidenceScanner();
    scanner.push('<Error><Code>Slow');
    scanner.push('Down</Code><Message>Please reduce your request');
    scanner.push(' rate.</Message></Error>');
    expect(scanner.classify()).toBe('s3-slowdown');
  });
});

describe('self-hosted publish retries', () => {
  it('uses four total attempts with 30/60/120 second backoff', async () => {
    const attempts: number[] = [];
    const runner: PublishCommandRunner = async ({ onStderr }) => {
      attempts.push(attempts.length + 1);
      if (attempts.length < SELF_HOSTED_PUBLISH_MAX_ATTEMPTS) {
        onStderr('HTTP 503 Service Unavailable\n');
        return { exitCode: 1 };
      }
      return { exitCode: 0 };
    };
    const sleeper = vi.fn(async (_delayMs: number) => undefined);
    const stdout = outputCollector();
    const stderr = outputCollector();

    const outcome = await publishSelfHostedPlatformWithRetry(
      { platform: 'ios', command: 'bunx', args: ['eoas', 'publish'], cwd: '/repo', env: {} },
      { runner, sleeper, stdout: stdout.output, stderr: stderr.output },
    );

    expect(outcome).toEqual({ platform: 'ios', success: true, attempts: 4, failureKind: null });
    expect(attempts).toHaveLength(4);
    expect(sleeper.mock.calls.map(([delayMs]) => delayMs)).toEqual([...SELF_HOSTED_PUBLISH_RETRY_DELAYS_MS]);
  });

  it('does not retry permanent or mixed evidence', async () => {
    const runner = vi.fn<PublishCommandRunner>(async ({ onStdout, onStderr }) => {
      onStdout('HTTP 503 Service Unavailable\n');
      onStderr('response status: 401\n');
      return { exitCode: 1 };
    });
    const sleeper = vi.fn(async () => undefined);
    const stderr = outputCollector();

    const outcome = await publishSelfHostedPlatformWithRetry(
      { platform: 'android', command: 'bunx', args: [], cwd: '/repo', env: {} },
      { runner, sleeper, stdout: outputCollector().output, stderr: stderr.output },
    );

    expect(outcome).toEqual({ platform: 'android', success: false, attempts: 1, failureKind: 'permanent' });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(sleeper).not.toHaveBeenCalled();
  });

  it('streams child output once without copying a raw token into diagnostics', async () => {
    const sensitiveOutput = 'server detail: EOO_TOKEN=eoo_fixture_secret\n';
    const runner: PublishCommandRunner = async ({ onStderr }) => {
      onStderr(sensitiveOutput);
      return { exitCode: 1 };
    };
    const stderr = outputCollector();

    await publishSelfHostedPlatformWithRetry(
      { platform: 'ios', command: 'bunx', args: [], cwd: '/repo', env: {} },
      { runner, stdout: outputCollector().output, stderr: stderr.output },
    );

    expect(stderr.read().match(/eoo_fixture_secret/g)).toHaveLength(1);
    expect(stderr.read()).toContain('no retryable error evidence');
  });
});

describe('platform aggregation', () => {
  it('runs iOS then Android and continues after an iOS failure', async () => {
    const calls: string[] = [];
    const outcomes = await publishPlatformsSequentially(['ios', 'android'], async (platform) => {
      calls.push(platform);
      return {
        platform,
        success: platform === 'android',
        attempts: 1,
        failureKind: platform === 'ios' ? 'unknown' : null,
      };
    });

    expect(calls).toEqual(['ios', 'android']);
    expect(outcomes).toEqual([
      { platform: 'ios', success: false, attempts: 1, failureKind: 'unknown' },
      { platform: 'android', success: true, attempts: 1, failureKind: null },
    ]);
  });

  it('records a thrown callback as failed and still runs the next platform', async () => {
    const calls: string[] = [];
    const outcomes = await publishPlatformsSequentially(['ios', 'android'], async (platform) => {
      calls.push(platform);
      if (platform === 'ios') throw new Error('fixture callback failure');
      return { platform, success: true, attempts: 1, failureKind: null };
    });

    expect(calls).toEqual(['ios', 'android']);
    expect(outcomes).toEqual([
      { platform: 'ios', success: false, attempts: 0, failureKind: 'unknown' },
      { platform: 'android', success: true, attempts: 1, failureKind: null },
    ]);
  });
});
