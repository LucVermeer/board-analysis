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
 * It enforces two invariants per dependency that Expo tracks:
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
 * packages/mobile/package.json — exclusion exempts a package from rule 1
 * only; rule 2 still guards the hand-pinned deviation against lockfile drift.
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

export interface DepCheckResult {
  /**
   * Number of declared dependencies whose range was validated against the
   * SDK's bundled map (rule 1). Zero means the map validated nothing — a
   * degenerate pins file must fail the check, never green-light it.
   */
  checked: number;
  violations: DepViolation[];
}

/**
 * Pure check: given our declared dependency map, the exclude list, the
 * installed SDK's bundled native module ranges, and a map of installed
 * versions, return every violation. No filesystem access — all inputs are
 * plain data, so this is unit-testable without a real node_modules tree.
 *
 * Exclusion (`expo.install.exclude`) means "deliberately deviates from the
 * SDK's pin", NOT "exempt from drift": it skips only rule 1 (bundled-range
 * alignment). Rule 2 (installed satisfies declared) still runs for excluded
 * packages, so a hand-pinned deviation is still guarded against lockfile
 * drift. Excluded entries the SDK does not track at all (e.g. `typescript`)
 * are skipped naturally by the bundled-map gate.
 */
export function checkMobileDeps(
  declaredDeps: Record<string, string>,
  exclude: readonly string[],
  bundledModules: Record<string, string>,
  installedVersions: Record<string, string | undefined>,
  expoPackageName: string = EXPO_PACKAGE_NAME,
): DepCheckResult {
  const excludeSet = new Set(exclude);
  const violations: DepViolation[] = [];
  let checked = 0;

  for (const [name, declared] of Object.entries(declaredDeps)) {
    const isExpoItself = name === expoPackageName;
    const bundledRange = isExpoItself ? undefined : bundledModules[name];
    // Not a package the installed SDK tracks pins for — nothing to check.
    if (!isExpoItself && bundledRange === undefined) continue;

    if (bundledRange !== undefined && !excludeSet.has(name)) {
      // (1) Declared-range alignment.
      checked += 1;
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

    // (2) Installed alignment — catches lockfile drift independent of (1),
    //     and runs for excluded packages too: a deliberate deviation from the
    //     SDK pin still has to install exactly what it declares.
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

  return { checked, violations };
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

/**
 * Read and parse the installed SDK's bundledNativeModules.json. Throws if
 * missing or malformed — including "valid JSON but degenerate": an empty
 * object, an array, or non-string values would make every package skip the
 * range check and green-light the run, which is worse than a flaky check.
 */
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`cannot parse ${bundledNativeModulesPath}: ${(error as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${bundledNativeModulesPath} is not a JSON object — the installed expo package looks corrupt`);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(
      `${bundledNativeModulesPath} is empty — an empty pins map would validate nothing. ` +
        `The installed expo package looks corrupt; re-run 'bun install'.`,
    );
  }
  const nonString = entries.find(([, range]) => typeof range !== 'string');
  if (nonString) {
    throw new Error(
      `${bundledNativeModulesPath} has a non-string range for "${nonString[0]}" — ` +
        `the installed expo package looks corrupt`,
    );
  }
  return parsed as Record<string, string>;
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
  const { checked, violations } = checkMobileDeps(declaredDeps, exclude, bundledModules, installedVersions);

  // Belt-and-braces against a degenerate pins map: if not a single declared
  // dependency was validated against bundledNativeModules.json, the check
  // proved nothing — fail rather than green-light.
  if (checked === 0) {
    console.error(
      `[mobile-deps] FAILED — 0 declared dependencies were validated against ${bundledNativeModulesPath}. ` +
        `Either the pins map is degenerate or every tracked dependency is excluded; ` +
        `this check must verify something to pass.`,
    );
    return 1;
  }

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
    `[mobile-deps] OK — ${checked} dependencies match Expo SDK ${installedExpoVersion ?? '(unknown)'}'s ` +
      'bundled pins (or are explicitly excluded), and all installed versions satisfy their declared pins.',
  );
  return 0;
}

// Run only when executed directly (tsx scripts/mobile-deps-check.ts), not when
// imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
