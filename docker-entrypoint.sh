#!/bin/sh
set -e

echo "Waiting for database to be ready..."

max_attempts=60
attempt=0

until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ $attempt -ge $max_attempts ]; then
    echo "ERROR: Database not reachable after ${max_attempts} attempts. Exiting."
    exit 1
  fi
  echo "  Attempt $attempt/$max_attempts — retrying in 2s..."
  sleep 2
done

echo "Database is ready. Running migrations..."
npx prisma migrate deploy

echo "Migrations complete. Starting application..."
exec npm run start
