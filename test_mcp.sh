#!/bin/bash
set -e

URL="https://<your-worker>.workers.dev/mcp"

echo "=== 1. initialize ==="
INIT_RESPONSE=$(curl -s -i -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}')
echo "$INIT_RESPONSE"

SID=$(echo "$INIT_RESPONSE" | grep -i "^mcp-session-id" | awk '{print $2}' | tr -d '\r')
echo
echo "Session ID: $SID"
echo

echo "=== 2. notifications/initialized ==="
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo "(no output expected — 202 Accepted)"
echo

echo "=== 3. tools/list ==="
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
echo
echo

echo "=== 4. tools/call (log_voice_note) ==="
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"log_voice_note","arguments":{"text":"manual curl test"}}}'
echo
