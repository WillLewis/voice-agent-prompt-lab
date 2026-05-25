# Recommended Claude Code Hooks

These hooks are optional but useful. They are designed to keep Claude Code focused on a lightweight interview demo and prevent scope creep.

Copy `.claude/settings.json` and `.claude/hooks/` into the repo root.

## Recommended hooks

### 1. PreToolUse — block dangerous or scope-creeping commands

Purpose:
- prevent accidental deletion
- prevent `.env` reads/writes
- prevent production/cloud/deployment work
- prevent installing telephony/database/auth infra unless explicitly overridden

File:
- `.claude/hooks/prevent-scope-creep.sh`

### 2. PostToolUse — run lightweight formatting/type checks after edits

Purpose:
- keep the app clean as Claude writes code
- surface errors early
- avoid waiting until the end to discover broken TypeScript

File:
- `.claude/hooks/post-edit-quality-check.sh`

### 3. Stop — validate definition of done before Claude finishes

Purpose:
- remind Claude to run tests/evals/build
- force completion if required files are missing
- avoid incomplete “looks done” states

File:
- `.claude/hooks/stop-validate-demo.sh`

## Hook philosophy

Use hooks for enforceable rules:
- scope control
- security hygiene
- test/eval gates
- definition of done

Do not use hooks for everything. The `CLAUDE.md` file provides project-level guidance. Hooks should enforce only the rules that matter enough to block or warn.

## Manual override

If a hook blocks something you intentionally want, edit the relevant script and add an explicit allow-list comment with the reason. Do not bypass hooks by deleting them unless the project direction changes.
