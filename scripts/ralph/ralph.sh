#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
#
# Usage: ./ralph.sh [max_iterations] [options]
#
# SAFETY: This script runs `claude --dangerously-skip-permissions`. Only run
# inside a dedicated repository or git worktree where any file modification or
# shell command the agent decides to issue would be acceptable. Do NOT run in
# $HOME or any tree containing unrelated work.
#
# By default Ralph only commits locally. Pushing the branch (--push) and
# opening a pull request (--pr) are opt-in.

set -euo pipefail

DEFAULT_MAX_ITERATIONS=10
DEFAULT_TIMEOUT="30m"
DEFAULT_STUCK_LIMIT=2

MAX_ITERATIONS=$DEFAULT_MAX_ITERATIONS
TIMEOUT="$DEFAULT_TIMEOUT"
STUCK_LIMIT=$DEFAULT_STUCK_LIMIT
PUSH_ON_COMPLETE=0
OPEN_PR=0

usage() {
  cat <<EOF
Ralph - autonomous Claude Code loop

Usage: ralph.sh [max_iterations] [options]

Positional:
  max_iterations        Maximum loop iterations (default: $DEFAULT_MAX_ITERATIONS)

Options:
  --timeout <duration>  Per-iteration timeout passed to coreutils \`timeout\`
                        (default: $DEFAULT_TIMEOUT, e.g. 45m, 1h, 90s)
  --stuck-limit <n>     Consecutive no-op iterations (no new commit, no status
                        signal) tolerated before aborting (default: $DEFAULT_STUCK_LIMIT)
  --push                Push the branch to origin when the loop completes
                        (default: off, commits stay local)
  --pr                  Push the branch and open a pull request when the loop
                        completes (implies --push; default: off)
  --no-push, --no-pr    Accepted for compatibility; not pushing is the default
  -h, --help            Show this help

Completion protocol:
  The agent signals end-of-run by writing .ralph-status.json next to ralph.sh:
    {"status": "complete"}                      -> exit 0 (push/PR only with --push/--pr)
    {"status": "blocked", "reason": "<text>"}   -> exit 2, no push

Exit codes:
  0  all stories complete
  1  reached max iterations without completion
  2  agent reported blocked
  3  uncommitted changes in working tree at iteration start
  6  too many consecutive no-op iterations
  64 invalid arguments

WARNING: Runs claude with --dangerously-skip-permissions. Confine to a dedicated repo or worktree.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --timeout)
      [[ $# -ge 2 ]] || { echo "--timeout requires a value" >&2; exit 64; }
      TIMEOUT="$2"
      shift 2
      ;;
    --stuck-limit)
      [[ $# -ge 2 ]] || { echo "--stuck-limit requires a value" >&2; exit 64; }
      [[ "$2" =~ ^[0-9]+$ ]] || { echo "--stuck-limit must be an integer" >&2; exit 64; }
      STUCK_LIMIT="$2"
      shift 2
      ;;
    --push)
      PUSH_ON_COMPLETE=1
      shift
      ;;
    --pr)
      PUSH_ON_COMPLETE=1
      OPEN_PR=1
      shift
      ;;
    --no-push)
      PUSH_ON_COMPLETE=0
      OPEN_PR=0
      shift
      ;;
    --no-pr)
      OPEN_PR=0
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 64
      fi
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
STATUS_FILE="$SCRIPT_DIR/.ralph-status.json"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Required command not found: $1" >&2; exit 1; }
}

require jq
require claude
require git

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout"
else
  echo "timeout not found. On macOS: brew install coreutils (provides gtimeout)." >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ralph.sh must run inside a git repository" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"

ensure_clean_tree() {
  if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
    echo "Uncommitted changes in the working tree. Ralph requires a clean tree before each iteration." >&2
    git -C "$REPO_ROOT" status --short >&2
    echo "Resolve manually (commit, stash, or reset) and re-run." >&2
    exit 3
  fi
}

# Archive previous run if the branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$STATUS_FILE" ] && cp "$STATUS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# Clear stale status file from a previous run
rm -f "$STATUS_FILE"

echo "Starting Ralph"
echo "  max iterations: $MAX_ITERATIONS"
echo "  per-iteration timeout: $TIMEOUT"
echo "  stuck limit: $STUCK_LIMIT"
echo "  push on complete: $PUSH_ON_COMPLETE"
echo "  open PR on complete: $OPEN_PR"

STUCK_COUNTER=0

resolve_base_branch() {
  if command -v gh >/dev/null 2>&1; then
    gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null && return 0
  fi
  if git -C "$REPO_ROOT" symbolic-ref refs/remotes/origin/HEAD >/dev/null 2>&1; then
    git -C "$REPO_ROOT" symbolic-ref refs/remotes/origin/HEAD | sed 's|^refs/remotes/origin/||'
    return 0
  fi
  echo "main"
}

finalize_complete() {
  local branch
  branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)

  if [ "$PUSH_ON_COMPLETE" -ne 1 ]; then
    echo "Not pushing (pass --push or --pr to push). Branch $branch is complete locally."
    return 0
  fi

  echo "Pushing branch $branch..."
  if ! git -C "$REPO_ROOT" push -u origin "$branch"; then
    echo "Push failed. The branch is complete locally but not on the remote." >&2
    return 4
  fi

  if [ "$OPEN_PR" -ne 1 ]; then
    echo "Not opening a PR (pass --pr to open one). Branch pushed."
    return 0
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI not found. Branch pushed but no PR opened." >&2
    return 0
  fi

  if gh pr view "$branch" >/dev/null 2>&1; then
    echo "PR already exists:"
    gh pr view "$branch" --json url --jq '.url'
    return 0
  fi

  local title body base
  title=$(jq -r '.description // .project // "Ralph run"' "$PRD_FILE")
  body=$(jq -r '.description // "Automated Ralph run."' "$PRD_FILE")
  base=$(resolve_base_branch)

  if ! gh pr create --title "$title" --body "$body" --base "$base" --head "$branch"; then
    echo "Failed to open PR. Branch is pushed; open it manually." >&2
    return 5
  fi
}

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "==============================================================="

  ensure_clean_tree

  HEAD_BEFORE=$(git -C "$REPO_ROOT" rev-parse HEAD)
  rm -f "$STATUS_FILE"

  ITER_START=$(date +%s)

  set +e
  $TIMEOUT_CMD "$TIMEOUT" claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee /dev/stderr
  CLAUDE_EXIT=${PIPESTATUS[0]}
  set -e

  ITER_DURATION=$(( $(date +%s) - ITER_START ))

  if [ "$CLAUDE_EXIT" -eq 124 ]; then
    echo "Iteration $i timed out after $TIMEOUT (${ITER_DURATION}s wall)" >&2
  elif [ "$CLAUDE_EXIT" -ne 0 ]; then
    echo "Iteration $i: claude exited with code $CLAUDE_EXIT (${ITER_DURATION}s wall)" >&2
  else
    echo "Iteration $i: claude exited 0 (${ITER_DURATION}s wall)"
  fi

  if [ -f "$STATUS_FILE" ]; then
    STATUS=$(jq -r '.status // empty' "$STATUS_FILE" 2>/dev/null || echo "")
    case "$STATUS" in
      complete)
        echo ""
        echo "Ralph signaled complete at iteration $i of $MAX_ITERATIONS"
        finalize_complete
        exit 0
        ;;
      blocked)
        REASON=$(jq -r '.reason // "no reason given"' "$STATUS_FILE" 2>/dev/null || echo "")
        echo ""
        echo "Ralph signaled blocked at iteration $i: $REASON" >&2
        exit 2
        ;;
    esac
  fi

  HEAD_AFTER=$(git -C "$REPO_ROOT" rev-parse HEAD)
  if [ "$HEAD_BEFORE" = "$HEAD_AFTER" ]; then
    STUCK_COUNTER=$((STUCK_COUNTER + 1))
    echo "No commit produced this iteration (stuck $STUCK_COUNTER/$STUCK_LIMIT)" >&2
    if [ "$STUCK_COUNTER" -ge "$STUCK_LIMIT" ]; then
      echo "Aborting: $STUCK_COUNTER consecutive no-op iterations." >&2
      exit 6
    fi
  else
    STUCK_COUNTER=0
    echo "Iteration $i committed: $(git -C "$REPO_ROOT" log -1 --oneline)"
  fi
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without signaling complete."
echo "Check $PROGRESS_FILE and $STATUS_FILE for status."
exit 1
