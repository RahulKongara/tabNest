#!/usr/bin/env bash
# TabNest Build Script
# Produces two extension packages:
#   dist/tabnest-chromium.zip  — Chrome, Edge, Brave (Manifest V3)
#   dist/tabnest-firefox.zip   — Firefox 109+ (Manifest V2)
#
# Usage:
#   bash build/build.sh            # Build both packages
#   bash build/build.sh --chromium # Build Chromium package only
#   bash build/build.sh --firefox  # Build Firefox package only
#   bash build/build.sh --help     # Show usage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$ROOT_DIR/dist"

usage() {
  grep '^#' "$0" | grep -v '#!/' | sed 's/^# *//'
  exit 0
}

case "${1:-}" in
  --help|-h) usage ;;
  --chromium) BUILD_CHROMIUM=true; BUILD_FIREFOX=false ;;
  --firefox)  BUILD_CHROMIUM=false; BUILD_FIREFOX=true ;;
  "")         BUILD_CHROMIUM=true; BUILD_FIREFOX=true ;;
  *) echo "Unknown argument: $1"; usage ;;
esac

# ── Preflight checks ──────────────────────────────────────────────────────────

if ! command -v zip &>/dev/null; then
  echo "[TabNest Build] ERROR: 'zip' command not found. Install it with:"
  echo "  macOS:   brew install zip"
  echo "  Ubuntu:  sudo apt-get install zip"
  exit 1
fi

mkdir -p "$DIST_DIR"

# ── Shared file list (copied into every package) ──────────────────────────────
# Paths are relative to ROOT_DIR. Directories are copied recursively.
SHARED_DIRS=(
  "core"
  "sidebar"
  "content"
  "icons"
)

# ── Helper: copy shared files into a staging directory ────────────────────────
copy_shared() {
  local staging="$1"
  for dir in "${SHARED_DIRS[@]}"; do
    if [ -d "$ROOT_DIR/$dir" ]; then
      cp -r "$ROOT_DIR/$dir" "$staging/$dir"
    fi
  done
}

# ── Build Chromium package (MV3) ─────────────────────────────────────────────
if [ "$BUILD_CHROMIUM" = "true" ]; then
  echo "[TabNest Build] Building Chromium package (MV3)..."
  STAGING_CR="$(mktemp -d)"

  copy_shared "$STAGING_CR"
  cp "$ROOT_DIR/manifest.json"  "$STAGING_CR/manifest.json"
  cp "$ROOT_DIR/background.js"  "$STAGING_CR/background.js"

  # Zip from inside staging dir so manifest.json is at root of the zip
  (cd "$STAGING_CR" && zip -r "$DIST_DIR/tabnest-chromium.zip" . -x "*.DS_Store" -x "*__MACOSX*" -x "*.gitkeep")
  rm -rf "$STAGING_CR"

  echo "[TabNest Build] Chromium package: dist/tabnest-chromium.zip"
fi

# ── Build Firefox package (MV2) ──────────────────────────────────────────────
if [ "$BUILD_FIREFOX" = "true" ]; then
  echo "[TabNest Build] Building Firefox package (MV2)..."
  STAGING_FF="$(mktemp -d)"

  copy_shared "$STAGING_FF"
  # Firefox expects manifest.json at the root — rename manifest-firefox.json
  cp "$ROOT_DIR/manifest-firefox.json"    "$STAGING_FF/manifest.json"
  cp "$ROOT_DIR/background-firefox.js"    "$STAGING_FF/background-firefox.js"

  (cd "$STAGING_FF" && zip -r "$DIST_DIR/tabnest-firefox.zip" . -x "*.DS_Store" -x "*__MACOSX*" -x "*.gitkeep")
  rm -rf "$STAGING_FF"

  echo "[TabNest Build] Firefox package:  dist/tabnest-firefox.zip"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "[TabNest Build] Done. Packages in dist/:"
ls -lh "$DIST_DIR"/*.zip 2>/dev/null || echo "  (none)"
