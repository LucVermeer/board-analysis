import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkMobileDeps, readExcludeList, type DepViolation } from '../mobile-deps-check';

function violationFor(violations: DepViolation[], name: string): DepViolation | undefined {
  return violations.find((violation) => violation.package === name);
}

describe('checkMobileDeps', () => {
  it('passes an exact pin that sits inside the bundled range', () => {
    const violations = checkMobileDeps(
      { 'expo-haptics': '56.0.3' },
      [],
      { 'expo-haptics': '~56.0.3' },
      { 'expo-haptics': '56.0.3' },
    );

    expect(violations).toEqual([]);
  });

  it('flags an exact pin that falls outside the bundled range', () => {
    // Installed matches declared, so only the range-alignment check fires.
    const violations = checkMobileDeps(
      { 'expo-haptics': '55.0.0' },
      [],
      { 'expo-haptics': '~56.0.3' },
      { 'expo-haptics': '55.0.0' },
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].package).toBe('expo-haptics');
    expect(violations[0].reason).toContain("does not satisfy the SDK's bundled range");
  });

  it('passes a range pin that is string-equal to the bundled range', () => {
    const violations = checkMobileDeps(
      { '@expo/ui': '~56.0.18' },
      [],
      { '@expo/ui': '~56.0.18' },
      { '@expo/ui': '56.0.18' },
    );

    expect(violations).toEqual([]);
  });

  it('flags a range pin that differs from the bundled range string', () => {
    const violations = checkMobileDeps(
      { '@expo/ui': '^56.0.18' },
      [],
      { '@expo/ui': '~56.0.18' },
      { '@expo/ui': '56.0.18' },
    );

    const violation = violationFor(violations, '@expo/ui');
    expect(violation).toBeDefined();
    expect(violation?.reason).toContain("pin exactly or match the SDK's range string");
  });

  it('skips packages in the exclude list even when they violate the bundled range', () => {
    const violations = checkMobileDeps(
      { '@sentry/react-native': '6.22.0' },
      ['@sentry/react-native'],
      { '@sentry/react-native': '~7.11.0' },
      { '@sentry/react-native': '6.22.0' },
    );

    expect(violations).toEqual([]);
  });

  it('skips packages the installed SDK does not track pins for', () => {
    const violations = checkMobileDeps({ 'not-a-native-module': '1.0.0' }, [], {}, { 'not-a-native-module': '1.0.0' });

    expect(violations).toEqual([]);
  });

  it('flags installed-version drift even when the declared range aligns with the SDK', () => {
    const violations = checkMobileDeps(
      { 'expo-haptics': '~56.0.3' },
      [],
      { 'expo-haptics': '~56.0.3' },
      { 'expo-haptics': '55.9.0' },
    );

    const violation = violationFor(violations, 'expo-haptics');
    expect(violation).toBeDefined();
    expect(violation?.reason).toContain('lockfile drift');
  });

  it('flags a package that is declared but not installed', () => {
    const violations = checkMobileDeps({ 'expo-haptics': '~56.0.3' }, [], { 'expo-haptics': '~56.0.3' }, {});

    const violation = violationFor(violations, 'expo-haptics');
    expect(violation).toBeDefined();
    expect(violation?.installed).toBeNull();
    expect(violation?.reason).toContain('not installed');
  });

  it('checks expo itself only against the installed version, not a bundled range', () => {
    const passing = checkMobileDeps({ expo: '56.0.12' }, [], {}, { expo: '56.0.12' });
    expect(passing).toEqual([]);

    const drifted = checkMobileDeps({ expo: '56.0.12' }, [], {}, { expo: '56.0.13' });
    const violation = violationFor(drifted, 'expo');
    expect(violation).toBeDefined();
    expect(violation?.bundled).toBeNull();
    expect(violation?.reason).toContain('lockfile drift');
  });

  it('can report both a range-alignment and an installed-alignment violation for the same package', () => {
    const violations = checkMobileDeps(
      { 'expo-haptics': '55.0.0' },
      [],
      { 'expo-haptics': '~56.0.3' },
      { 'expo-haptics': '54.0.0' },
    );

    const matches = violations.filter((violation) => violation.package === 'expo-haptics');
    expect(matches).toHaveLength(2);
    expect(matches.some((violation) => violation.reason.includes('bundled range'))).toBe(true);
    expect(matches.some((violation) => violation.reason.includes('lockfile drift'))).toBe(true);
  });
});

describe('readExcludeList', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mdc-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the expo.install.exclude array', () => {
    const pkgPath = join(dir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({ expo: { install: { exclude: ['a', 'b'] } } }));

    expect(readExcludeList(pkgPath)).toEqual(['a', 'b']);
  });

  it('returns an empty array when expo.install.exclude is absent', () => {
    const pkgPath = join(dir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({ name: '@boardsesh/mobile' }));

    expect(readExcludeList(pkgPath)).toEqual([]);
  });

  it('throws a helpful error for a missing file', () => {
    expect(() => readExcludeList(join(dir, 'does-not-exist.json'))).toThrow(/cannot read/);
  });

  it('throws a helpful error for malformed JSON', () => {
    const pkgPath = join(dir, 'package.json');
    writeFileSync(pkgPath, '{ not valid json');

    expect(() => readExcludeList(pkgPath)).toThrow(/cannot parse/);
  });
});
