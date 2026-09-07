#!/bin/sh
set -eu

# Render / Fly inject PORT; Nest reads API_PORT
export API_PORT="${PORT:-${API_PORT:-4000}}"

cd /app

# Apply migrations on boot (idempotent)
pnpm --filter @orbis/db migrate || true

# Seed once-ish (idempotent upserts); ignore failures if already seeded
pnpm --filter @orbis/db seed || true

# Run API + worker together so one free dyno can host the full game loop
pnpm --filter @orbis/api start &
API_PID=$!
pnpm --filter @orbis/worker start &
WORKER_PID=$!

term() {
  kill "$API_PID" "$WORKER_PID" 2>/dev/null || true
}
trap term INT TERM

wait "$API_PID" "$WORKER_PID"
