#!/bin/bash
# CodeXray one-click launcher.
# Double-click this file in Finder (or run it in a terminal) to start the
# dashboard. It installs everything it needs the first time, then opens
# http://localhost:3001 in your browser.

# Always run from the folder this script lives in.
cd "$(dirname "$0")" || exit 1

echo "==============================================="
echo "   CodeXray - starting your dashboard..."
echo "==============================================="

# 1. Make sure Node.js is available (the only thing you must install once).
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is not installed."
  echo "Please install it once from https://nodejs.org (pick the 'LTS' button),"
  echo "then run this launcher again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

# 2. Open the dashboard in the browser a few seconds after the server boots.
( sleep 4; (command -v open >/dev/null 2>&1 && open "http://localhost:3001") || \
  (command -v xdg-open >/dev/null 2>&1 && xdg-open "http://localhost:3001") ) &

# 3. Install dependencies (first run only) and start the dashboard.
#    `npm start` runs `prestart` (npm install) automatically, then the server.
npm start
