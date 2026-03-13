#!/bin/bash
set -euo pipefail

# Read version from tauri.conf.json
VERSION=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
TAG="v${VERSION}"

# Accept optional release notes file
NOTES_FILE="${1:-}"

echo "==> Building MySquad ${TAG}..."
npm run tauri build

# Find the .dmg
DMG=$(ls src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "Error: No .dmg found in src-tauri/target/release/bundle/dmg/"
  exit 1
fi

echo "==> Found: ${DMG}"
echo "==> Creating release ${TAG}..."

if [ -n "$NOTES_FILE" ] && [ -f "$NOTES_FILE" ]; then
  glab release create "$TAG" "$DMG" \
    --name "MySquad ${TAG}" \
    --notes-file "$NOTES_FILE"
else
  glab release create "$TAG" "$DMG" \
    --name "MySquad ${TAG}" \
    --notes "MySquad ${VERSION} for macOS"
fi

echo "==> Done! Release ${TAG} published."
