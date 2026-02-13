#!/usr/bin/env bash
# {{PLAN_NAME}} — Worktree Configuration
#
# Plan-specific batches. Sources generic library from .cursor/scripts/worktree-lib.sh
#
# Usage:
#   source <path-to-this-file>
#   wt_setup_batch 1
#   wt_merge_batch 1
#   wt_verify_batch 1
#   wt_cleanup_batch 1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$REPO")/worktrees}"

source "$REPO/.cursor/scripts/worktree-lib.sh"

BRANCH_PREFIX="{{BRANCH_PREFIX}}"

# Batch definitions: "worktree-name|agent-type|merge-commit-message"
BATCH_1=(
  "batch1-agent1|generalPurpose|feat(scope): description 1"
  "batch1-agent2|generalPurpose|feat(scope): description 2"
)

BATCH_2=(
  "batch2-agent1|generalPurpose|feat(scope): description 1"
)

# Add BATCH_3, BATCH_4, ... as needed

# Verification commands (run after each merge)
VERIFY_1="{{VERIFY_1}}"
VERIFY_2="{{VERIFY_2}}"
# VERIFY_3, VERIFY_4, ...

# Wrapper functions
wt_setup_batch() {
  local n="$1"
  local batch_var="BATCH_$n"
  wt_setup_entries "$batch_var" "$BRANCH_PREFIX"
}

wt_merge_batch() {
  local n="$1"
  local batch_var="BATCH_$n"
  wt_merge_entries "$batch_var" "$BRANCH_PREFIX"
}

wt_cleanup_batch() {
  local n="$1"
  local batch_var="BATCH_$n"
  wt_cleanup_entries "$batch_var" "$BRANCH_PREFIX" "${2:-}"
}

wt_verify_batch() {
  local n="$1"
  local verify_var="VERIFY_$n"
  wt_verify_cmd "${!verify_var}"
}

wt_list() {
  wt_list_all "$BRANCH_PREFIX"
}

wt_final_cleanup() {
  _wt_final_cleanup_impl "$BRANCH_PREFIX"
}
