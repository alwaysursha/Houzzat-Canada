#!/usr/bin/env bash
# Shared Fast/Full MLS lock helpers for the Sync Mac launchd scripts.
# Source this file. Do not execute it.
#
# Same-job: mkdir is the atomic acquire. A second live process skips.
# Cross-job: Fast skips while Full is held. Full waits for Fast, then runs.
# Neither script kills the other. A dead pid, or a pid-less lock older than
# MLS_LOCK_STALE_SECONDS, is recovered so a crash cannot stall sync forever.

# macOS /bin/bash is 3.2 (no BASHPID). $$ inside ( ) is the parent.
# A direct `sh -c 'echo $PPID'` child prints this process. Do not wrap that
# sh in $(...), or the recorded pid is the short-lived substitution shell.
mls_lock_write_self_pid() {
  local dest="$1"
  sh -c 'echo $PPID' >"$dest"
}

mls_lock_dir_mtime() {
  local dir="$1"
  stat -f %m "$dir" 2>/dev/null || stat -c %Y "$dir"
}

mls_lock_read_pid() {
  local dir="$1"
  if [[ -f "$dir/pid" ]]; then
    tr -d '[:space:]' <"$dir/pid" || true
  fi
}

mls_lock_pid_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

# 0 = a live owner holds the lock (or a recent legacy lock with no pid file).
mls_lock_is_held() {
  local dir="$1"
  [[ -d "$dir" ]] || return 1
  local pid
  pid="$(mls_lock_read_pid "$dir")"
  if [[ -n "$pid" ]]; then
    if mls_lock_pid_alive "$pid"; then
      return 0
    fi
    return 1
  fi
  local stale_after="${MLS_LOCK_STALE_SECONDS:-10800}"
  local now mtime age
  now="$(date +%s)"
  mtime="$(mls_lock_dir_mtime "$dir")"
  age=$((now - mtime))
  if ((age >= stale_after)); then
    return 1
  fi
  return 0
}

# 0 = acquired. 1 = live owner already holds it.
mls_lock_acquire() {
  local dir="$1"
  local label="$2"
  if mkdir "$dir" 2>/dev/null; then
    mls_lock_write_self_pid "$dir/pid"
    return 0
  fi
  if mls_lock_is_held "$dir"; then
    local pid
    pid="$(mls_lock_read_pid "$dir")"
    echo "SKIP: another ${label} is already running (pid=${pid:-missing})"
    return 1
  fi
  local pid
  pid="$(mls_lock_read_pid "$dir")"
  echo "STALE: ${label} lock pid=${pid:-missing} is not running — recovering"
  rm -rf "$dir"
  if mkdir "$dir" 2>/dev/null; then
    mls_lock_write_self_pid "$dir/pid"
    echo "RECOVERED: ${label} lock"
    return 0
  fi
  echo "SKIP: another ${label} acquired the lock during recovery"
  return 1
}

# Remove the lock only when this process owns it, or it has no pid file.
mls_lock_release() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  local pid self tmp
  pid="$(mls_lock_read_pid "$dir")"
  tmp="$(mktemp)"
  mls_lock_write_self_pid "$tmp"
  self="$(tr -d '[:space:]' <"$tmp")"
  rm -f "$tmp"
  if [[ -z "$pid" || "$pid" == "$self" ]]; then
    rm -rf "$dir"
  fi
}

# Fast entry. 0 = this process holds the fast lock and Full is not running.
# Non-zero = skip. Does not kill Full.
mls_fast_prepare() {
  local full_lock="$1"
  local fast_lock="$2"
  if mls_lock_is_held "$full_lock"; then
    local pid
    pid="$(mls_lock_read_pid "$full_lock")"
    echo "SKIP: full mls-sync is running (pid=${pid:-missing}); fast sync will not overlap"
    return 10
  fi
  if ! mls_lock_acquire "$fast_lock" "mls-fast-sync"; then
    return 11
  fi
  if mls_lock_is_held "$full_lock"; then
    local pid
    pid="$(mls_lock_read_pid "$full_lock")"
    echo "SKIP: full mls-sync became active (pid=${pid:-missing}); releasing fast lock so the jobs do not overlap"
    mls_lock_release "$fast_lock"
    return 10
  fi
  return 0
}

# Full entry. Acquires the full lock, then waits for Fast to finish.
# 0 = safe to run MLS. 12 = Fast still alive after the wait; full lock released.
# Does not kill Fast.
mls_full_prepare() {
  local full_lock="$1"
  local fast_lock="$2"
  if ! mls_lock_acquire "$full_lock" "mls-sync"; then
    return 11
  fi
  local wait_seconds="${MLS_FULL_WAIT_FOR_FAST_SECONDS:-1200}"
  local poll="${MLS_LOCK_POLL_SECONDS:-5}"
  local waited=0
  while mls_lock_is_held "$fast_lock"; do
    local pid
    pid="$(mls_lock_read_pid "$fast_lock")"
    if ((waited >= wait_seconds)); then
      echo "SKIP: mls-fast-sync still running (pid=${pid:-missing}) after ${wait_seconds}s; deferring full sync until the next launchd tick"
      mls_lock_release "$full_lock"
      return 12
    fi
    echo "DEFER: waiting for mls-fast-sync (pid=${pid:-missing}) so full sync does not overlap (${waited}s/${wait_seconds}s)"
    sleep "$poll"
    waited=$((waited + poll))
  done
  return 0
}
