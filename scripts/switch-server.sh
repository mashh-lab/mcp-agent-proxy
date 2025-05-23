#!/bin/bash

# switch-server.sh - Helper script to switch between Mastra servers

case $1 in
  "1"|"server1"|"4111")
    echo "Switching to Mastra Server 1 (localhost:4111)..."
    cp .env.server1 .env
    echo "✅ Now pointing to http://localhost:4111"
    ;;
  "2"|"server2"|"4222")
    echo "Switching to Mastra Server 2 (localhost:4222)..."
    cp .env.server2 .env
    echo "✅ Now pointing to http://localhost:4222"
    ;;
  *)
    echo "Usage: $0 [1|2|server1|server2|4111|4222]"
    echo "  1/server1/4111  - Switch to localhost:4111"
    echo "  2/server2/4222  - Switch to localhost:4222"
    exit 1
    ;;
esac

echo "Restart your MCP proxy server for changes to take effect:"
echo "  pnpm start" 