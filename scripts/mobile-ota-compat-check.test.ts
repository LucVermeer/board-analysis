import { describe, expect, it } from 'vitest';

import {
  CHECK_TITLE,
  STICKY_MARKER,
  deriveOverall,
  deriveVerdict,
  parseArgs,
  parseRuntimeVersion,
  renderComment,
  renderSummary,
  type PlatformResult,
  type Verdict,
} from './mobile-ota-compat-check';

function platformResult(
  overrides: Partial<PlatformResult> & Pick<PlatformResult, 'platform' | 'verdict'>,
): PlatformResult {
  return {
    prFingerprint: 'aaaaaaaaaaaa',
    baseFingerprint: 'aaaaaaaaaaaa',
    shippedTagExists: null,
    ...overrides,
  };
}

describe('deriveVerdict', () => {
  it('equal fingerprints → ota-compatible', () => {
    expect(deriveVerdict('abc12345', 'abc12345')).toBe('ota-compatible');
  });

  it('different fingerprints → native-change-required', () => {
    expect(deriveVerdict('abc12345', 'def67890')).toBe('native-change-required');
  });

  it('missing baseline → unknown', () => {
    expect(deriveVerdict('abc12345', null)).toBe('unknown');
  });

  it('missing PR fingerprint → unknown', () => {
    expect(deriveVerdict(null, 'abc12345')).toBe('unknown');
  });

  it('both missing → unknown', () => {
    expect(deriveVerdict(null, null)).toBe('unknown');
  });
});

describe('deriveOverall precedence (native > unknown > compatible)', () => {
  it('a native verdict on one platform wins even if the other is compatible', () => {
    const results = [
      platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
      platformResult({ platform: 'android', verdict: 'native-change-required' }),
    ];
    expect(deriveOverall(results)).toBe('native-change-required');
  });

  it('a native verdict is never masked by an unknown', () => {
    const results = [
      platformResult({ platform: 'ios', verdict: 'unknown' }),
      platformResult({ platform: 'android', verdict: 'native-change-required' }),
    ];
    expect(deriveOverall(results)).toBe('native-change-required');
  });

  it('a single unknown downgrades an otherwise-compatible headline', () => {
    const results = [
      platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
      platformResult({ platform: 'android', verdict: 'unknown' }),
    ];
    expect(deriveOverall(results)).toBe('unknown');
  });

  it('all compatible → ota-compatible', () => {
    const results = [
      platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
      platformResult({ platform: 'android', verdict: 'ota-compatible' }),
    ];
    expect(deriveOverall(results)).toBe('ota-compatible');
  });

  it('no platforms → unknown', () => {
    expect(deriveOverall([])).toBe('unknown');
  });
});

describe('renderComment', () => {
  const ctx = { sha: 'deadbeefcafef00d', branch: 'feat/x' };

  it('carries the sticky marker, branch, and short SHA', () => {
    const comment = renderComment(
      {
        results: [
          platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
          platformResult({ platform: 'android', verdict: 'ota-compatible' }),
        ],
        overall: 'ota-compatible',
      },
      ctx,
    );
    expect(comment.startsWith(STICKY_MARKER)).toBe(true);
    expect(comment).toContain('feat/x');
    expect(comment).toContain('deadbee'); // 7-char short SHA
    expect(comment).toContain('Ships over-the-air');
  });

  it('shows pr → main hashes for a native change', () => {
    const comment = renderComment(
      {
        results: [
          platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
          platformResult({
            platform: 'android',
            verdict: 'native-change-required',
            prFingerprint: '1111111111aa',
            baseFingerprint: '2222222222bb',
          }),
        ],
        overall: 'native-change-required',
      },
      ctx,
    );
    expect(comment).toContain('Native change detected');
    expect(comment).toContain('`1111111111aa` → `2222222222bb`');
  });

  it('states "already on a released build" only when shippedTagExists is true', () => {
    const comment = renderComment(
      {
        results: [
          platformResult({ platform: 'ios', verdict: 'ota-compatible', shippedTagExists: true }),
          platformResult({ platform: 'android', verdict: 'ota-compatible', shippedTagExists: false }),
        ],
        overall: 'ota-compatible',
      },
      ctx,
    );
    expect(comment).toContain('already on a released build');
    // Never makes a negative "not shipped" claim (ambiguous when the maps key is absent on Android).
    expect(comment.toLowerCase()).not.toContain('not shipped');
    expect(comment.toLowerCase()).not.toContain('no released build');
  });
});

describe('renderSummary', () => {
  it('includes a table row per platform', () => {
    const summary = renderSummary({
      results: [
        platformResult({ platform: 'ios', verdict: 'ota-compatible' }),
        platformResult({ platform: 'android', verdict: 'native-change-required', baseFingerprint: 'bbbbbbbbbbbb' }),
      ],
      overall: 'native-change-required',
    });
    expect(summary).toContain('## OTA compatibility');
    expect(summary).toContain('| iOS |');
    expect(summary).toContain('| Android |');
  });
});

describe('CHECK_TITLE covers every verdict', () => {
  it.each<Verdict>(['ota-compatible', 'native-change-required', 'unknown'])('has a title for %s', (verdict) => {
    expect(CHECK_TITLE[verdict]).toBeTruthy();
  });
});

describe('parseArgs', () => {
  it('skips a leading `--` (vp run <task> -- <args> forwards it as argv[0])', () => {
    const options = parseArgs(['--', '--write-env', '--base-dir', '/tmp/base'], '/repo');
    expect(options.writeEnvFiles).toBe(true);
    expect(options.baseMobileDir).toBe('/tmp/base/packages/mobile');
  });

  it('reads base fingerprints and the shipped-tags flag', () => {
    const options = parseArgs(
      ['--base-fingerprint-ios', 'abc12345', '--base-fingerprint-android', 'def67890', '--check-shipped-tags'],
      '/repo',
    );
    expect(options.baseFingerprints).toEqual({ ios: 'abc12345', android: 'def67890' });
    expect(options.checkShippedTags).toBe(true);
  });

  it('throws on an unknown argument', () => {
    expect(() => parseArgs(['--nope'], '/repo')).toThrow(/unknown argument/);
  });
});

describe('parseRuntimeVersion', () => {
  it('extracts a valid hex runtimeVersion from JSON', () => {
    expect(parseRuntimeVersion('{"runtimeVersion":"abc1234567"}')).toBe('abc1234567');
  });

  it('finds the JSON object amid surrounding log noise', () => {
    expect(parseRuntimeVersion('resolving…\n{"runtimeVersion":"deadbeef","fingerprintSources":[]}\n')).toBe('deadbeef');
  });

  it('rejects a non-hex / too-short runtimeVersion', () => {
    expect(parseRuntimeVersion('{"runtimeVersion":"1.0.0"}')).toBeNull();
    expect(parseRuntimeVersion('{"runtimeVersion":"abc"}')).toBeNull();
  });

  it('returns null for empty or unparseable output', () => {
    expect(parseRuntimeVersion('')).toBeNull();
    expect(parseRuntimeVersion('not json at all')).toBeNull();
  });
});
