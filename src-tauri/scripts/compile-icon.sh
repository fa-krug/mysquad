#!/bin/bash
# Compiles logo.icon into Assets.car for macOS 26 Liquid Glass icon support.
# Called automatically by Tauri's beforeBundleCommand.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
ICON_PATH="$TAURI_DIR/icons/logo.icon"
OUTPUT_DIR="$TAURI_DIR/icons/compiled"

if [ ! -d "$ICON_PATH" ]; then
  echo "Warning: $ICON_PATH not found, skipping icon compilation"
  exit 0
fi

mkdir -p "$OUTPUT_DIR"

echo "Compiling logo.icon -> Assets.car..."
actool "$ICON_PATH" \
  --compile "$OUTPUT_DIR" \
  --app-icon logo \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --platform macosx \
  --minimum-deployment-target 10.14 \
  --output-partial-info-plist /dev/null

if [ -f "$OUTPUT_DIR/Assets.car" ]; then
  echo "Assets.car compiled successfully"
else
  echo "Error: Assets.car was not created"
  exit 1
fi
