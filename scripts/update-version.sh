#!/bin/bash
# Met à jour src/lib/version.ts avec le numéro de commit courant + 1
# Appelé automatiquement avant chaque commit par le hook pre-commit

cd "$(git rev-parse --show-toplevel)" || exit 0

COUNT=$(($(git rev-list --count HEAD) + 1))
VERSION_FILE="src/lib/version.ts"

echo "// Auto-updated by git pre-commit hook (update-version.sh)
export const APP_VERSION = '1.0.${COUNT}';" > "$VERSION_FILE"

git add "$VERSION_FILE"
