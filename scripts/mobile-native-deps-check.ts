/// <reference types="node" />

/**
 * Guards against native iOS build-phase dependency-resolution breaks that only
 * surface during the macOS `xcodebuild archive` on push-to-main (e.g. the
 * TestFlight RN deploy), long after the PR that caused them merged.
 *
 * The iOS "Bundle React Native code and images" phase shells out to helper
 * scripts that resolve CLIs with Node from inside packages/mobile — most
 * notably Sentry's `sentry-xcode.sh`, which runs:
 *
 *   node --print "require.resolve('@sentry/cli/package.json')"
 *
 * Bun's isolated linker only symlinks a workspace's DIRECT deps into its
 * node_modules, so a transitive-only `@sentry/cli` (pulled in by
 * @sentry/react-native) is NOT resolvable from packages/mobile and the build
 * dies under `set -e`. The fix is to declare such tools as direct deps; this
 * check fails the PR the moment that invariant is broken, on a cheap Linux
 * runner — no Xcode required.
 *
 * Usage: vp run check:mobile-native-deps
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE_PKG = resolve(ROOT_DIR, 'packages', 'mobile', 'package.json');

/**
 * If the `trigger` package is a dependency of packages/mobile, then every entry
 * in `tools` must be resolvable from packages/mobile — mirroring how the iOS
 * bundle phase resolves them at build time. Add a rule here whenever a new
 * config plugin injects a build-phase script that `require.resolve`s a CLI.
 */
const RULES: ReadonlyArray<{ trigger: string; tools: readonly string[] }> = [
  { trigger: '@sentry/react-native', tools: ['@sentry/cli/package.json'] },
];

const mobilePkg = JSON.parse(readFileSync(MOBILE_PKG, 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declaredDeps = { ...mobilePkg.devDependencies, ...mobilePkg.dependencies };

// Resolve exactly as the iOS build script does: base = packages/mobile.
const requireFromMobile = createRequire(MOBILE_PKG);

const failures: string[] = [];
let checked = 0;

for (const { trigger, tools } of RULES) {
  if (!declaredDeps[trigger]) continue;
  for (const tool of tools) {
    checked += 1;
    try {
      requireFromMobile.resolve(tool);
    } catch {
      failures.push(
        `${tool} is required at iOS build time by ${trigger}, but is not resolvable from packages/mobile. ` +
          `Add it as a direct dependency in packages/mobile/package.json ` +
          `(Bun's isolated linker does not surface transitive deps there).`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('[mobile-native-deps] FAILED — native build-phase deps not resolvable:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log(`[mobile-native-deps] OK — ${checked} native build-phase dep(s) resolvable from packages/mobile.`);
