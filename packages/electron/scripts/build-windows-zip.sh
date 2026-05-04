#!/usr/bin/env bash
# Build Windows ZIP only (no Docker, no NSIS, no portable exe).
# Mirrors the "Build Windows ZIP" step in publish.yml.
#
# Usage:
#   ./packages/electron/scripts/build-windows-zip.sh [--arch x64|arm64] [--skip-client]
#
# Output: packages/electron/out/make/zip/<arch>/PI-Dashboard-win32-<arch>.zip
#
# Runs on a native Windows host (Git Bash / MINGW). Matches CI output:
# full bundle-server npm install + offline npm cache always bundled.
set -euo pipefail

ARCH="x64"
SKIP_CLIENT=false
NODE_VERSION="v22.18.0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) ARCH="$2"; shift 2 ;;
    --skip-client) SKIP_CLIENT=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"
PACKAGED_DIR="$ELECTRON_DIR/out/PI-Dashboard-win32-$ARCH"
ZIP_DIR="$ELECTRON_DIR/out/make/zip/$ARCH"

echo "=== Building Windows ZIP (arch=$ARCH) ==="

# Step 0 — build web client
if [ "$SKIP_CLIENT" = false ]; then
  echo "--- Step 0: building web client"
  cd "$ROOT_DIR"
  npm run build
fi

# Step 1 — bundle server source into resources/ (full npm install for correct win32 native modules)
echo "--- Step 1: bundling server source"
cd "$ROOT_DIR"
node packages/electron/scripts/bundle-server.mjs

# Step 1b — download bundled Windows Node.js into resources/node/
# Required by the Electron wizard to install pi/openspec/tsx on first run.
# Mirrors the Node download step in docker-make.sh.
NODE_DIR="$ELECTRON_DIR/resources/node"
# Skip download only if the node tree is COMPLETE. minizlib's nested
# package.json is the canary: bash unzip silently drops it on macOS, leaving
# node.exe present but the npm install path broken. If the canary is missing,
# wipe the tree and re-extract with the lossless extractor below.
MINIZLIB_CANARY="$NODE_DIR/node_modules/npm/node_modules/minizlib/dist/commonjs/package.json"
# Real failure-mode canary: the nested minipass at minizlib/node_modules/minipass/
# must have the dist/commonjs/ subtree (v7+). If it only has a root index.js,
# it's the old v3 layout and minizlib will crash on `class extends Minipass`.
NESTED_MINIPASS_V7_CANARY="$NODE_DIR/node_modules/npm/node_modules/minizlib/node_modules/minipass/dist/commonjs/index.js"
NODE_FRESH=0
if [ -f "$NODE_DIR/node.exe" ] && { [ ! -f "$MINIZLIB_CANARY" ] || [ ! -f "$NESTED_MINIPASS_V7_CANARY" ]; }; then
  echo "--- Step 1b: existing resources/node is incomplete (canary check failed), wiping for re-extraction"
  rm -rf "$NODE_DIR"
  # Force-regenerate the offline cache too: it should be built with the npm
  # version paired with this re-extracted node, not whatever stale npm built
  # the existing cache.
  rm -rf "$ELECTRON_DIR/resources/offline-packages"
  NODE_FRESH=1
fi
if [ ! -f "$NODE_DIR/node.exe" ]; then
  echo "--- Step 1b: downloading Windows Node.js $NODE_VERSION ($ARCH) for resources/node/"
  NODE_ZIP="/tmp/node-win-$ARCH.zip"
  NODE_EXTRACT_DIR="/tmp/node-extract-$ARCH"
  NODE_URL="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-win-$ARCH.zip"
  curl -fsSL "$NODE_URL" -o "$NODE_ZIP"
  mkdir -p "$NODE_DIR" "$NODE_EXTRACT_DIR"
  rm -rf "$NODE_EXTRACT_DIR"
  mkdir -p "$NODE_EXTRACT_DIR"

  # Use the most lossless extractor available. macOS bash `unzip` has historical
  # issues with Windows zips containing many small files — some `package.json`
  # files in nested node_modules can be silently dropped, breaking minizlib's
  # CJS/ESM dual-publish detection.
  # See change: spawn-failure-diagnostics.
  if command -v ditto &>/dev/null; then
    # macOS native: handles Windows zips perfectly.
    ditto -x -k "$NODE_ZIP" "$NODE_EXTRACT_DIR"
  elif command -v 7z &>/dev/null; then
    7z x -y -o"$NODE_EXTRACT_DIR" "$NODE_ZIP" >/dev/null
  else
    # Fallback: bash unzip. Verify file count after to catch silent drops.
    unzip -q "$NODE_ZIP" -d "$NODE_EXTRACT_DIR"
    EXPECTED=$(unzip -Z -1 "$NODE_ZIP" | grep -v '/$' | wc -l | tr -d ' ')
    ACTUAL=$(find "$NODE_EXTRACT_DIR" -type f | wc -l | tr -d ' ')
    if [ "$ACTUAL" -lt "$EXPECTED" ]; then
      echo "  ✗ unzip dropped files: expected $EXPECTED, got $ACTUAL" >&2
      exit 1
    fi
  fi

  EXTRACTED_ROOT="$NODE_EXTRACT_DIR/node-$NODE_VERSION-win-$ARCH"
  cp "$EXTRACTED_ROOT/node.exe" "$NODE_DIR/"
  cp -R "$EXTRACTED_ROOT/node_modules" "$NODE_DIR/"
  cp "$EXTRACTED_ROOT/npm.cmd" "$NODE_DIR/"
  cp "$EXTRACTED_ROOT/npx.cmd" "$NODE_DIR/"
  # corepack shim is required by some npm-internal codepaths.
  [ -f "$EXTRACTED_ROOT/corepack.cmd" ] && cp "$EXTRACTED_ROOT/corepack.cmd" "$NODE_DIR/"

  # Sanity check: minizlib dual-publish marker.
  MINIZLIB_PKG="$NODE_DIR/node_modules/npm/node_modules/minizlib/dist/commonjs/package.json"
  if [ ! -f "$MINIZLIB_PKG" ]; then
    echo "  ✗ SANITY CHECK FAILED: $MINIZLIB_PKG missing after extraction." >&2
    echo "    The Windows Node.js zip extraction dropped files. Try installing 'ditto' (macOS) or '7z' (linux p7zip)." >&2
    exit 1
  fi

  # Workaround: the bundled npm tree contains a NESTED minipass at
  # node_modules/npm/node_modules/minizlib/node_modules/minipass/ that ships
  # as old v3 layout (module.exports = MinipassClass). minizlib's compiled
  # CJS does `const { Minipass } = require('minipass')`, which gets undefined
  # because the class has no `.Minipass` property — then `class X extends
  # undefined` crashes any `npm install`. The npm-level minipass at
  # node_modules/npm/node_modules/minipass/ is v7+ with the named export
  # minizlib expects, so overwrite the nested copy with the npm-level one.
  # See change: fix-windows-electron-zip-install.
  NESTED_MINIPASS="$NODE_DIR/node_modules/npm/node_modules/minizlib/node_modules/minipass"
  TOPLEVEL_MINIPASS="$NODE_DIR/node_modules/npm/node_modules/minipass"
  if [ -d "$NESTED_MINIPASS" ] && [ -d "$TOPLEVEL_MINIPASS" ]; then
    echo "  → replacing nested minipass with npm-level minipass (Minipass-named-export)"
    rm -rf "$NESTED_MINIPASS"
    cp -R "$TOPLEVEL_MINIPASS" "$NESTED_MINIPASS"
  fi

  rm -rf "$NODE_EXTRACT_DIR" "$NODE_ZIP"
  NODE_FRESH=1
  echo "  ✓ Node.js bundled at $NODE_DIR"
else
  echo "--- Step 1b: resources/node/node.exe already present, skipping download"
fi

# Step 1c — bundle offline npm cache (pi + openspec + tsx)
# Re-bundle when the cache is missing OR when resources/node was just
# (re)extracted in step 1b — the cache must be built against the bundled
# npm that ships in this build, not against a previous build's npm.
if [ ! -f "$ELECTRON_DIR/resources/offline-packages/manifest.json" ] || [ "$NODE_FRESH" = "1" ]; then
  echo "--- Step 1c: bundling offline npm cache for win32-$ARCH (fresh=${NODE_FRESH})"
  rm -rf "$ELECTRON_DIR/resources/offline-packages"
  cd "$ROOT_DIR"
  node packages/electron/scripts/bundle-offline-packages.mjs --platform="win32-$ARCH"
else
  echo "--- Step 1c: offline npm cache already present, skipping"
fi

# Step 2 — forge package
echo "--- Step 2: electron-forge package --platform win32 --arch $ARCH"
cd "$ELECTRON_DIR"
"$ROOT_DIR/node_modules/.bin/electron-forge" package --platform win32 --arch "$ARCH"

# Step 3 — zip
echo "--- Step 3: creating ZIP"
mkdir -p "$ZIP_DIR"
ZIP_PATH="$ZIP_DIR/PI-Dashboard-win32-$ARCH.zip"

if command -v zip &>/dev/null; then
  cd "$ELECTRON_DIR/out"
  zip -r "$ZIP_PATH" "PI-Dashboard-win32-$ARCH"
else
  # PowerShell fallback (Windows)
  powershell -Command "Compress-Archive -Path '$PACKAGED_DIR' -DestinationPath '$ZIP_PATH' -Force"
fi

echo "=== Done: $ZIP_PATH ==="
