#!/bin/sh
set -e

echo "→ Applying D1 migrations (local)..."
npx wrangler d1 migrations apply airu-db --local

# Run sync after a short delay (wait for wrangler to be ready), then every 30 min
(sleep 8 && echo "→ Initial sync..." && node /app/sync.mjs
 while true; do sleep 1800 && echo "→ Periodic sync..." && node /app/sync.mjs; done) &

echo "→ Starting backend on 0.0.0.0:8787..."
exec npx wrangler dev --ip 0.0.0.0 --port 8787 --test-scheduled
