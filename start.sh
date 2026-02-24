#!/bin/bash
PORT=4040

# Kill any process using the port
PID=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PID" ]; then
  echo "⚡ Killing existing process on port $PORT (PID: $PID)"
  kill -9 $PID 2>/dev/null
  sleep 1
fi

echo "🚀 Starting Factory on http://localhost:$PORT"
cd "$(dirname "$0")/ui" && npm run dev -- -p $PORT 2>&1
