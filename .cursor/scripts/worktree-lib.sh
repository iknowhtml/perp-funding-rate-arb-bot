#!/usr/bin/env bash
# Generic Worktree Library
#
# Reusable functions for parallel agent execution via git worktrees.
# Plan-specific configs source this file and define batch arrays.
#
# Requires: Bash 4.3+ (for nameref support via `local -n`)
#   macOS: brew install bash  (default /bin/bash is 3.x)
#   Linux: usually 4.x+ already
#
# Caller must set before sourcing (or use defaults):
#   REPO          - main repository path (default: git rev-parse --show-toplevel)
#   WORKTREE_ROOT - directory for worktrees (default: $(dirname REPO)/worktrees)
#
# Entry format per array element: "<worktree-name>|<agent-type>|<merge-commit-message>"
#
# API:
#   wt_setup_entries   <entries_arrayname> <branch_prefix>
#   wt_merge_entries   <entries_arrayname> <branch_prefix>
#   wt_cleanup_entries <entries_arrayname> <branch_prefix> [--force]
#   wt_verify_cmd      <command_string>
#   wt_list_all        <branch_prefix>
#   wt_final_cleanup   <branch_prefix>

set -euo pipefail

# ── Bash Version Check ────────────────────────────────────────────────

if [[ "${BASH_VERSINFO[0]}" -lt 4 ]] || { [[ "${BASH_VERSINFO[0]}" -eq 4 ]] && [[ "${BASH_VERSINFO[1]}" -lt 3 ]]; }; then
  echo "ERROR: Bash 4.3+ required (found ${BASH_VERSION}). On macOS: brew install bash" >&2
  return 1 2>/dev/null || exit 1
fi

# ── Paths (computed from git, with overrides) ─────────────────────────

REPO="${REPO:-$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/aki/Documents/Personal/Code/funding-rate-arb/funding-rate-arb-bot")}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$REPO")/worktrees}"

# ── Core Functions ────────────────────────────────────────────────────

wt_setup_entries() {
  local entries_var="$1"
  local branch_prefix="$2"

  mkdir -p "$WORKTREE_ROOT"
  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  local -n entries="$entries_var"
  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type _msg <<< "$entry"
    local branch="${branch_prefix}/${name}"
    local wt_path="${WORKTREE_ROOT}/${name}"

    # Idempotency: skip if worktree already exists
    if [[ -d "$wt_path" ]]; then
      echo "SKIP: Worktree already exists: $wt_path"
      continue
    fi

    echo "Creating worktree: $wt_path (branch: $branch)"
    if ! git worktree add "$wt_path" -b "$branch"; then
      echo "ERROR: Failed to create worktree $wt_path. Run wt_cleanup_entries before retrying." >&2
      cd "$orig_dir"
      return 1
    fi
  done

  cd "$orig_dir"
  echo "Worktrees ready."
}

wt_merge_entries() {
  local entries_var="$1"
  local branch_prefix="$2"

  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"
  git checkout main

  local -n entries="$entries_var"
  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type msg <<< "$entry"
    local branch="${branch_prefix}/${name}"

    echo "Merging $branch → main"
    if ! git merge "$branch" --no-ff -m "$msg"; then
      echo "" >&2
      echo "ERROR: Merge conflict on $branch." >&2
      echo "  Resolve: git status → edit conflicts → git add <files> → git merge --continue" >&2
      echo "  Abort:   git merge --abort" >&2
      cd "$orig_dir"
      return 1
    fi
  done

  cd "$orig_dir"
  echo "Merged."
}

wt_cleanup_entries() {
  local entries_var="$1"
  local branch_prefix="$2"
  local force="${3:-}"

  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  local -n entries="$entries_var"
  local had_errors=0
  local branch_delete_flag="-d"
  if [[ "$force" == "--force" ]]; then
    branch_delete_flag="-D"
  fi

  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type _msg <<< "$entry"
    local wt_path="${WORKTREE_ROOT}/${name}"
    local branch="${branch_prefix}/${name}"

    # Remove worktree
    if [[ -d "$wt_path" ]]; then
      echo "Removing worktree: $wt_path"
      if ! git worktree remove "$wt_path"; then
        echo "WARNING: Failed to remove worktree $wt_path (dirty?). Try: git worktree remove --force $wt_path" >&2
        had_errors=1
      fi
    fi

    # Remove branch
    if git rev-parse --verify "$branch" >/dev/null 2>&1; then
      echo "Deleting branch: $branch"
      if ! git branch "$branch_delete_flag" "$branch"; then
        echo "WARNING: Failed to delete branch $branch. Try wt_cleanup_entries with --force" >&2
        had_errors=1
      fi
    fi
  done

  cd "$orig_dir"

  if [[ "$had_errors" -eq 1 ]]; then
    echo "Cleanup completed with warnings (see above)." >&2
  else
    echo "Cleanup done."
  fi
}

wt_verify_cmd() {
  local cmd="$1"
  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  echo "Verifying: $cmd"
  bash -c "$cmd"
  local exit_code=$?
  cd "$orig_dir"
  return $exit_code
}

wt_list_all() {
  local branch_prefix="$1"
  echo "=== Git Worktrees ==="
  git -C "$REPO" worktree list
  echo ""
  echo "=== Branches (${branch_prefix}/*) ==="
  git -C "$REPO" branch --list "${branch_prefix}/*" 2>/dev/null || echo "(none)"
}

# Internal impl for plan configs that wrap with no-arg version
_wt_final_cleanup_impl() {
  local branch_prefix="$1"
  echo "=== Final Cleanup ==="
  git -C "$REPO" worktree list
  local branches
  branches=$(git -C "$REPO" branch --list "${branch_prefix}/*" 2>/dev/null || true)
  if [[ -n "$branches" ]]; then
    echo "WARNING: Stale branches found:" >&2
    echo "$branches" >&2
  else
    echo "No stale ${branch_prefix} branches."
  fi

  if [[ -d "$WORKTREE_ROOT" ]]; then
    if rmdir "$WORKTREE_ROOT" 2>/dev/null; then
      echo "Removed empty worktree root: $WORKTREE_ROOT"
    else
      echo "WARNING: Worktree root not empty: $WORKTREE_ROOT" >&2
      ls -la "$WORKTREE_ROOT" >&2
    fi
  fi
  echo "Done."
}

# Public API: wt_final_cleanup <branch_prefix>
wt_final_cleanup() {
  _wt_final_cleanup_impl "$1"
}
