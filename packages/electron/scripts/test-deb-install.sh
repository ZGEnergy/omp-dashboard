#!/usr/bin/env bash
#
# End-to-end test: build DEB, install it in Docker, run the Electron app headlessly.
#
# Tests the REAL install flow:
# 1. Install .deb package on clean Ubuntu
# 2. Run the Electron app with xvfb (virtual display)
# 3. Wizard: install deps (standalone mode, no API key)
# 4. Verify the dashboard server starts and is reachable
#
# Usage:
#   bash packages/electron/scripts/test-deb-install.sh
#   bash packages/electron/scripts/test-deb-install.sh --skip-build   # Use existing .deb
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$ELECTRON_DIR/../.." && pwd)"

SKIP_BUILD=false
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=true
fi

IMAGE_NAME="pi-dashboard-deb-install-test"

echo "════════════════════════════════════════════════════════"
echo "  PI Dashboard — DEB Install Test (Docker + Xvfb)"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Build the .deb if needed ────────────────────────────

DEB_FILE=""
if [ "$SKIP_BUILD" = true ]; then
  DEB_FILE=$(find "$ELECTRON_DIR/out/make" -name "*.deb" 2>/dev/null | head -1)
fi

if [ -z "$DEB_FILE" ]; then
  echo "→ Building Linux .deb via Docker..."
  bash "$ELECTRON_DIR/scripts/build-installer.sh" --linux
  DEB_FILE=$(find "$ELECTRON_DIR/out/make" -name "*.deb" 2>/dev/null | head -1)
fi

if [ -z "$DEB_FILE" ] || [ ! -f "$DEB_FILE" ]; then
  echo "✗ No .deb file found after build"
  exit 1
fi

DEB_NAME=$(basename "$DEB_FILE")
echo "→ Using DEB: $DEB_NAME"
echo ""

# ── Step 2: Build Docker test image ─────────────────────────────

echo "→ Building Docker test image..."

# Create temp build context with DEB + test script
BUILD_CTX=$(mktemp -d)
trap 'rm -rf "$BUILD_CTX"' EXIT

cp "$DEB_FILE" "$BUILD_CTX/pi-dashboard.deb"
cp "$SCRIPT_DIR/test-deb-install-inner.sh" "$BUILD_CTX/run-test.sh"

docker build -f - -t "$IMAGE_NAME" "$BUILD_CTX" <<'DOCKERFILE'
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install: xvfb (virtual display), deps for Electron, build tools for node-pty
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
    libatspi2.0-0 libdrm2 libgbm1 libasound2 \
    ca-certificates curl python3 make g++ \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install the DEB package (dpkg may fail on deps, apt-get -f fixes them)
COPY pi-dashboard.deb /tmp/pi-dashboard.deb
RUN dpkg -i /tmp/pi-dashboard.deb; \
    apt-get update && apt-get install -f -y --no-install-recommends && \
    rm /tmp/pi-dashboard.deb && rm -rf /var/lib/apt/lists/*

# Create test user
RUN useradd -m -s /bin/bash testuser
USER testuser
WORKDIR /home/testuser

COPY --chown=testuser:testuser run-test.sh /home/testuser/run-test.sh
RUN chmod +x /home/testuser/run-test.sh

ENTRYPOINT ["bash", "/home/testuser/run-test.sh"]
DOCKERFILE

echo ""

# ── Step 3: Run the test ────────────────────────────────────────

echo "→ Running DEB install + Electron app test..."
echo ""

docker run --rm \
  --shm-size=256m \
  "$IMAGE_NAME"
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "════════════════════════════════════════════════════════"
  echo "  ✓ All tests passed!"
  echo "════════════════════════════════════════════════════════"
else
  echo "════════════════════════════════════════════════════════"
  echo "  ✗ Tests failed (exit code: $EXIT_CODE)"
  echo "════════════════════════════════════════════════════════"
fi

exit $EXIT_CODE
