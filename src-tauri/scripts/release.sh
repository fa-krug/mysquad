#!/bin/bash
set -euo pipefail

# Read version from tauri.conf.json
VERSION=$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])")
TAG="v${VERSION}"

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

glab release create "$TAG" "$DMG" \
  --name "MySquad ${TAG}" \
  --notes "MySquad ${VERSION} for macOS"

echo "==> Done! Release ${TAG} published."
