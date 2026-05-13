#!/usr/bin/env bash
#
# Run `vp run dev` (or any command) inside a systemd-user transient scope with
# a hard memory cap. If the dev server runs away, the kernel kills only that
# scope instead of the whole host. This is the cgroup-v2 backstop to the
# in-process guard in scripts/dev-orchestrator.ts.
#
# Usage:
#   ./scripts/dev-with-cgroup.sh                       # vp run dev, MemoryMax=6G
#   BOARDSESH_DEV_MEM_MAX=4G ./scripts/dev-with-cgroup.sh
#   ./scripts/dev-with-cgroup.sh vp run dev:web        # any other command
#
# Requires: systemd-user (check with `systemctl --user is-active default.target`)
# and cgroup v2 with the memory controller. On Fedora 42 both are on by default.

set -euo pipefail

LIMIT="${BOARDSESH_DEV_MEM_MAX:-6G}"

if ! systemctl --user is-active default.target >/dev/null 2>&1; then
  echo "systemd --user is not active — cannot apply a memory cgroup. Run plain 'vp run dev' instead." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  set -- vp run dev
fi

echo "[dev-cgroup] MemoryMax=$LIMIT  cmd: $*"
exec systemd-run --user --scope --quiet \
  --property=MemoryMax="$LIMIT" \
  --property=MemorySwapMax=0 \
  -- "$@"
