#!/usr/bin/env bash
# Phase 0 — Worktree Configuration
#
# Centralizes all paths, branch names, and batch definitions for the
# parallel execution plan. Source this file from the main worktree root
# before running batch setup/merge/cleanup commands.
#
# Requires: Bash 4.3+ (for nameref support via `local -n`)
#   macOS: brew install bash  (default /bin/bash is 3.x)
#   Linux: usually 4.x+ already
#
# Usage:
#   source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh
#
# Then call helper functions:
#   wt_setup_batch 1          # Create worktrees for batch 1
#   wt_merge_batch 1          # Merge all branches in batch 1 into main
#   wt_cleanup_batch 1        # Remove worktrees + delete branches
#   wt_verify_batch 1         # Run typecheck + tests + biome on main
#
# Recovery:
#   If wt_setup_batch fails mid-batch, run wt_cleanup_batch <N> before retrying.
#   If wt_merge_batch fails (conflict), resolve manually then retry or --abort.

set -euo pipefail

# ── Bash Version Check ────────────────────────────────────────────────

if [[ "${BASH_VERSINFO[0]}" -lt 4 ]] || { [[ "${BASH_VERSINFO[0]}" -eq 4 ]] && [[ "${BASH_VERSINFO[1]}" -lt 3 ]]; }; then
  echo "ERROR: Bash 4.3+ required (found ${BASH_VERSION}). On macOS: brew install bash" >&2
  return 1 2>/dev/null || exit 1
fi

# ── Paths (computed from git, with overrides) ─────────────────────────

REPO="${REPO:-$(git rev-parse --show-toplevel 2>/dev/null || echo "/Users/aki/Documents/Personal/Code/funding-rate-arb/funding-rate-arb-bot")}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$REPO")/worktrees}"

# ── Branch Prefix ──────────────────────────────────────────────────────

BRANCH_PREFIX="phase0"

# ── Batch Definitions ──────────────────────────────────────────────────
#
# Format per entry: "<worktree-name>|<agent-type>|<merge-commit-message>"
# Worktree path:  $WORKTREE_ROOT/<worktree-name>
# Branch name:    $BRANCH_PREFIX/<worktree-name>

BATCH_1=(
  "batch1-deps|shell|feat(phase0): install viem and @gmx-io/sdk dependencies"
  "batch1-env|generalPurpose|feat(phase0): add Arbitrum/GMX env schema and config"
  "batch1-db|generalPurpose|feat(phase0): add market_snapshot and execution_estimate tables"
)

BATCH_2=(
  "batch2-chain|generalPurpose|feat(phase0): chain infrastructure — viem clients and RPC health"
  "batch2-gmx|generalPurpose|feat(phase0): GMX adapter — contracts, REST client, Reader helpers"
)

BATCH_3=(
  "batch3-collector|generalPurpose|feat(phase0): data collector service with scheduler"
  "batch3-sampler|generalPurpose|feat(phase0): impact sampler with simulateExecuteOrder"
)

BATCH_4=(
  "batch4-analysis|generalPurpose|feat(phase0): impact distribution metrics and go/no-go check"
)

# Quality gate — no worktrees, runs on main (read-only agents)
BATCH_5_AGENTS=("code-reviewer" "typescript-checker" "biome-checker")

# ── Batch Lookup ───────────────────────────────────────────────────────

_get_batch_array() {
  local batch_num="$1"
  case "$batch_num" in
    1) echo "BATCH_1" ;;
    2) echo "BATCH_2" ;;
    3) echo "BATCH_3" ;;
    4) echo "BATCH_4" ;;
    *) echo ""; return 1 ;;
  esac
}

# ── File Ownership Matrix ─────────────────────────────────────────────
#
# Used for conflict resolution — the owning agent's changes take priority.
#
# batch1-deps:      package.json, pnpm-lock.yaml
# batch1-env:       src/lib/env/schema.ts, src/lib/config.ts, .env.example
# batch1-db:        src/lib/db/schema.ts
# batch2-chain:     src/lib/chain/*
# batch2-gmx:       src/adapters/gmx/*
# batch3-collector:  src/worker/data-collector.ts, src/worker/data-collector.test.ts
# batch3-sampler:   src/worker/impact-sampler.ts, src/worker/impact-sampler.test.ts
# batch4-analysis:  src/worker/impact-analysis.ts, src/worker/impact-analysis.test.ts

# ── Helper Functions ───────────────────────────────────────────────────

wt_setup_batch() {
  local batch_num="$1"
  local batch_var
  batch_var=$(_get_batch_array "$batch_num") || { echo "ERROR: Invalid batch: $batch_num" >&2; return 1; }

  mkdir -p "$WORKTREE_ROOT"
  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  local -n entries="$batch_var"
  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type _msg <<< "$entry"
    local branch="${BRANCH_PREFIX}/${name}"
    local wt_path="${WORKTREE_ROOT}/${name}"

    # Idempotency: skip if worktree already exists
    if [[ -d "$wt_path" ]]; then
      echo "SKIP: Worktree already exists: $wt_path"
      continue
    fi

    echo "Creating worktree: $wt_path (branch: $branch)"
    if ! git worktree add "$wt_path" -b "$branch"; then
      echo "ERROR: Failed to create worktree $wt_path. Run wt_cleanup_batch $batch_num before retrying." >&2
      cd "$orig_dir"
      return 1
    fi
  done

  cd "$orig_dir"
  echo "Batch $batch_num worktrees ready."
}

wt_merge_batch() {
  local batch_num="$1"
  local batch_var
  batch_var=$(_get_batch_array "$batch_num") || { echo "ERROR: Invalid batch: $batch_num" >&2; return 1; }

  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"
  git checkout main

  local -n entries="$batch_var"
  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type msg <<< "$entry"
    local branch="${BRANCH_PREFIX}/${name}"

    echo "Merging $branch → main"
    if ! git merge "$branch" --no-ff -m "$msg"; then
      echo "" >&2
      echo "ERROR: Merge conflict on $branch." >&2
      echo "  Resolve: git status → edit conflicts → git add <files> → git merge --continue" >&2
      echo "  Abort:   git merge --abort" >&2
      echo "  Then retry: wt_merge_batch $batch_num" >&2
      cd "$orig_dir"
      return 1
    fi
  done

  cd "$orig_dir"
  echo "Batch $batch_num merged."
}

wt_cleanup_batch() {
  local batch_num="$1"
  local force="${2:-}"
  local batch_var
  batch_var=$(_get_batch_array "$batch_num") || { echo "ERROR: Invalid batch: $batch_num" >&2; return 1; }

  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  local -n entries="$batch_var"
  local had_errors=0
  local branch_delete_flag="-d"
  if [[ "$force" == "--force" ]]; then
    branch_delete_flag="-D"
  fi

  for entry in "${entries[@]}"; do
    IFS='|' read -r name _agent_type _msg <<< "$entry"
    local wt_path="${WORKTREE_ROOT}/${name}"
    local branch="${BRANCH_PREFIX}/${name}"

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
        echo "WARNING: Failed to delete branch $branch. Try: wt_cleanup_batch $batch_num --force" >&2
        had_errors=1
      fi
    fi
  done

  cd "$orig_dir"

  if [[ "$had_errors" -eq 1 ]]; then
    echo "Batch $batch_num cleanup completed with warnings (see above)." >&2
  else
    echo "Batch $batch_num cleaned up."
  fi
}

wt_verify_batch() {
  local batch_num="$1"
  local orig_dir
  orig_dir=$(pwd)
  cd "$REPO"

  echo "Verifying batch $batch_num..."
  case "$batch_num" in
    1) pnpm install && pnpm typecheck && pnpm biome check . ;;
    2) pnpm typecheck && pnpm test:run src/lib/chain/ src/adapters/gmx/ && pnpm biome check . ;;
    3) pnpm typecheck && pnpm test:run src/worker/data-collector.test.ts src/worker/impact-sampler.test.ts && pnpm biome check . ;;
    4) pnpm typecheck && pnpm test:run src/worker/impact-analysis.test.ts && pnpm biome check . ;;
    *) echo "No verification defined for batch $batch_num" >&2; cd "$orig_dir"; return 1 ;;
  esac

  local exit_code=$?
  cd "$orig_dir"
  return $exit_code
}

wt_list() {
  echo "=== Git Worktrees ==="
  git -C "$REPO" worktree list
  echo ""
  echo "=== Phase 0 Branches ==="
  git -C "$REPO" branch --list "${BRANCH_PREFIX}/*" || echo "(none)"
}

wt_final_cleanup() {
  echo "=== Final Cleanup ==="
  git -C "$REPO" worktree list
  local branches
  branches=$(git -C "$REPO" branch --list "${BRANCH_PREFIX}/*" 2>/dev/null || true)
  if [[ -n "$branches" ]]; then
    echo "WARNING: Stale branches found:" >&2
    echo "$branches" >&2
  else
    echo "No stale phase0 branches."
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

# ── Usage Info ─────────────────────────────────────────────────────────

if [[ "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Phase 0 Worktree Config — Helper Functions

  wt_setup_batch <N>            Create worktrees for batch N (1–4)
  wt_merge_batch <N>            Merge all batch N branches into main
  wt_cleanup_batch <N> [--force] Remove worktrees + delete branches (--force for unmerged)
  wt_verify_batch <N>           Run typecheck + tests + biome for batch N
  wt_list                       Show current worktrees and phase0 branches
  wt_final_cleanup              Verify no stale worktrees/branches remain

Recovery:
  If setup fails mid-batch:  wt_cleanup_batch <N> && wt_setup_batch <N>
  If merge conflicts:        resolve → git merge --continue → retry wt_merge_batch <N>
  If cleanup fails:          wt_cleanup_batch <N> --force

Workflow:
  source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh
  wt_setup_batch 1       # create worktrees
  # ... launch agents ...
  wt_merge_batch 1       # merge branches
  wt_verify_batch 1      # run checks
  wt_cleanup_batch 1     # remove worktrees + branches
  wt_setup_batch 2       # next batch
  # ... repeat ...

Environment Overrides:
  REPO=<path>           Override repo path (default: git rev-parse --show-toplevel)
  WORKTREE_ROOT=<path>  Override worktree root (default: ../worktrees relative to REPO)
USAGE
fi
