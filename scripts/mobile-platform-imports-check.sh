#!/usr/bin/env bash
#
# Guards @expo/ui platform-specific imports to their platform file.
#
# `@expo/ui/swift-ui` resolves a native SwiftUI view at module load and crashes
# on Android ("Unable to get view config"); `@expo/ui/jetpack-compose` crashes the
# same way on iOS. So a swift-ui import may live ONLY in a `*.ios.{ts,tsx}` file,
# and a jetpack-compose import ONLY in a `*.android.{ts,tsx}` file. The universal
# `@expo/ui` root and `@expo/ui/community/*` are cross-platform and unrestricted.
#
# Why a bash guard and not just lint: `.oxlintrc.json` carries the equivalent
# `no-restricted-imports` rule (so editors / raw oxlint flag it), but `vp check`
# runs a reduced oxlint ruleset that silently drops `no-restricted-imports` — so it
# is NOT enforced by `vp check` or the pre-commit hook. This CI guard is the real
# backstop. See docs/expo-ui-components.md.
#
# Mirrors scripts/mobile-variant-guard.sh. Exit 1 (CI failure) on any misplaced
# import; 0 when clean.

set -euo pipefail
cd "$(dirname "$0")/.."

scan_dirs=(packages/mobile/src packages/mobile/app)

# swift-ui (and its sub-paths, e.g. /modifiers) must live only in *.ios.{ts,tsx}.
# Match a quoted module specifier so a stray mention in a comment doesn't trip it.
swiftui_bad=$(
  grep -rlE "['\"]@expo/ui/swift-ui" "${scan_dirs[@]}" \
    --include='*.ts' --include='*.tsx' \
    | grep -vE '\.ios\.(ts|tsx)$' \
    || true
)

# jetpack-compose (and sub-paths) must live only in *.android.{ts,tsx}.
compose_bad=$(
  grep -rlE "['\"]@expo/ui/jetpack-compose" "${scan_dirs[@]}" \
    --include='*.ts' --include='*.tsx' \
    | grep -vE '\.android\.(ts|tsx)$' \
    || true
)

fail=0
if [ -n "$swiftui_bad" ]; then
  echo "✖ @expo/ui/swift-ui imported outside a *.ios.{ts,tsx} file:"
  echo "$swiftui_bad"
  fail=1
fi
if [ -n "$compose_bad" ]; then
  echo "✖ @expo/ui/jetpack-compose imported outside a *.android.{ts,tsx} file:"
  echo "$compose_bad"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "  These modules resolve a native view at module load and crash on the other"
  echo "  platform (\"Unable to get view config\"). Move the import into the matching"
  echo "  .ios.tsx / .android.tsx file, or pass plain values through a shared"
  echo "  *.logic.ts / *.types.ts helper. Import the universal Host and shared"
  echo "  components from the '@expo/ui' root instead. See docs/expo-ui-components.md."
  exit 1
fi

echo "✓ @expo/ui/swift-ui imports are all in *.ios files; @expo/ui/jetpack-compose imports are all in *.android files."
