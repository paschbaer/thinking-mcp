#!/bin/sh
# Canonical reindex for this workspace (GN-D6): submit an analyze job to the
# gitnexus HTTP API and poll it to completion. Replaces the wsl.exe CLI call
# (nvm sourcing, blocking ~60s+) with real job semantics: submit -> poll.
#
# Usage: scripts/reindex-via-api.sh [repo_path] [base_url]
#   repo_path  absolute path in the SERVER's path world (default
#              /mnt/d/repos/thinking-mcp — the wsl-writer storage identity)
#   base_url   gitnexus server base URL (default $GITNEXUS_URL or
#              http://127.0.0.1:4747; the server is loopback-bound)
#
# Stats-line handling: the API analyze has no no-stats option — every job
# rewrites the "indexed by GitNexus as ..." counts line inside the
# gitnexus:start block of AGENTS.md/CLAUDE.md at the script's repo root. This
# repo keeps those files free of volatile counts, so after a successful job
# the script restores the pre-job line AND its file mtime (touch -d @epoch).
# Restoring content alone would leave the file newer than the index and trip
# the index-freshness gate; preserving the mtime makes the job's net effect on
# the file zero. The restore is line-scoped (awk), so a file that was already
# modified for other reasons keeps those modifications untouched.
#
# Concurrent submits are safe: the server dedups an already-running job for
# the same repo and returns the existing jobId. The wsl-CLI remains the
# fallback (see AGENTS.md) and is still required for --force storage-identity
# healing procedures documented around the CLI.

set -u

REPO_PATH="${1:-/mnt/d/repos/thinking-mcp}"
BASE_URL="${2:-${GITNEXUS_URL:-http://127.0.0.1:4747}}"
POLL_INTERVAL=5
TIMEOUT_SECS=900

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

die() {
  echo "reindex-via-api: $1" >&2
  exit 1
}

field_string() {
  # $1=json body, $2=field name -> first "field":"value" or empty
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

field_number() {
  # $1=json body, $2=field name -> first "field":<number> or empty
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" | head -n 1
}

STATS_MARKER='indexed by GitNexus as'

capture_stats_line() {
  grep -m1 "$STATS_MARKER" "$1" 2>/dev/null || true
}

capture_mtime() {
  stat -c %Y "$1" 2>/dev/null || true
}

restore_stats_line() {
  # $1=file, $2=pre-job line (empty = the line did not exist -> remove it)
  file=$1
  repl=$2
  tmp="$file.gn-stats-tmp"
  if [ -n "$repl" ]; then
    awk -v repl="$repl" -v m="$STATS_MARKER" 'index($0,m) && !d {print repl; d=1; next} {print}' \
      "$file" > "$tmp" && mv "$tmp" "$file"
  else
    awk -v m="$STATS_MARKER" 'index($0,m) && !d {d=1; next} {print}' \
      "$file" > "$tmp" && mv "$tmp" "$file"
  fi
}

restore_one() {
  # $1=file name, $2=pre-job stats line, $3=pre-job mtime
  f=$1
  snap_line=$2
  snap_mtime=$3
  [ -f "$REPO_ROOT/$f" ] || return 0
  now_line=$(capture_stats_line "$REPO_ROOT/$f")
  if [ "$now_line" != "$snap_line" ]; then
    restore_stats_line "$REPO_ROOT/$f" "$snap_line" \
      || die "failed to restore the stats line in $f — restore it manually (git checkout -- $f), the repo must not keep the volatile counts line"
    echo "restored stats line in $f (API analyze rewrites it; this repo keeps it clean)"
  fi
  if [ -n "$snap_mtime" ] && command -v touch >/dev/null 2>&1; then
    touch -d "@$snap_mtime" "$REPO_ROOT/$f" 2>/dev/null || true
  fi
}

# --- pre-flight: snapshot the stats lines + mtimes -----------------------------
AGENTS_LINE=$(capture_stats_line "$REPO_ROOT/AGENTS.md")
AGENTS_MTIME=$(capture_mtime "$REPO_ROOT/AGENTS.md")
CLAUDE_LINE=$(capture_stats_line "$REPO_ROOT/CLAUDE.md")
CLAUDE_MTIME=$(capture_mtime "$REPO_ROOT/CLAUDE.md")

# --- submit --------------------------------------------------------------------
echo "submitting analyze job for $REPO_PATH to $BASE_URL ..."
submit_body=$(curl -sS --fail-with-body -X POST "$BASE_URL/api/analyze" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"$REPO_PATH\"}") || die "submit request failed (is the gitnexus server reachable at $BASE_URL?)"

job_id=$(field_string "$submit_body" jobId)
[ -n "$job_id" ] || die "no jobId in submit response: $submit_body"
echo "job $job_id accepted"

# --- poll ----------------------------------------------------------------------
deadline=$(( $(date +%s) + TIMEOUT_SECS ))
last_line=""
while :; do
  body=$(curl -sS --fail-with-body "$BASE_URL/api/analyze/$job_id") || die "poll request failed for job $job_id"
  status=$(field_string "$body" status)
  [ -n "$status" ] || die "cannot parse job status, raw response: $body"

  percent=$(field_number "$body" percent)
  phase=$(field_string "$body" phase)
  line="${percent:-?}% ${phase:-$status}"
  if [ "$line" != "$last_line" ]; then
    echo "  $line"
    last_line=$line
  fi

  case $status in
    complete)
      echo "job $job_id complete"
      # Restore the stats lines the job rewrote (content + mtime), so the
      # repo stays clean and the index-freshness mtime signal stays true.
      restore_one AGENTS.md "$AGENTS_LINE" "$AGENTS_MTIME"
      restore_one CLAUDE.md "$CLAUDE_LINE" "$CLAUDE_MTIME"
      exit 0
      ;;
    failed|error|cancelled)
      die "job $job_id ended with status '$status': $body"
      ;;
  esac

  [ "$(date +%s)" -lt "$deadline" ] || die "timeout after ${TIMEOUT_SECS}s waiting for job $job_id (last: $line)"
  sleep "$POLL_INTERVAL"
done
