#!/bin/bash
# Webhook registration and dispatch test script for Thermopylae-Stage

set -e

API_BASE_URL="https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1"
API_KEY="gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl"
ACCOUNT_ID="550e8400-e29b-41d4-a716-446655440000"

echo "=== Testing Webhook Registration ==="
echo ""

# Test 1: Register a webhook with a test endpoint (using webhook.site for testing)
echo "Test 1: Register webhook with test endpoint..."
WEBHOOK_URL="https://webhook.site/unique-id-$(date +%s)"
REGISTER_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/v1/webhooks" \
  -H "x-api-key: ${API_KEY}" \
  -H "x-account-id: ${ACCOUNT_ID}" \
  -H "Content-Type: application/json" \
  -d "{
    \"webhookUrl\": \"${WEBHOOK_URL}\",
    \"accountID\": \"${ACCOUNT_ID}\"
  }")

HTTP_CODE=$(echo "$REGISTER_RESPONSE" | tail -n1)
BODY=$(echo "$REGISTER_RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"
echo ""

if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  WEBHOOK_ID=$(echo "$BODY" | grep -o '"webhookId":"[^"]*"' | cut -d'"' -f4)
  echo "✓ Webhook registered successfully. Webhook ID: $WEBHOOK_ID"
  echo ""
  
  # Test 2: Try to register duplicate webhook (should fail or return existing)
  echo "Test 2: Attempt to register duplicate webhook..."
  DUPLICATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/v1/webhooks" \
    -H "x-api-key: ${API_KEY}" \
    -H "x-account-id: ${ACCOUNT_ID}" \
    -H "Content-Type: application/json" \
    -d "{
      \"webhookUrl\": \"${WEBHOOK_URL}\",
      \"accountID\": \"${ACCOUNT_ID}\"
    }")
  
  DUPLICATE_HTTP_CODE=$(echo "$DUPLICATE_RESPONSE" | tail -n1)
  DUPLICATE_BODY=$(echo "$DUPLICATE_RESPONSE" | sed '$d')
  echo "HTTP Status: $DUPLICATE_HTTP_CODE"
  echo "Response: $DUPLICATE_BODY"
  echo ""
  
  # Test 3: Try invalid webhook URL (HTTP instead of HTTPS)
  echo "Test 3: Attempt to register webhook with invalid URL (HTTP)..."
  INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/v1/webhooks" \
    -H "x-api-key: ${API_KEY}" \
    -H "x-account-id: ${ACCOUNT_ID}" \
    -H "Content-Type: application/json" \
    -d "{
      \"webhookUrl\": \"http://example.com/webhook\",
      \"accountID\": \"${ACCOUNT_ID}\"
    }")
  
  INVALID_HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
  INVALID_BODY=$(echo "$INVALID_RESPONSE" | sed '$d')
  echo "HTTP Status: $INVALID_HTTP_CODE"
  echo "Response: $INVALID_BODY"
  echo ""
  
  # Test 4: Try private IP address
  echo "Test 4: Attempt to register webhook with private IP..."
  PRIVATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE_URL}/api/v1/webhooks" \
    -H "x-api-key: ${API_KEY}" \
    -H "x-account-id: ${ACCOUNT_ID}" \
    -H "Content-Type: application/json" \
    -d "{
      \"webhookUrl\": \"https://192.168.1.1/webhook\",
      \"accountID\": \"${ACCOUNT_ID}\"
    }")
  
  PRIVATE_HTTP_CODE=$(echo "$PRIVATE_RESPONSE" | tail -n1)
  PRIVATE_BODY=$(echo "$PRIVATE_RESPONSE" | sed '$d')
  echo "HTTP Status: $PRIVATE_HTTP_CODE"
  echo "Response: $PRIVATE_BODY"
  echo ""
  
  echo "=== Webhook Registration Tests Complete ==="
  echo ""
  echo "Note: To test webhook dispatch, trigger a scan with a high match score (>89%)"
  echo "      The webhook should be called automatically via the alert-handler."
  
else
  echo "✗ Webhook registration failed. Cannot proceed with additional tests."
  exit 1
fi

