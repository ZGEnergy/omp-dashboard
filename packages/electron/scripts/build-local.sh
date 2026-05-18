#!/usr/bin/env bash
#
# Build a fully offline-capable Electron app for the local host.
#
# Wraps `build-installer.sh` with the offline-cache + recommended-extension
# bundling flags defaulted ON, so a single command produces an installer that
# works without network on first launch.
#
# What this includes vs. plain `npm run make`:
#   - resources/server/             (bundled dashboard server source + workspace deps)
#   - resources/node/               (bundled Node.js for the bundled server runtime)
#   - resources/offline-packages/   (npm cacache: pi + openspec + tsx)
#   - resources/bundled-extensions/ (Git-cloned first-party pi extensions)
#
# Usage:
#   ./build-local.sh                # default: offline + recommended bundled
#   BUNDLE_OFFLINE_PACKAGES=0 ./build-local.sh
#                                   # opt out of offline cache (online first launch)
#   BUNDLE_RECOMMENDED_EXTENSIONS=0 ./build-local.sh
#                                   # opt out of recommended-extensions bundle
#
# User-supplied env values are preserved; defaults only fire when unset.
#
# Output: out/make/<platform>/...  (DMG / DEB / AppImage / EXE per host).
#
# See change: streamline-electron-bootstrap-and-recovery (group 10).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default to a fully offline-capable build. CI keeps these opt-in via
# build-installer.sh; only `build-local.sh` flips them on by default.
export BUNDLE_OFFLINE_PACKAGES="${BUNDLE_OFFLINE_PACKAGES:-1}"
export BUNDLE_RECOMMENDED_EXTENSIONS="${BUNDLE_RECOMMENDED_EXTENSIONS:-1}"

echo "→ Local Electron build"
echo "  offline-cache:       $BUNDLE_OFFLINE_PACKAGES"
echo "  recommended-bundled: $BUNDLE_RECOMMENDED_EXTENSIONS"
echo ""

# Delegate to the canonical builder (host platform, host arch). All cache
# build + invalidation logic lives there.
exec bash "$ELECTRON_DIR/scripts/build-installer.sh" "$@"
