#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$HOME/.ai-code-studio/worktrees"
REGISTRY="$HOME/.ai-code-studio/worktrees.json"

usage() {
  echo "Usage: $0 [list|orphaned|all]"
  echo "  list     - Show all worktrees with status"
  echo "  orphaned - Remove worktrees not belonging to active sessions"
  echo "  all      - Remove ALL worktrees (dangerous)"
  exit 1
}

if [ $# -eq 0 ]; then
  usage
fi

CMD="${1:-}"

case "$CMD" in
  list)
    if [ ! -d "$BASE_DIR" ]; then
      echo "No worktrees directory found."
      exit 0
    fi
    echo "Worktrees in $BASE_DIR:"
    echo "----------------------"
    for dir in "$BASE_DIR"/*; do
      [ -d "$dir" ] || continue
      name=$(basename "$dir")
      size=$(du -sh "$dir" 2>/dev/null | cut -f1)
      echo "  $name  ($size)"
    done
    if [ -f "$REGISTRY" ]; then
      echo ""
      echo "Registry entries:"
      cat "$REGISTRY" | node -e '
        const data = JSON.parse(require("fs").readFileSync(0, "utf-8"));
        data.filter(e => !e.removedAt).forEach(e => {
          console.log(`  ${e.sessionId}  ${e.repoFullName}  ${e.branch}  ${new Date(e.createdAt).toISOString()}`);
        });
      ' 2>/dev/null || cat "$REGISTRY"
    fi
    ;;

  orphaned)
    if [ ! -d "$BASE_DIR" ]; then
      echo "No worktrees directory found."
      exit 0
    fi
    removed=0
    for dir in "$BASE_DIR"/*; do
      [ -d "$dir" ] || continue
      name=$(basename "$dir")
      # Check if this worktree is referenced by an active backend process
      # We just remove everything not in the registry, or flagged as removed
      in_registry=false
      if [ -f "$REGISTRY" ]; then
        if node -e "
          const data = JSON.parse(require('fs').readFileSync('$REGISTRY', 'utf-8'));
          const entry = data.find(e => e.sessionId === '$name');
          process.exit(entry && !entry.removedAt ? 0 : 1);
        " 2>/dev/null; then
          in_registry=true
        fi
      fi

      if [ "$in_registry" = "false" ]; then
        echo "Removing orphaned worktree: $dir"
        rm -rf "$dir"
        removed=$((removed + 1))
      fi
    done
    echo "Removed $removed orphaned worktree(s)."
    ;;

  all)
    echo "WARNING: This will delete ALL worktrees in $BASE_DIR"
    read -p "Are you sure? [y/N] " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
      rm -rf "$BASE_DIR"
      rm -f "$REGISTRY"
      echo "All worktrees removed."
    else
      echo "Aborted."
    fi
    ;;

  *)
    usage
    ;;
esac
