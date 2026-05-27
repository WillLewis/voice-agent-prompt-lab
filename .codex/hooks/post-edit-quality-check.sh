#!/usr/bin/env bash
set -euo pipefail

# Lightweight post-edit check. Non-blocking by default because PostToolUse cannot undo writes.
cd "$CLAUDE_PROJECT_DIR"

if [[ ! -f package.json ]]; then
  exit 0
fi

# Run the fastest safe checks if scripts exist.
has_script() {
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$1'] ? 0 : 1)" 2>/dev/null
}

if has_script typecheck; then
  npm run typecheck -- --pretty false >/tmp/liberate-typecheck.log 2>&1 || {
    echo "Typecheck failed after edit. Review /tmp/liberate-typecheck.log" >&2
    exit 1
  }
fi

exit 0
