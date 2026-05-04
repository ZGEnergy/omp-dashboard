#!/usr/bin/env bash
#
# Download and strip Node.js binary for Electron bundling.
# Usage: ./download-node.sh [version] [platform] [arch]
#
# Outputs to: resources/node/
# Strips: man pages, docs, headers, corepack, npm docs
#
set -euo pipefail

NODE_VERSION="${1:-v22.18.0}"
PLATFORM="${2:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${3:-$(uname -m)}"

# Normalize arch
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
esac

# Normalize platform
case "$PLATFORM" in
  darwin|linux) ;;
  *) echo "Unsupported platform: $PLATFORM"; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../resources/node"
ARCHIVE_NAME="node-${NODE_VERSION}-${PLATFORM}-${ARCH}"

echo "Downloading Node.js $NODE_VERSION for $PLATFORM-$ARCH..."

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

if [ "$PLATFORM" = "linux" ]; then
  URL="https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE_NAME}.tar.xz"
  curl -fsSL "$URL" -o "$TEMP_DIR/node.tar.xz"
  tar -xf "$TEMP_DIR/node.tar.xz" -C "$TEMP_DIR"
else
  URL="https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE_NAME}.tar.gz"
  curl -fsSL "$URL" -o "$TEMP_DIR/node.tar.gz"
  tar -xf "$TEMP_DIR/node.tar.gz" -C "$TEMP_DIR"
fi

# Copy and strip
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/bin" "$OUTPUT_DIR/lib"

cp "$TEMP_DIR/$ARCHIVE_NAME/bin/node" "$OUTPUT_DIR/bin/"
cp -r "$TEMP_DIR/$ARCHIVE_NAME/lib/node_modules" "$OUTPUT_DIR/lib/"

# Strip npm docs, man, unnecessary files
rm -rf "$OUTPUT_DIR/lib/node_modules/npm/man"
rm -rf "$OUTPUT_DIR/lib/node_modules/npm/docs"
rm -rf "$OUTPUT_DIR/lib/node_modules/npm/changelogs"
rm -rf "$OUTPUT_DIR/lib/node_modules/corepack"

# Create npm symlink
ln -sf "../lib/node_modules/npm/bin/npm-cli.js" "$OUTPUT_DIR/bin/npm"

SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo "Node.js $NODE_VERSION installed to $OUTPUT_DIR ($SIZE)"
