#!/usr/bin/env bash
set -euo pipefail

cd "$CLAUDE_PROJECT_DIR"

# Avoid infinite stop-hook loops.
if [[ "${LIBERATE_STOP_HOOK_ACTIVE:-}" == "1" ]]; then
  exit 0
fi
export LIBERATE_STOP_HOOK_ACTIVE=1

# Dormant until the app is scaffolded. Before package.json exists we are in
# read/planning mode, so this definition-of-done gate must not block stopping.
# It re-activates automatically once the build begins (package.json present).
if [[ ! -f package.json ]]; then
  exit 0
fi

missing=()

[[ -f CLAUDE.md ]] || missing+=("CLAUDE.md")
[[ -f package.json ]] || missing+=("package.json")
[[ -d src ]] || missing+=("src/")
[[ -d src/evals ]] || missing+=("src/evals/")
[[ -d src/prompts ]] || missing+=("src/prompts/")

if (( ${#missing[@]} > 0 )); then
  echo "Definition-of-done check failed. Missing: ${missing[*]}. Continue and create these before stopping." >&2
  exit 2
fi

if [[ -f package.json ]]; then
  node - <<'NODE' || exit 2
const pkg = require('./package.json');
const required = ['dev', 'test', 'eval'];
const missing = required.filter(s => !pkg.scripts || !pkg.scripts[s]);
if (missing.length) {
  console.error(`Definition-of-done check failed. Missing package scripts: ${missing.join(', ')}.`);
  process.exit(2);
}
NODE
fi

exit 0
