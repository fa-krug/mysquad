#!/bin/bash
# Injects compiled Assets.car into the macOS app bundle and sets CFBundleIconName.
# Pass the .app bundle path as $1, or it will find it automatically.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
ASSETS_CAR="$TAURI_DIR/icons/compiled/Assets.car"

if [ ! -f "$ASSETS_CAR" ]; then
  echo "Warning: Assets.car not found, skipping icon injection"
  exit 0
fi

# Find the app bundle
if [ -n "${1:-}" ]; then
  APP_BUNDLE="$1"
else
  APP_BUNDLE=$(find "$TAURI_DIR/target" -name "MySquad.app" -path "*/bundle/macos/*" | head -1)
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
  echo "Warning: Could not find MySquad.app bundle, skipping icon injection"
  exit 0
fi

RESOURCES_DIR="$APP_BUNDLE/Contents/Resources"
INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"

echo "Injecting Assets.car into $APP_BUNDLE..."

# Copy Assets.car into Resources
cp "$ASSETS_CAR" "$RESOURCES_DIR/Assets.car"

# Remove old .icns so macOS doesn't prefer it
if [ -f "$RESOURCES_DIR/icon.icns" ]; then
  rm "$RESOURCES_DIR/icon.icns"
  echo "Removed old icon.icns"
fi

# Remove CFBundleIconFile (points to old .icns)
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconFile" "$INFO_PLIST" 2>/dev/null || true

# Set CFBundleIconName to match the .icon asset name
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$INFO_PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIconName string logo" "$INFO_PLIST"
echo "Set CFBundleIconName = logo"

# Re-sign the bundle (ad-hoc for dev)
codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true

echo "Icon injection complete"
