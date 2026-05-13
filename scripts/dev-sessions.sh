#!/usr/bin/env bash
#
# List active boardsesh `vp run dev` sessions on this host. Reads the
# lockfiles the dev-orchestrator drops (in $XDG_RUNTIME_DIR on Linux, in
# $TMPDIR on macOS) and prints pid, worktree, ports, and combined RSS of
# the orchestrator + its `next-server` / backend children.
#
# Works on Linux and macOS. Uses Node (already required by the orchestrator)
# to parse the JSON lockfile so there's no `jq` dependency.
#
# Usage:
#   ./scripts/dev-sessions.sh             # list active sessions
#   ./scripts/dev-sessions.sh --kill ALL  # SIGTERM every listed session
#   ./scripts/dev-sessions.sh --kill PID  # SIGTERM a single session

set -euo pipefail

# Match the orchestrator's lock-dir resolution: XDG_RUNTIME_DIR (Linux user
# session dir) takes precedence, then TMPDIR (set on macOS by launchd),
# then /tmp.
LOCK_DIR="${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}"
LOCK_DIR="${LOCK_DIR%/}"

# JSON parser without `jq`: uses Node, which the orchestrator already needs.
# Reads a single field from a single lockfile and prints it (or empty on error).
if ! command -v node >/dev/null 2>&1; then
  echo "$(basename "$0") needs 'node' on PATH to parse lockfiles." >&2
  exit 1
fi
read_lock_field() {
  local lock_file="$1" field="$2"
  node -e "try{const b=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const v=b[process.argv[2]];if(v!=null)process.stdout.write(String(v))}catch{}" \
    "$lock_file" "$field" 2>/dev/null
}

KILL_TARGET=""
expect_kill_value=0
for arg in "$@"; do
  if [[ $expect_kill_value -eq 1 ]]; then
    KILL_TARGET="$arg"
    expect_kill_value=0
    continue
  fi
  case "$arg" in
    --kill)
      expect_kill_value=1
      ;;
    --kill=*)
      KILL_TARGET="${arg#--kill=}"
      ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--kill <pid|ALL>]" >&2
      exit 2
      ;;
  esac
done
if [[ $expect_kill_value -eq 1 ]]; then
  echo "--kill requires a value (pid or ALL)" >&2
  exit 2
fi

shopt -s nullglob
locks=("$LOCK_DIR"/boardsesh-dev-*.lock.json)
shopt -u nullglob

if [[ ${#locks[@]} -eq 0 ]]; then
  echo "No active dev sessions in $LOCK_DIR."
  exit 0
fi

printf '%-8s %-7s %-7s %-10s %s\n' "PID" "BACK" "WEB" "RSS(MiB)" "WORKTREE"
matched_pids=()

for lock in "${locks[@]}"; do
  pid=$(read_lock_field "$lock" pid)
  if [[ -z "$pid" ]]; then
    rm -f -- "$lock"
    continue
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f -- "$lock"
    continue
  fi

  matched_pids+=("$pid")
  root=$(read_lock_field "$lock" rootDir)
  back=$(read_lock_field "$lock" backendPort)
  web=$(read_lock_field "$lock" webPort)
  [[ -z "$back" ]] && back="-"
  [[ -z "$web"  ]] && web="-"

  # Sum RSS across orchestrator + children + grandchildren + great-grandchildren.
  # `ps -o rss=` works on BSD ps (macOS) and procps (Linux); `pgrep -P` works
  # on both too. Output is in KiB on both platforms.
  rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' \n' || echo 0)
  [[ -z "$rss_kb" ]] && rss_kb=0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    extra=$(ps -o rss= -p "$child" 2>/dev/null | tr -d ' \n' || echo 0)
    rss_kb=$(( rss_kb + ${extra:-0} ))
    for grandchild in $(pgrep -P "$child" 2>/dev/null || true); do
      extra=$(ps -o rss= -p "$grandchild" 2>/dev/null | tr -d ' \n' || echo 0)
      rss_kb=$(( rss_kb + ${extra:-0} ))
      for ggchild in $(pgrep -P "$grandchild" 2>/dev/null || true); do
        extra=$(ps -o rss= -p "$ggchild" 2>/dev/null | tr -d ' \n' || echo 0)
        rss_kb=$(( rss_kb + ${extra:-0} ))
      done
    done
  done

  rss_mib=$(( rss_kb / 1024 ))
  printf '%-8s %-7s %-7s %-10s %s\n' "$pid" "$back" "$web" "$rss_mib" "$root"
done

if [[ -n "$KILL_TARGET" ]]; then
  if [[ "$KILL_TARGET" == "ALL" ]]; then
    for pid in "${matched_pids[@]}"; do
      echo "kill -TERM $pid"
      kill -TERM "$pid" 2>/dev/null || true
    done
  else
    if [[ " ${matched_pids[*]} " == *" $KILL_TARGET "* ]]; then
      echo "kill -TERM $KILL_TARGET"
      kill -TERM "$KILL_TARGET" 2>/dev/null || true
    else
      echo "PID $KILL_TARGET is not a tracked dev session." >&2
      exit 1
    fi
  fi
fi
