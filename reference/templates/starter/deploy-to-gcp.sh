#!/bin/bash

# Starter App Deployment Script
# Uses the @saveaday/deployment-utils package

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MONOREPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Run the CLI tool
# We use node directly to run the compiled output
node "$MONOREPO_ROOT/packages/deployment-utils/dist/bin/deploy-app.js" "starter" --port 8080 --domain starter.saveaday.ai
