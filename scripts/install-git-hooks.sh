#!/bin/sh
# Install repo git hooks (prepare-commit-msg strips Cursor co-author trailers).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_SRC="$ROOT/.githooks/prepare-commit-msg"
HOOK_DST="$ROOT/.git/hooks/prepare-commit-msg"

mkdir -p "$ROOT/.git/hooks"
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_SRC" "$HOOK_DST"
echo "Installed prepare-commit-msg hook -> $HOOK_DST"
