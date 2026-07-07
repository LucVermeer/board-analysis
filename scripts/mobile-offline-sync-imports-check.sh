#!/usr/bin/env bash
#
# Guards the offline-sync adapter boundary: mobile code must import
# drainMutationQueue / startSyncScheduler / triggerSync / pullSync from
# src/offline/offline-sync-adapter.ts, never from '@boardsesh/offline-sync'
# directly. The package leaves the connectivity probe, AppState/NetInfo
# triggers, and Sentry telemetry injected — only the adapter binds them, so a
# direct import silently drains without a connectivity probe (burning retry
# budget while offline).
#
# Why a bash guard and not just lint: `.oxlintrc.json` carries the equivalent
# `no-restricted-imports` rule (so editors / raw oxlint flag it), but `vp check`
# runs a reduced oxlint ruleset that silently drops `no-restricted-imports` — so
# it is NOT enforced by `vp check` or the pre-commit hook. This CI guard is the
# real backstop.
#
# Mirrors scripts/mobile-platform-imports-check.sh. Exit 1 (CI failure) on any
# direct import; 0 when clean.

set -euo pipefail
cd "$(dirname "$0")/.."

scan_dirs=(packages/mobile/src packages/mobile/app)
adapter_path="packages/mobile/src/offline/offline-sync-adapter.ts"

# Null-data mode treats each file as one record so multi-line import statements
# match. The pattern requires one of the four engine entry points between
# `import` and a '@boardsesh/offline-sync' specifier; type-only imports of
# other symbols stay allowed.
direct_imports=$(
  grep -rlzE "import[^;]*[{,[:space:]](drainMutationQueue|startSyncScheduler|triggerSync|pullSync)[,[:space:]}][^;]*from[[:space:]]*['\"]@boardsesh/offline-sync['\"]" \
    "${scan_dirs[@]}" \
    --include='*.ts' --include='*.tsx' \
    | tr '\0' '\n' \
    | grep -v "^${adapter_path}$" \
    || true
)

if [ -n "$direct_imports" ]; then
  echo "✖ Engine entry points imported from '@boardsesh/offline-sync' outside the adapter:"
  echo "$direct_imports"
  echo
  echo "  Import drainMutationQueue / startSyncScheduler / triggerSync / pullSync from"
  echo "  src/offline/offline-sync-adapter instead — it binds the onlineManager"
  echo "  connectivity probe, AppState/NetInfo triggers, and Sentry telemetry that the"
  echo "  package deliberately leaves injected."
  exit 1
fi

echo "✓ drainMutationQueue/startSyncScheduler/triggerSync/pullSync are only imported via the offline-sync adapter."
