#!/bin/bash
# Block edits to sensitive files (.env, lock files)

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [ -z "$FILE" ]; then
  exit 0
fi

FILENAME=$(basename "$FILE")

# Block .env files
if echo "$FILENAME" | grep -qE "^\.env"; then
  echo "Blocked: direct edit of $FILENAME is not allowed. Use environment variable management instead." >&2
  exit 2
fi

# Block lock files
if echo "$FILENAME" | grep -qE "^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$"; then
  echo "Blocked: direct edit of $FILENAME is not allowed. Use npm/yarn/pnpm commands instead." >&2
  exit 2
fi

exit 0
