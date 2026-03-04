#!/usr/bin/env bash
# Phase 1-01 — Transaction Lifecycle (0001)
#
# Plan: plan.md (in this directory)
# Batches: chain-infra (errors + gas + tx-builder) → tx-sender. Code-review and
# lifecycle-management run on main after Batch 2 merge.
#
# Usage:
#   source docs/plans/active/0002-on-chain-pivot/01-mvp-execution/0001-transaction-lifecycle/worktree-config.sh
#   wt_setup_batch 1
#   wt_merge_batch 1
#   wt_verify_batch 1
#   wt_cleanup_batch 1
#
# Recovery:
#   If setup fails mid-batch: wt_cleanup_batch N && wt_setup_batch N
#   If merge conflicts: resolve → git add → git merge --continue
#   If cleanup fails: wt_cleanup_batch N --force

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Allow REPO override so merge/verify/cleanup can run from main repo when plan lives in a worktree
REPO="${REPO:-$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)}"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$REPO")/worktrees}"

source "$REPO/.cursor/scripts/worktree-lib.sh"

BRANCH_PREFIX="phase1-01"

# Batch definitions: "worktree-name|agent-type|merge-commit-message"
# Batch 1: One agent (chain-errors + gas-estimation + tx-builder) to avoid index.ts overlap.
BATCH_1=(
  "batch1-chain-infra|generalPurpose|feat(chain): ChainError, gas estimation, tx-builder"
)

BATCH_2=(
  "batch2-tx-sender|generalPurpose|feat(chain): tx-sender simulate → send → waitForReceipt"
)

# Verification commands (run after each merge)
VERIFY_1="pnpm typecheck && pnpm test:run src/lib/chain/errors/ src/lib/chain/gas/ src/lib/chain/tx-builder/ && pnpm biome check ."
VERIFY_2="pnpm typecheck && pnpm test:run src/lib/chain/ && pnpm biome check ."

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
