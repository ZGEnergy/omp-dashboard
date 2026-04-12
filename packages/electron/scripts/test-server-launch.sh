#!/usr/bin/env bash
#
# Test the bundled server launch in a Docker container (simulates clean Linux).
# Installs managed deps (pi, tsx) then tries to start the server.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"

echo "═══════════════════════════════════════════════════"
echo "  Testing server launch in Docker (clean Linux)"
echo "═══════════════════════════════════════════════════"
echo ""

# Ensure server is bundled
if [ ! -d "$ELECTRON_DIR/resources/server/packages/server/src" ]; then
  echo "→ Bundling server first..."
  bash "$ELECTRON_DIR/scripts/bundle-server.sh"
fi

# Build a minimal test image
cd "$PROJECT_DIR"
docker build -f - -t pi-dashboard-server-test "$ELECTRON_DIR" <<'DOCKERFILE'
FROM node:22-bookworm-slim

# Simulate Electron's resource layout
RUN mkdir -p /app/resources
WORKDIR /app

# Copy bundled server and node
# Only copy source (no node_modules from macOS)
COPY resources/server/packages /app/resources/server/packages
COPY resources/server/dist /app/resources/server/dist
COPY resources/server/package.json /app/resources/server/package.json
COPY resources/dirname-shim.js /app/resources/ 

# Create managed dir (simulates wizard install)
RUN mkdir -p /root/.pi-dashboard && \
    echo '{"name":"pi-dashboard-managed","private":true,"type":"module"}' > /root/.pi-dashboard/package.json

# Install deps and build native modules for Linux
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN cd /app/resources/server && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -5 && \
    mkdir -p node_modules/node-pty/prebuilds/linux-x64 && \
    cp node_modules/node-pty/build/Release/pty.node node_modules/node-pty/prebuilds/linux-x64/ 2>/dev/null || true && \
    rm -rf node_modules/node-pty/prebuilds/darwin-* node_modules/node-pty/prebuilds/win32-*

# Install tsx (what the wizard does)
RUN cd /root/.pi-dashboard && npm install tsx 2>&1 | tail -3

# Show what we have
RUN echo "=== tsx ===" && ls /root/.pi-dashboard/node_modules/tsx/dist/ && \
    echo "=== server ===" && ls /app/resources/server/packages/server/src/cli.ts && \
    echo "=== node_modules ===" && ls /app/resources/server/node_modules/ | head -20

ENTRYPOINT ["bash"]
DOCKERFILE

echo ""
echo "→ Testing server launch..."
echo ""

# Run interactive test
docker run --rm -it pi-dashboard-server-test -c '
echo "=== Test 1: Check tsx loader paths ==="
ls /root/.pi-dashboard/node_modules/tsx/dist/register.js 2>/dev/null && echo "register.js: YES" || echo "register.js: NO"
ls /root/.pi-dashboard/node_modules/tsx/dist/esm/index.mjs 2>/dev/null && echo "esm/index.mjs: YES" || echo "esm/index.mjs: NO"
ls /root/.pi-dashboard/node_modules/tsx/dist/cjs/index.js 2>/dev/null && echo "cjs/index.js: YES" || echo "cjs/index.js: NO"

echo ""
echo "=== Test 2: Launch with dirname shim + tsx ESM ==="
timeout 5 node \
  --import /app/resources/dirname-shim.js \
  --import /root/.pi-dashboard/node_modules/tsx/dist/esm/index.mjs \
  /app/resources/server/packages/server/src/cli.ts --port 8000 2>&1 || true

echo ""
echo "=== Test 3: Launch with tsx register (if exists) ==="
if [ -f /root/.pi-dashboard/node_modules/tsx/dist/register.js ]; then
  timeout 5 node \
    --import /root/.pi-dashboard/node_modules/tsx/dist/register.js \
    /app/resources/server/packages/server/src/cli.ts --port 8000 2>&1 || true
else
  echo "register.js not available, skipping"
fi

echo ""
echo "=== Test 4: Launch with tsx binary ==="
timeout 5 /root/.pi-dashboard/node_modules/.bin/tsx \
  /app/resources/server/packages/server/src/cli.ts --port 8000 2>&1 || true

echo ""
echo "=== Test 5: Check node-pty package.json type ==="
cat /app/resources/server/node_modules/node-pty/package.json | grep -E "type|main" | head -5

echo ""
echo "=== Test 6: Find all files using __dirname ==="
grep -rn "__dirname" /app/resources/server/node_modules/node-pty/lib/*.js 2>/dev/null | head -10

echo ""
echo "=== Test 7: Check nearest package.json for node-pty ==="
node -e "
const path = require(\"path\");
let dir = \"/app/resources/server/node_modules/node-pty/lib\";
while (dir !== \"/\") {
  const pkg = path.join(dir, \"package.json\");
  try { 
    const p = require(pkg);
    console.log(dir, \"type:\", p.type || \"(none/cjs)\");
  } catch {}
  dir = path.dirname(dir);
}
"
'
