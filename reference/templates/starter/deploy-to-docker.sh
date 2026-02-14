#!/bin/bash
set -e

# Get app name and monorepo root
APP_NAME=$(basename "$(pwd)")
MONOREPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "../..")

# Get port from apps.json, fallback to 8080
PORT=$(cd "$MONOREPO_ROOT" && cat apps.json 2>/dev/null | jq -r ".apps[] | select(.path == \"apps/$APP_NAME\") | .port" || echo "8080")
if [ -z "$PORT" ] || [ "$PORT" = "null" ]; then
  PORT=8080
fi

echo "🐳 Building production Docker image for $APP_NAME..."
cd "$MONOREPO_ROOT"
docker build --no-cache -f "apps/$APP_NAME/Dockerfile" -t "saveaday/$APP_NAME:latest" .

echo "🧹 Stopping existing container if running..."
docker stop "$APP_NAME" 2>/dev/null || true
docker rm "$APP_NAME" 2>/dev/null || true

echo "🚀 Running $APP_NAME on Docker Desktop (port $PORT)..."

# Build docker run command
DOCKER_CMD="docker run -d --name \"$APP_NAME\" -p \"$PORT:8080\""

# Add env file if it exists
if [ -f "apps/$APP_NAME/.env.local" ]; then
  DOCKER_CMD="$DOCKER_CMD --env-file \"apps/$APP_NAME/.env.local\""
fi

# Override GOOGLE_APPLICATION_CREDENTIALS to point to Docker container path
DOCKER_CMD="$DOCKER_CMD -e GOOGLE_APPLICATION_CREDENTIALS=/app/creds/dvizfb-314a185c77ef.json"

DOCKER_CMD="$DOCKER_CMD \"saveaday/$APP_NAME:latest\""

# Execute the command
eval $DOCKER_CMD

echo "✅ $APP_NAME running at http://localhost:$PORT"
echo "📋 View logs with: docker logs -f $APP_NAME"
