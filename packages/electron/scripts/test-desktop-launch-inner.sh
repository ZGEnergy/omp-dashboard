#!/usr/bin/env bash
#
# Desktop-launch simulation test.
# Runs with a MINIMAL PATH — no node/npm on system — exactly like a .desktop launcher.
#
set -euo pipefail

PASS=0
FAIL=0
TESTS=()

pass() { PASS=$((PASS + 1)); TESTS+=("✓ $1"); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); TESTS+=("✗ $1: $2"); echo "  ✗ $1: $2"; }

# ── Minimal desktop PATH ────────────────────────────────────────
# This is what a .desktop file / Electron app gets on Linux.
# NO node, NO npm, NO ~/.local/bin — just base system dirs.
DESKTOP_PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test 0: Verify environment is minimal (no node)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if env PATH="$DESKTOP_PATH" which node 2>/dev/null; then
  fail "Environment" "node found on desktop PATH — test is invalid"
  exit 1
else
  pass "No system node on desktop PATH"
fi

BUNDLED_NODE="/usr/lib/pi-dashboard/resources/node/bin/node"
BUNDLED_NPM="/usr/lib/pi-dashboard/resources/node/bin/npm"
if [ -x "$BUNDLED_NODE" ]; then
  pass "Bundled node exists: $($BUNDLED_NODE --version)"
else
  fail "Bundled node" "not found at $BUNDLED_NODE"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test 1: Wizard setup with ONLY bundled node"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Simulate exactly what dependency-installer.ts does:
# 1. Prepend bundled node to PATH
# 2. Use bundled npm to install packages into ~/.pi-dashboard/

MANAGED_DIR="$HOME/.pi-dashboard"
mkdir -p "$MANAGED_DIR"
echo '{"name":"pi-dashboard-managed","private":true,"type":"module"}' > "$MANAGED_DIR/package.json"

# The installer uses: env.PATH = bundledNodeDir + originalPATH
INSTALL_PATH="/usr/lib/pi-dashboard/resources/node/bin:$DESKTOP_PATH"

echo "  → Installing tsx + pi (PATH=$INSTALL_PATH)"
cd "$MANAGED_DIR"
if env PATH="$INSTALL_PATH" "$BUNDLED_NPM" install tsx @mariozechner/pi-coding-agent 2>&1 | tail -3; then
  pass "Packages installed using only bundled node"
else
  fail "Package install" "failed with bundled node"
fi

# Verify binaries
for bin in tsx pi; do
  if [ -x "$MANAGED_DIR/node_modules/.bin/$bin" ]; then
    pass "$bin binary exists"
  else
    fail "$bin binary" "not found"
  fi
done

# Write mode.json
cat > "$MANAGED_DIR/mode.json" <<EOF
{"mode": "standalone", "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"}
EOF
pass "mode.json written"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test 2: Server launch with desktop PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# This simulates what server-lifecycle.ts does:
# env.PATH = bundledNode:tsxBin:desktopPATH
SERVER_PATH="/usr/lib/pi-dashboard/resources/node/bin:$MANAGED_DIR/node_modules/.bin:$DESKTOP_PATH"
SERVER_CLI="/usr/lib/pi-dashboard/resources/server/packages/server/src/cli.ts"
TSX_BIN="$MANAGED_DIR/node_modules/.bin/tsx"
PORT=8222
PI_PORT=9977

echo "  → Launching server with desktop PATH"
echo "    PATH=$SERVER_PATH"

env PATH="$SERVER_PATH" \
    NODE_PATH="/usr/lib/pi-dashboard/resources/server/node_modules:$MANAGED_DIR/node_modules" \
    "$TSX_BIN" "$SERVER_CLI" --port $PORT --pi-port $PI_PORT \
    > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server
DEADLINE=$((SECONDS + 30))
SERVER_UP=false
while [ $SECONDS -lt $DEADLINE ]; do
  sleep 1
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "  ⚠ Server exited early"
    break
  fi
  if curl -sf "http://localhost:$PORT/api/health" > /tmp/health.json 2>/dev/null; then
    SERVER_UP=true
    break
  fi
done

if [ "$SERVER_UP" = true ]; then
  pass "Server started with desktop PATH"
else
  fail "Server start" "failed with desktop PATH"
  echo "  Server log:"
  tail -20 /tmp/server.log 2>/dev/null
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test 3: Session spawn (pi needs node via #!/usr/bin/env node)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$SERVER_UP" = true ]; then
  SPAWN_DIR=$(mktemp -d)
  SPAWN_RESP=$(curl -sf -X POST "http://localhost:$PORT/api/session/spawn" \
    -H "Content-Type: application/json" \
    -d "{\"cwd\": \"$SPAWN_DIR\"}" 2>&1 || echo '{"success":false}')

  if echo "$SPAWN_RESP" | grep -q '"success":true'; then
    pass "Spawn API returned success"

    # Wait and check for pi process
    sleep 4
    if ps aux 2>/dev/null | grep -v grep | grep -q "\-\-mode.*rpc"; then
      PI_LINE=$(ps aux 2>/dev/null | grep -v grep | grep "\-\-mode.*rpc" | head -1)
      pass "pi process running: $(echo "$PI_LINE" | awk '{for(i=11;i<=NF;i++) printf $i" "; print ""}')"
      pkill -f "\-\-mode.*rpc" 2>/dev/null || true
    else
      fail "pi process" "not found after spawn"
      echo "    All processes:"
      ps aux 2>/dev/null | grep -E "node|pi|sleep" | grep -v grep | head -10
      echo ""
      echo "    Server log (last 10 lines):"
      tail -10 /tmp/server.log 2>/dev/null
    fi
  else
    fail "Spawn API" "response: $SPAWN_RESP"
  fi
  rm -rf "$SPAWN_DIR"
else
  fail "Session spawn" "skipped (server not running)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Test 4: Electron app launch with desktop PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill the manual server first
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
sleep 2

# Now launch the REAL Electron app with minimal desktop PATH
# The Electron app should discover bundled node and launch the server itself
echo "  → Starting Electron app with desktop PATH=$DESKTOP_PATH"
env PATH="$DESKTOP_PATH" HOME="$HOME" \
  xvfb-run -a /usr/lib/pi-dashboard/pi-dashboard --no-sandbox \
  > /tmp/electron.log 2>&1 &
ELECTRON_PID=$!

PORT=8000  # Default port
DEADLINE=$((SECONDS + 60))
ELECTRON_SERVER_UP=false

while [ $SECONDS -lt $DEADLINE ]; do
  sleep 2
  if ! kill -0 "$ELECTRON_PID" 2>/dev/null; then
    echo "  ⚠ Electron exited early"
    break
  fi
  if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>/dev/null; then
    ELECTRON_SERVER_UP=true
    break
  fi
  echo "  ... waiting ($((DEADLINE - SECONDS))s remaining)"
done

if [ "$ELECTRON_SERVER_UP" = true ]; then
  pass "Electron app launched server with desktop PATH"

  # Test session spawn from Electron-launched server
  SPAWN_DIR2=$(mktemp -d)
  SPAWN_RESP2=$(curl -sf -X POST "http://localhost:$PORT/api/session/spawn" \
    -H "Content-Type: application/json" \
    -d "{\"cwd\": \"$SPAWN_DIR2\"}" 2>&1 || echo '{"success":false}')

  if echo "$SPAWN_RESP2" | grep -q '"success":true'; then
    pass "Session spawn from Electron-launched server"
    sleep 4
    if ps aux 2>/dev/null | grep -v grep | grep -q "\-\-mode.*rpc"; then
      pass "pi process running from Electron-launched server"
      pkill -f "\-\-mode.*rpc" 2>/dev/null || true
    else
      fail "pi process (Electron)" "not found"
      echo "    Server log:"
      cat "$HOME/.pi-dashboard/server.log" 2>/dev/null | tail -10
    fi
  else
    fail "Session spawn (Electron)" "response: $SPAWN_RESP2"
  fi
  rm -rf "$SPAWN_DIR2"
else
  fail "Electron server launch" "server didn't start within 60s"
  echo "  Electron log:"
  tail -20 /tmp/electron.log 2>/dev/null
  echo "  Server log:"
  cat "$HOME/.pi-dashboard/server.log" 2>/dev/null | tail -20
fi

# Cleanup
kill "$ELECTRON_PID" 2>/dev/null || true
sleep 1
curl -sf -X POST "http://localhost:$PORT/api/shutdown" > /dev/null 2>&1 || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
for t in "${TESTS[@]}"; do
  echo "  $t"
done
echo ""
echo "  $PASS passed, $FAIL failed"
echo ""
[ $FAIL -gt 0 ] && exit 1
exit 0
