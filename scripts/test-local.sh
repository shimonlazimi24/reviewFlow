#!/bin/bash

# Quick test script for ReviewFlow

echo "🧪 Testing ReviewFlow..."

# Check if server is running
echo "1. Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3000/health)
if [ $? -eq 0 ]; then
    echo "✅ Health check passed"
    echo "Response: $HEALTH"
else
    echo "❌ Health check failed - is the server running?"
    echo "Start it with: npm run dev"
    exit 1
fi

echo ""
echo "2. Testing GitHub webhook endpoint..."
WEBHOOK_RESPONSE=$(curl -s -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d @test-webhook.json)

if [ $? -eq 0 ]; then
    echo "✅ Webhook endpoint responded"
    echo "Response: $WEBHOOK_RESPONSE"
else
    echo "❌ Webhook test failed"
fi

echo ""
echo "3. Check your Slack channel for PR message"
echo "4. Check console logs for any errors"


