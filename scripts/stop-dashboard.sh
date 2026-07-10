#!/usr/bin/env bash
# Stop the pi-dashboard server process.
# Sends SIGTERM for graceful shutdown, falls back to SIGKILL after 5s.

set -euo pipefail

CONFIG_FILE="$HOME/.omp/dashboard/config.json"
DEFAULT_PORT=8000

# Read port from config if available
if command -v node &>/dev/null && [ -f "$CONFIG_FILE" ]; then
  PORT=$(node -e "console.log(require('$CONFIG_FILE').port || $DEFAULT_PORT)" 2>/dev/null || echo "$DEFAULT_PORT")
else
  PORT="$DEFAULT_PORT"
fi

# Find PIDs listening on the dashboard port
PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)

if [ -z "$PIDS" ]; then
  echo "No dashboard server running on port $PORT."
  exit 0
fi

echo "Stopping dashboard server (port $PORT, PIDs: $PIDS)..."
kill $PIDS 2>/dev/null || true

# Wait up to 5 seconds for graceful shutdown
for i in $(seq 1 10); do
  REMAINING=$(lsof -ti :"$PORT" 2>/dev/null || true)
  if [ -z "$REMAINING" ]; then
    echo "Dashboard server stopped."
    exit 0
  fi
  sleep 0.5
done

# Force kill
echo "Graceful shutdown timed out, force killing..."
kill -9 $PIDS 2>/dev/null || true
echo "Dashboard server killed."
