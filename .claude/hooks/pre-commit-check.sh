#!/bin/bash
# Block git commits if svelte-check finds TypeScript/Svelte errors
# Uses svelte-check (not npm run build) pour éviter l'erreur EPERM Windows du symlink adapter-vercel

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

echo "Running svelte-check before commit..." >&2

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$CLAUDE_PROJECT_DIR" || exit 0

if ! npx svelte-check --threshold error > /dev/null 2>&1; then
  echo "svelte-check found errors. Fix them before committing." >&2
  exit 2
fi

echo "svelte-check passed." >&2
exit 0
