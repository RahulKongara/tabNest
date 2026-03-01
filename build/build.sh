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
#
# Full implementation: Phase 6, plan 06-01

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

# STUB: actual packaging logic implemented in Phase 6
echo "[TabNest Build] Scaffold only — packaging logic not yet implemented."
echo "[TabNest Build] BUILD_CHROMIUM=$BUILD_CHROMIUM"
echo "[TabNest Build] BUILD_FIREFOX=$BUILD_FIREFOX"
echo "[TabNest Build] Done."
