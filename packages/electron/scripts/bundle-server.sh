#!/usr/bin/env bash
#
# Bundle the dashboard server into Electron's resources.
# Creates resources/server/ with the server source, shared types,
# and a minimal node_modules with production dependencies.
#
# For cross-platform builds, use --source-only to skip npm install
# (native modules must be built on the target platform).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"
SERVER_BUNDLE="$ELECTRON_DIR/resources/server"

SOURCE_ONLY=false
if [ "${1:-}" = "--source-only" ]; then
  SOURCE_ONLY=true
fi

echo "→ Bundling dashboard server..."

# Clean previous bundle
rm -rf "$SERVER_BUNDLE"

# Create target structure first
mkdir -p "$SERVER_BUNDLE/packages"
# Client goes under packages/dist/client/ so the server can find it
# (server.ts resolves path.join(__dirname, '../../dist/client') from packages/server/src/)
mkdir -p "$SERVER_BUNDLE/packages/dist/client"

# Copy server, shared, and extension source (preserving directory structure)
cp -R "$PROJECT_DIR/packages/server" "$SERVER_BUNDLE/packages/server"
cp -R "$PROJECT_DIR/packages/shared" "$SERVER_BUNDLE/packages/shared"
cp -R "$PROJECT_DIR/packages/extension" "$SERVER_BUNDLE/packages/extension"

# Copy built client (the server serves it)
CLIENT_SRC=""
for candidate in \
  "$PROJECT_DIR/dist/client" \
  "$PROJECT_DIR/packages/dist" \
  "$PROJECT_DIR/packages/client/dist"; do
  if [ -f "$candidate/index.html" ]; then
    CLIENT_SRC="$candidate"
    break
  fi
done

if [ -n "$CLIENT_SRC" ]; then
  cp -R "$CLIENT_SRC/." "$SERVER_BUNDLE/packages/dist/client/"
  echo "  Client copied from $CLIENT_SRC"
else
  echo "  WARNING: No built client found — server will run in API-only mode"
fi

# Create a minimal workspace package.json for npm install
# NOTE: intentionally NO "type": "module" here — node_modules contain CJS
# packages (e.g. node-pty) that break if loaded as ESM.
cat > "$SERVER_BUNDLE/package.json" <<'EOF'
{
  "name": "pi-dashboard-bundled-server",
  "private": true,
  "workspaces": [
    "packages/server",
    "packages/shared",
    "packages/extension"
  ]
}
EOF

if [ "$SOURCE_ONLY" = true ]; then
  echo "  Source-only mode — skipping npm install (run on target platform)"
  SIZE=$(du -sh "$SERVER_BUNDLE" | cut -f1)
  echo "✓ Server source bundled ($SIZE) at $SERVER_BUNDLE"
  exit 0
fi

# Install production dependencies (native modules built for current platform)
cd "$SERVER_BUNDLE"
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5 || true

# Clean up unnecessary files to reduce size
rm -rf "$SERVER_BUNDLE/packages/server/src/__tests__"
rm -rf "$SERVER_BUNDLE/packages/shared/src/__tests__"
rm -rf "$SERVER_BUNDLE/packages/extension/src/__tests__"
find "$SERVER_BUNDLE/node_modules" \( -name "*.md" -o -name "*.map" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name "*.d.ts" \) -delete 2>/dev/null || true
find "$SERVER_BUNDLE/node_modules" -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$SERVER_BUNDLE/node_modules" -name "test" -type d -exec rm -rf {} + 2>/dev/null || true

# Fix node-pty spawn-helper permissions (npm hoisting may skip the postinstall fix)
if [ "$(uname)" != "Windows_NT" ]; then
  find "$SERVER_BUNDLE" -name spawn-helper -type f -exec chmod +x {} \;
  echo "  Fixed spawn-helper execute permissions"
fi

# Remove macOS quarantine flags from native binaries
if [ "$(uname)" = "Darwin" ]; then
  find "$SERVER_BUNDLE/node_modules/node-pty" \( -name spawn-helper -o -name "*.node" \) -type f \
    -exec xattr -d com.apple.quarantine {} 2>/dev/null \;
  echo "  Removed quarantine flags from node-pty binaries"
fi

SIZE=$(du -sh "$SERVER_BUNDLE" | cut -f1)
echo "✓ Server bundled ($SIZE) at $SERVER_BUNDLE"
