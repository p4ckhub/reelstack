#!/bin/bash
set -e

echo "Running database migrations..."
bunx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
echo "Migrations complete."
