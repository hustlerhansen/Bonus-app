#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Reviewed SQL migrations only; drizzle-kit push can drop migration-owned V2 objects.
pnpm --filter @workspace/db run migrate:dev
