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
# Requires: Linux with systemd-user (check with `systemctl --user is-active
# default.target`) and cgroup v2 with the memory controller. On Fedora 42
# both are on by default.
#
# macOS is not supported — there is no equivalent to systemd cgroups on
# Darwin. macOS users still get the in-process guard from dev-orchestrator.ts;
# the host-wide kernel OOM-killer that motivated this script is also less
# of a risk on macOS because the WindowServer pressure path kills runaway
# processes earlier.

set -euo pipefail

LIMIT="${BOARDSESH_DEV_MEM_MAX:-6G}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "$(basename "$0") is Linux-only (needs systemd cgroups)." >&2
  echo "On macOS, run plain 'vp run dev' — the in-process OOM guard in" >&2
  echo "scripts/dev-orchestrator.ts still applies." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found — this Linux distro doesn't ship systemd. Run plain 'vp run dev' instead." >&2
  exit 1
fi

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
