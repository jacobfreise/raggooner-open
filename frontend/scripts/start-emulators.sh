#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FUNCTIONS_DIR="$(cd "$FRONTEND_DIR/../functions" && pwd)"

# 1. Build Cloud Functions
echo "Building Cloud Functions..."
(cd "$FUNCTIONS_DIR" && npm run build)

# 2. Start emulators in the background
echo "Starting Firebase emulators..."
cd "$FRONTEND_DIR"
firebase emulators:start &
EMU_PID=$!

# 3. Wait for Firestore emulator to be ready on port 8080
echo "Waiting for Firestore emulator (port 8080)..."
until nc -z 127.0.0.1 8080 2>/dev/null; do
  sleep 1
done
echo "Firestore emulator is ready."

# 4. Restore backup data
echo "Restoring backup..."
node "$SCRIPT_DIR/restoreBackup.mjs"

# 5. Keep the process alive until emulators exit (Ctrl+C)
wait $EMU_PID
