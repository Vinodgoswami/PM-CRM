#!/usr/bin/env bash
# Render build (render.yaml): install everything (dev tools are needed to build), then build the API and the website.
set -euo pipefail
corepack enable pnpm 2>/dev/null || npm install -g "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"
pnpm install --frozen-lockfile --prod=false
pnpm turbo run build --filter=@salescrm/api... --filter=@salescrm/web...
