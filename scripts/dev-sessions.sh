#!/usr/bin/env bash
#
# List active boardsesh `vp run dev` sessions on this host. Reads the lockfiles
# the dev-orchestrator drops in $XDG_RUNTIME_DIR and prints pid, worktree,
# ports, runtime, and current RSS of the next-server child if we can find it.
#
# Usage:
#   ./scripts/dev-sessions.sh            # list active sessions
#   ./scripts/dev-sessions.sh --kill ALL # SIGTERM every listed session's pid
#   ./scripts/dev-sessions.sh --kill <pid>

set -euo pipefail

LOCK_DIR="${XDG_RUNTIME_DIR:-/tmp}"

shopt -s nullglob
locks=("$LOCK_DIR"/boardsesh-dev-*.lock.json)
shopt -u nullglob

KILL_TARGET=""
for arg in "$@"; do
  case "$arg" in
    --kill)
      echo "Usage: $0 [--kill <pid|ALL>]" >&2
      exit 2
      ;;
    --kill=*)
      KILL_TARGET="${arg#--kill=}"
      ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      if [[ -z "$KILL_TARGET" && "${prev_arg:-}" == "--kill" ]]; then
        KILL_TARGET="$arg"
      elif [[ "$arg" == "--kill" ]]; then
        prev_arg="$arg"
        continue
      else
        echo "Unknown argument: $arg" >&2
        exit 2
      fi
      ;;
  esac
  prev_arg="$arg"
done

if [[ ${#locks[@]} -eq 0 ]]; then
  echo "No active dev sessions."
  exit 0
fi

printf '%-8s %-7s %-7s %-10s %s\n' "PID" "BACK" "WEB" "RSS(MiB)" "WORKTREE"
matched_pids=()

for lock in "${locks[@]}"; do
  pid=$(jq -r '.pid' "$lock" 2>/dev/null || echo "")
  if [[ -z "$pid" || "$pid" == "null" ]]; then
    rm -f -- "$lock"
    continue
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f -- "$lock"
    continue
  fi

  matched_pids+=("$pid")
  root=$(jq -r '.rootDir' "$lock")
  back=$(jq -r '.backendPort // "-"' "$lock")
  web=$(jq -r '.webPort // "-"' "$lock")

  # Sum RSS of the orchestrator + everything under it. pgrep -P gives direct
  # children; we walk one level deep to catch `next-server` (the actual hog).
  rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo 0)
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    rss_kb=$(( rss_kb + $(ps -o rss= -p "$child" 2>/dev/null | tr -d ' ' || echo 0) ))
    for grandchild in $(pgrep -P "$child" 2>/dev/null || true); do
      rss_kb=$(( rss_kb + $(ps -o rss= -p "$grandchild" 2>/dev/null | tr -d ' ' || echo 0) ))
      for ggchild in $(pgrep -P "$grandchild" 2>/dev/null || true); do
        rss_kb=$(( rss_kb + $(ps -o rss= -p "$ggchild" 2>/dev/null | tr -d ' ' || echo 0) ))
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
