/// <reference types="node" />

/**
 * Deterministic dependency-health check for packages/mobile.
 *
 * This used to shell out to `expo install --check`, which DOES NOT compare
 * against the locally installed SDK's `bundledNativeModules.json` as its own
 * docs imply — it consults Expo's remote versions API. That means the check
 * went red the instant Expo published a patch release, with zero changes on
 * our side, and stayed red until we bumped `expo` to match. `EXPO_OFFLINE=1`
 * does not fix this: the CLI prints "Dependency validation is unreliable in
 * offline-mode" and skips real validation.
 *
 * This script instead reads packages/mobile/node_modules/expo/bundledNativeModules.json
 * directly — the canonical pins FOR THE SDK RELEASE WE HAVE INSTALLED. That
 * file only changes when we bump the `expo` package ourselves, which is
 * exactly the determinism we want: the check only changes outcome when WE
 * change something (bump expo, edit a pin, lockfile drift).
 *
 * It enforces two invariants per non-excluded dependency that Expo tracks:
 *   1. Declared-range alignment — our declared version string in package.json
 *      must line up with the SDK's bundled range. An exact pin (e.g. "56.0.4")
 *      must satisfy the bundled range (e.g. "~56.0.4"); a range pin (e.g.
 *      "~2.31.1") must be STRING-EQUAL to the bundled range — anything looser
 *      could silently resolve outside what the SDK was tested against.
 *   2. Installed alignment — the version actually installed in node_modules
 *      must satisfy our declared string. This is the caret-drift class of bug
 *      that crashed the 2.0.0 launch: a `^`/`~` range in package.json quietly
 *      resolving, via `bun install` / a transitive floor raise, to a version
 *      the installed Expo SDK was never tested against, while typecheck and
 *      the Metro bundle stay green.
 *
 * `expo` itself is not listed in bundledNativeModules.json, so it only gets
 * the installed-alignment check (installed satisfies declared). Deliberate
 * deviations from the SDK pins live in `expo.install.exclude` in
 * packages/mobile/package.json — this check honours that list.
 *
 * Usage: vp run check:mobile-deps
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import semver from 'semver';
import { readMobileDeps } from './mobile-native-deps-check';

export const EXPO_PACKAGE_NAME = 'expo';

export interface DepViolation {
  package: string;
  declared: string;
  /** The SDK's bundled range for this package, or null for `expo` itself (not tracked in bundledNativeModules.json). */
  bundled: string | null;
  /** The installed version, or null if it could not be resolved. */
  installed: string | null;
  reason: string;
}

/**
 * Pure check: given our declared dependency map, the exclude list, the
 * installed SDK's bundled native module ranges, and a map of installed
 * versions, return every violation. No filesystem access — all inputs are
 * plain data, so this is unit-testable without a real node_modules tree.
 */
export function checkMobileDeps(
  declaredDeps: Record<string, string>,
  exclude: readonly string[],
  bundledModules: Record<string, string>,
  installedVersions: Record<string, string | undefined>,
  expoPackageName: string = EXPO_PACKAGE_NAME,
): DepViolation[] {
  const excludeSet = new Set(exclude);
  const violations: DepViolation[] = [];

  for (const [name, declared] of Object.entries(declaredDeps)) {
    if (excludeSet.has(name)) continue;

    const isExpoItself = name === expoPackageName;
    const bundledRange = isExpoItself ? undefined : bundledModules[name];
    // Not a package the installed SDK tracks pins for — nothing to check.
    if (!isExpoItself && bundledRange === undefined) continue;

    if (bundledRange !== undefined) {
      // (1) Declared-range alignment.
      const declaredIsExact = semver.valid(declared) !== null;
      if (declaredIsExact) {
        if (!semver.satisfies(declared, bundledRange)) {
          violations.push({
            package: name,
            declared,
            bundled: bundledRange,
            installed: installedVersions[name] ?? null,
            reason: `declared "${declared}" does not satisfy the SDK's bundled range "${bundledRange}"`,
          });
        }
      } else if (declared !== bundledRange) {
        violations.push({
          package: name,
          declared,
          bundled: bundledRange,
          installed: installedVersions[name] ?? null,
          reason:
            `declared range "${declared}" does not match the SDK's bundled range "${bundledRange}" — ` +
            `pin exactly or match the SDK's range string`,
        });
      }
    }

    // (2) Installed alignment — catches lockfile drift independent of (1).
    const installed = installedVersions[name];
    if (installed === undefined) {
      violations.push({
        package: name,
        declared,
        bundled: bundledRange ?? null,
        installed: null,
        reason: `not installed / not resolvable from packages/mobile (run 'bun install')`,
      });
    } else if (!semver.satisfies(installed, declared)) {
      violations.push({
        package: name,
        declared,
        bundled: bundledRange ?? null,
        installed,
        reason: `installed "${installed}" does not satisfy declared "${declared}" — lockfile drift`,
      });
    }
  }

  return violations;
}

/** Read the `expo.install.exclude` list from a parsed packages/mobile/package.json. */
export function readExcludeList(mobilePackageJsonPath: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(mobilePackageJsonPath, 'utf8');
  } catch (error) {
    throw new Error(`cannot read ${mobilePackageJsonPath}: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`cannot parse ${mobilePackageJsonPath}: ${(error as Error).message}`);
  }
  const pkg = parsed as { expo?: { install?: { exclude?: string[] } } };
  return pkg.expo?.install?.exclude ?? [];
}

/** Read and parse the installed SDK's bundledNativeModules.json. Throws if missing or malformed. */
export function readBundledNativeModules(bundledNativeModulesPath: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(bundledNativeModulesPath, 'utf8');
  } catch (error) {
    throw new Error(
      `cannot read ${bundledNativeModulesPath}: ${(error as Error).message}. ` +
        `Run 'bun install' in the repo root so packages/mobile/node_modules/expo is populated.`,
    );
  }
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    throw new Error(`cannot parse ${bundledNativeModulesPath}: ${(error as Error).message}`);
  }
}

/**
 * Read the installed `version` of `name` by checking each `searchDirs` entry
 * in order and returning the first hit. Deliberately does NOT use
 * `require.resolve('<pkg>/package.json')` (as the sibling native-deps/patches
 * checks do): several Expo SDK packages (e.g. expo-symbols) ship an `exports`
 * map that only exposes `.` and specific subpaths, so `<pkg>/package.json` is
 * not a resolvable specifier even though the package is installed and would
 * resolve fine at runtime. Reading the manifest straight off disk sidesteps
 * that and mirrors Bun's isolated-linker layout: a direct dependency of
 * packages/mobile is symlinked into packages/mobile/node_modules; anything
 * hoisted to the workspace root lives in the repo root node_modules.
 */
export function readInstalledVersion(searchDirs: readonly string[], name: string): string | undefined {
  for (const dir of searchDirs) {
    const packageJsonPath = resolve(dir, ...name.split('/'), 'package.json');
    if (!existsSync(packageJsonPath)) continue;
    try {
      const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
      if (version) return version;
    } catch {
      // Malformed manifest at this search dir — try the next one.
    }
  }
  return undefined;
}

/** Read the installed version of every named package via {@link readInstalledVersion}. */
export function readInstalledVersions(
  searchDirs: readonly string[],
  packageNames: readonly string[],
): Record<string, string | undefined> {
  const versions: Record<string, string | undefined> = {};
  for (const name of packageNames) {
    versions[name] = readInstalledVersion(searchDirs, name);
  }
  return versions;
}

/** Wire the real filesystem and run the check. Returns the process exit code. */
export function main(): number {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mobileDir = resolve(repoRoot, 'packages', 'mobile');
  const mobilePackageJson = resolve(mobileDir, 'package.json');
  const bundledNativeModulesPath = resolve(mobileDir, 'node_modules', 'expo', 'bundledNativeModules.json');
  // Bun's isolated linker symlinks packages/mobile's DIRECT deps into its own
  // node_modules; anything hoisted to the workspace root lives at the repo
  // root instead. Search both, mobile-local first.
  const searchDirs = [resolve(mobileDir, 'node_modules'), resolve(repoRoot, 'node_modules')];

  let declaredDeps: Record<string, string>;
  let exclude: string[];
  let bundledModules: Record<string, string>;
  try {
    declaredDeps = readMobileDeps(mobilePackageJson);
    exclude = readExcludeList(mobilePackageJson);
    bundledModules = readBundledNativeModules(bundledNativeModulesPath);
  } catch (error) {
    console.error(`[mobile-deps] FAILED — ${(error as Error).message}`);
    return 1;
  }

  const installedVersions = readInstalledVersions(searchDirs, Object.keys(declaredDeps));
  const installedExpoVersion = installedVersions[EXPO_PACKAGE_NAME];
  const violations = checkMobileDeps(declaredDeps, exclude, bundledModules, installedVersions);

  if (violations.length > 0) {
    console.error(`[mobile-deps] FAILED — ${violations.length} dependency violation(s) against the installed SDK:`);
    for (const violation of violations) {
      console.error(
        `  ✗ ${violation.package}: declared=${violation.declared} bundled=${violation.bundled ?? 'n/a'} ` +
          `installed=${violation.installed ?? 'MISSING'} — ${violation.reason}`,
      );
    }
    console.error(
      '[mobile-deps] Pin each flagged package to the version the SDK bundles, run `bun install` to fix ' +
        'lockfile drift, or, if the deviation is intentional, add it to expo.install.exclude in ' +
        'packages/mobile/package.json.',
    );
    return 1;
  }

  console.log(
    `[mobile-deps] OK — dependencies match Expo SDK ${installedExpoVersion ?? '(unknown)'}'s bundled pins ` +
      '(or are explicitly excluded).',
  );
  return 0;
}

// Run only when executed directly (tsx scripts/mobile-deps-check.ts), not when
// imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
