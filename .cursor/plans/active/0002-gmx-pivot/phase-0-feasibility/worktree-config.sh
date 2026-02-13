#!/usr/bin/env bash
# Phase 0 — Worktree Configuration
#
# Plan-specific batches. Sources generic library from .cursor/scripts/worktree-lib.sh
#
# Usage:
#   source .cursor/plans/active/0002-gmx-pivot/phase-0-feasibility/worktree-config.sh
#   wt_setup_batch 1
#   wt_merge_batch 1
#   wt_verify_batch 1
#   wt_cleanup_batch 1
#
# Recovery:
#   If setup fails mid-batch: wt_cleanup_batch N && wt_setup_batch N
#   If merge conflicts: resolve → git merge --continue → retry wt_merge_batch N
#   If cleanup fails: wt_cleanup_batch N --force

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR" && git rev-parse --show-toplevel)"
WORKTREE_ROOT="${WORKTREE_ROOT:-$(dirname "$REPO")/worktrees}"

source "$REPO/.cursor/scripts/worktree-lib.sh"

BRANCH_PREFIX="phase0"

# Batch definitions: "worktree-name|agent-type|merge-commit-message"
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

# Verification commands (run after each merge)
VERIFY_1="pnpm install && pnpm typecheck && pnpm biome check ."
VERIFY_2="pnpm typecheck && pnpm test:run src/lib/chain/ src/adapters/gmx/ && pnpm biome check ."
VERIFY_3="pnpm typecheck && pnpm test:run src/worker/data-collector.test.ts src/worker/impact-sampler.test.ts && pnpm biome check ."
VERIFY_4="pnpm typecheck && pnpm test:run src/worker/impact-analysis.test.ts && pnpm biome check ."

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
