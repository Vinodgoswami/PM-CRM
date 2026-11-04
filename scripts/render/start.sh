#!/usr/bin/env bash
# Render start (render.yaml): bring the database schema up to date, then run the API, which also serves the website.
set -euo pipefail
(cd packages/database && npx --no-install prisma migrate deploy)
exec node apps/api/dist/main.js
