#!/bin/bash
# Watches an iCloud Drive folder for a new Strong CSV export and, if its content
# differs from what's committed, copies it in, commits, and pushes to origin/main.
# Invoked by the com.ys-math.strength-training.sync LaunchAgent (WatchPaths + daily
# fallback) — see scripts/com.ys-math.strength-training.sync.plist.
set -uo pipefail

# launchd's environment is minimal (no Homebrew, no shell profile) — set PATH explicitly.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$PATH"

REPO_DIR="/Users/yutosasaki/github/strength-training"
SOURCE_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/StrongExports"
DEST_FILE="$REPO_DIR/strong_workouts.csv"
LOG_FILE="$HOME/Library/Logs/strength-training-sync.log"
LOCK_DIR="/tmp/strength-training-sync.lock"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"; }

# mkdir is atomic on POSIX filesystems, unlike flock (not available on macOS by
# default) — this is the lock.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "SKIP: another sync run is already in progress"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null' EXIT

if [ ! -d "$SOURCE_DIR" ]; then
  log "ERROR: watched folder not found: $SOURCE_DIR"
  exit 1
fi

cd "$REPO_DIR" || { log "ERROR: cannot cd to $REPO_DIR"; exit 1; }

# Retry a previously-failed push before looking at new data — otherwise a commit
# that landed locally but failed to push would look like "no change" forever.
git fetch -q origin main 2>/dev/null
ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "${ahead:-0}" -gt 0 ]; then
  if git push -q origin main; then
    log "OK: pushed $ahead previously-committed change(s) that failed to push earlier"
  else
    log "ERROR: retry push still failing ($ahead commit(s) ahead of origin/main)"
  fi
fi

# Newest .csv in the watched folder, by modification time.
candidate=$(find "$SOURCE_DIR" -maxdepth 1 -iname '*.csv' -type f -print0 \
  | xargs -0 ls -t 2>/dev/null | head -n1)

if [ -z "${candidate:-}" ]; then
  log "INFO: no CSV found in $SOURCE_DIR yet"
  exit 0
fi

# iCloud may present a not-yet-downloaded file as a zero-byte placeholder (or a
# sibling ".<name>.icloud" stub). Force materialization, then wait for the file
# size to stabilize before treating it as complete.
placeholder="$(dirname "$candidate")/.$(basename "$candidate").icloud"
if [ -e "$placeholder" ] || [ ! -s "$candidate" ]; then
  log "INFO: $candidate looks like an iCloud placeholder, forcing download"
  brctl download "$candidate" >/dev/null 2>&1
fi

size1=$(stat -f%z "$candidate" 2>/dev/null || echo 0)
sleep 2
size2=$(stat -f%z "$candidate" 2>/dev/null || echo 0)
if [ "$size1" != "$size2" ] || [ "$size2" = 0 ]; then
  log "INFO: $candidate still downloading/changing size, will retry next run"
  exit 0
fi

new_hash=$(shasum -a 256 "$candidate" | awk '{print $1}')
old_hash=""
[ -f "$DEST_FILE" ] && old_hash=$(shasum -a 256 "$DEST_FILE" | awk '{print $1}')

if [ "$new_hash" = "$old_hash" ]; then
  log "INFO: no change ($(basename "$candidate") matches committed strong_workouts.csv)"
  exit 0
fi

cp "$candidate" "$DEST_FILE"

git add strong_workouts.csv
if git diff --cached --quiet; then
  log "INFO: copied $(basename "$candidate") but git saw no diff (unexpected)"
  exit 0
fi

commit_msg="Sync workout data from Strong export ($(basename "$candidate"))"
if ! git commit -q -m "$commit_msg"; then
  log "ERROR: git commit failed"
  exit 1
fi

if git push -q origin main; then
  log "OK: committed and pushed $(basename "$candidate") (${new_hash:0:12})"
else
  log "ERROR: git push failed — commit is local only, will retry to push next run"
  exit 1
fi
