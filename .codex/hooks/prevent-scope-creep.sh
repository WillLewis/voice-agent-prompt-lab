#!/usr/bin/env bash
set -euo pipefail

# Reads Claude Code hook JSON from stdin. Blocks dangerous or scope-creeping Bash commands.
payload="$(cat)"
command="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

lower="$(printf '%s' "$command" | tr '[:upper:]' '[:lower:]')"

block() {
  echo "Blocked by Liberate Prompt Lab hook: $1" >&2
  exit 2
}

# Safety: destructive commands
if [[ "$lower" =~ rm[[:space:]]+-rf[[:space:]]+/ ]] || [[ "$lower" =~ sudo[[:space:]]+rm ]] || [[ "$lower" =~ mkfs ]]; then
  block "destructive filesystem command"
fi

# Safety: secrets
if [[ "$lower" =~ cat[[:space:]].*\.env ]] || [[ "$lower" =~ grep.*\.env ]] || [[ "$lower" =~ echo.*api_key ]] || [[ "$lower" =~ echo.*secret ]]; then
  block "do not read, print, or write secrets"
fi

# Scope: avoid production/cloud/telephony/database/auth expansion in this demo
if [[ "$lower" =~ twilio|vapi|retell|livekit|plivo|supabase|firebase|postgres|mongodb|auth0|nextauth|terraform|pulumi|aws[[:space:]]|gcloud[[:space:]]|vercel[[:space:]]--prod ]]; then
  block "scope creep: this demo should stay local-first and avoid production integrations"
fi

# Scope: do not install large infra packages accidentally
if [[ "$lower" =~ npm[[:space:]]+install.*(twilio|vapi|retell|livekit|supabase|firebase|mongoose|prisma|next-auth|auth0) ]]; then
  block "scope creep dependency blocked"
fi

exit 0
