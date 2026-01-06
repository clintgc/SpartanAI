# Postman Testing Guide - Spartan AI API

This guide will help you test the Spartan AI API using Postman.

## Quick Start

### Option 1: Import Existing Collection

1. **Open Postman** and click "Import" button
2. **Select File** and choose: `SpartanAI-Thermopylae-Stage.postman_collection.json`
3. The collection will be imported with pre-configured requests

### Option 2: Manual Setup

Follow the steps below to set up manually.

---

## 1. Setup Environment Variables

Create a Postman Environment with these variables:

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `baseUrl` | `https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1` | API Gateway base URL |
| `apiKey` | `gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl` | API key for authentication |
| `accountId` | `550e8400-e29b-41d4-a716-446655440000` | Test account ID |

### Steps to Create Environment:

1. Click **"Environments"** in left sidebar
2. Click **"+"** to create new environment
3. Name it: `Spartan AI - Staging`
4. Add the variables above
5. Click **"Save"**
6. Select the environment from the dropdown (top right)

---

## 2. Required Headers

All authenticated endpoints require these headers:

| Header | Value | Required |
|--------|-------|----------|
| `x-api-key` | `{{apiKey}}` | ✅ Yes (all authenticated endpoints) |
| `x-account-id` | `{{accountId}}` | ✅ Yes (most endpoints) |
| `Content-Type` | `application/json` | ✅ Yes (POST/PUT requests) |

---

## 3. API Endpoints

### 3.1 POST /api/v1/scan

**Purpose:** Submit an image for threat detection

**Method:** `POST`  
**URL:** `{{baseUrl}}/api/v1/scan`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "image": "https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg",
  "metadata": {
    "cameraID": "test-cam-001",
    "accountID": "{{accountId}}",
    "location": {
      "lat": 37.7749,
      "lon": -122.4194
    },
    "timestamp": "2024-12-19T12:00:00Z"
  }
}
```

**Alternative (Base64 Image):**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  "metadata": {
    "cameraID": "test-cam-001",
    "accountID": "{{accountId}}",
    "location": {
      "lat": 37.7749,
      "lon": -122.4194
    },
    "timestamp": "2024-12-19T12:00:00Z"
  }
}
```

**Expected Response (200/202):**
```json
{
  "scanId": "scan-12345-abcde",
  "captisId": "captis-67890-fghij",
  "status": "PENDING"
}
```

**Save the `scanId` for the next request!**

---

### 3.2 GET /api/v1/scan/{id}

**Purpose:** Get scan details by scan ID

**Method:** `GET`  
**URL:** `{{baseUrl}}/api/v1/scan/{{scanId}}`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
```

**Path Variables:**
- Replace `{{scanId}}` with the scanId from POST /scan response

**Expected Response (200):**
```json
{
  "scanId": "scan-12345-abcde",
  "status": "COMPLETED",
  "topScore": 85.5,
  "matchLevel": "MEDIUM",
  "matches": [
    {
      "subjectId": "subject-123",
      "score": 85.5,
      "name": "John Doe"
    }
  ],
  "createdAt": "2024-12-19T12:00:00Z",
  "completedAt": "2024-12-19T12:00:15Z"
}
```

**Status Values:**
- `PENDING` - Scan submitted, waiting for processing
- `PROCESSING` - Polling Captis API
- `COMPLETED` - Scan completed with results
- `FAILED` - Scan failed

---

### 3.3 GET /api/v1/scans

**Purpose:** List scans with pagination

**Method:** `GET`  
**URL:** `{{baseUrl}}/api/v1/scans`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
```

**Query Parameters (optional):**
- `limit` - Number of results (default: 50, max: 100)
- `nextToken` - Pagination token from previous response
- `accountID` - Filter by account (must match x-account-id header)

**Example URL:**
```
{{baseUrl}}/api/v1/scans?limit=10&accountID={{accountId}}
```

**Expected Response (200):**
```json
{
  "scans": [
    {
      "scanId": "scan-12345-abcde",
      "accountID": "550e8400-e29b-41d4-a716-446655440000",
      "status": "COMPLETED",
      "topScore": 85.5,
      "createdAt": "2024-12-19T12:00:00Z"
    }
  ],
  "nextToken": "eyJzY2FuSWQiOiJzY2FuLTEyMzQ1LWFiY2RlIn0="
}
```

---

### 3.4 PUT /api/v1/consent

**Purpose:** Update consent status (opt-in/opt-out)

**Method:** `PUT`  
**URL:** `{{baseUrl}}/api/v1/consent`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "consentStatus": true
}
```

**Expected Response (200):**
```json
{
  "accountID": "550e8400-e29b-41d4-a716-446655440000",
  "consentStatus": true,
  "updatedAt": "2024-12-19T12:00:00Z"
}
```

**Note:** Setting `consentStatus: false` will opt-out the account from scans.

---

### 3.5 POST /api/v1/webhooks

**Purpose:** Register webhook URL for NOC endpoints

**Method:** `POST`  
**URL:** `{{baseUrl}}/api/v1/webhooks`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "accountID": "{{accountId}}",
  "webhookUrl": "https://your-noc-endpoint.com/webhook"
}
```

**Expected Response (200):**
```json
{
  "accountID": "550e8400-e29b-41d4-a716-446655440000",
  "webhookUrl": "https://your-noc-endpoint.com/webhook",
  "createdAt": "2024-12-19T12:00:00Z"
}
```

**Validation Rules:**
- URL must use HTTPS
- URL cannot be a private IP address
- URL must be accessible from AWS

---

### 3.6 GET /api/v1/thresholds

**Purpose:** Get current threat score thresholds for account

**Method:** `GET`  
**URL:** `{{baseUrl}}/api/v1/thresholds`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
```

**Expected Response (200):**
```json
{
  "accountID": "550e8400-e29b-41d4-a716-446655440000",
  "thresholds": {
    "highThreshold": 89,
    "mediumThreshold": 75,
    "lowThreshold": 50
  },
  "source": "global"
}
```

**Source Values:**
- `user` - User-level custom thresholds
- `service` - Service-level defaults (not yet implemented)
- `global` - Global defaults from SSM

---

### 3.7 PUT /api/v1/thresholds

**Purpose:** Update user-level threat score thresholds

**Method:** `PUT`  
**URL:** `{{baseUrl}}/api/v1/thresholds`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "highThreshold": 95,
  "mediumThreshold": 85,
  "lowThreshold": 70
}
```

**Validation Rules:**
- All thresholds must be numbers between 0-100
- `highThreshold` > `mediumThreshold` > `lowThreshold`
- Example: `highThreshold: 95, mediumThreshold: 85, lowThreshold: 70` ✅
- Example: `highThreshold: 80, mediumThreshold: 90, lowThreshold: 70` ❌ (invalid order)

**Expected Response (200):**
```json
{
  "accountID": "550e8400-e29b-41d4-a716-446655440000",
  "thresholds": {
    "highThreshold": 95,
    "mediumThreshold": 85,
    "lowThreshold": 70,
    "updatedAt": "2024-12-19T12:00:00Z",
    "updatedBy": "user"
  },
  "message": "Thresholds updated successfully"
}
```

---

### 3.8 DELETE /api/v1/gdpr/{accountID}

**Purpose:** Delete all user data (GDPR compliance)

**Method:** `DELETE`  
**URL:** `{{baseUrl}}/api/v1/gdpr/{{accountId}}`

**Headers:**
```
x-api-key: {{apiKey}}
x-account-id: {{accountId}}
```

**Path Variables:**
- Replace `{{accountId}}` with the account ID to delete

**⚠️ WARNING:** This permanently deletes all data for the account:
- All scans
- Quota records
- Consent status
- Webhook subscriptions
- Device tokens
- Account profile

**Expected Response (200):**
```json
{
  "message": "All data deleted for account",
  "accountID": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### 3.9 POST /api/v1/demo-request (Public)

**Purpose:** Submit demo request form (no API key required)

**Method:** `POST`  
**URL:** `{{baseUrl}}/api/v1/demo-request`

**Headers:**
```
Content-Type: application/json
Origin: https://www.spartan.tech
```

**Note:** This endpoint does NOT require `x-api-key` or `x-account-id` headers.

**Body (raw JSON):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "company": "Acme Corp",
  "email": "john.doe@example.com",
  "phone": "555-123-4567"
}
```

**Required Fields:**
- `firstName` ✅
- `lastName` ✅
- `company` ✅
- `email` ✅
- `phone` ⚠️ (optional)

**Expected Response (200):**
```json
{
  "message": "Demo request submitted successfully",
  "success": true
}
```

**Known Issue:** ⚠️ SES email verification pending - emails will not be sent until `noreply@spartan.tech` and `sales@spartan.tech` are verified in AWS SES.

---

## 4. Testing Workflows

### Workflow 1: Complete Scan Flow

1. **Submit Scan** → `POST /api/v1/scan`
   - Save `scanId` from response
   
2. **Check Scan Status** → `GET /api/v1/scan/{scanId}`
   - Poll until `status: "COMPLETED"` or `status: "FAILED"`
   - Check `topScore` and `matchLevel`
   
3. **List All Scans** → `GET /api/v1/scans`
   - Verify scan appears in list

### Workflow 2: Threshold Configuration

1. **Get Current Thresholds** → `GET /api/v1/thresholds`
   - Note current values
   
2. **Update Thresholds** → `PUT /api/v1/thresholds`
   - Set custom values (e.g., 95/85/70)
   
3. **Verify Update** → `GET /api/v1/thresholds`
   - Confirm `source: "user"` and new values
   
4. **Submit Test Scan** → `POST /api/v1/scan`
   - Verify alerts use new thresholds

### Workflow 3: Consent Management

1. **Check Consent** → `GET /api/v1/scans` (will fail if no consent)
   
2. **Update Consent** → `PUT /api/v1/consent`
   - Set `consentStatus: true`
   
3. **Submit Scan** → `POST /api/v1/scan`
   - Should succeed now
   
4. **Opt-Out** → `PUT /api/v1/consent`
   - Set `consentStatus: false`
   
5. **Submit Scan** → `POST /api/v1/scan`
   - Should fail with 403 Forbidden

### Workflow 4: Webhook Registration

1. **Register Webhook** → `POST /api/v1/webhooks`
   - Use a test webhook URL (e.g., https://webhook.site/unique-id)
   
2. **Submit High-Threat Scan** → `POST /api/v1/scan`
   - Use image that scores >89%
   
3. **Check Webhook** → Visit webhook.site URL
   - Verify webhook was called with threat data

---

## 5. Common Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Missing required field: image"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Consent not granted for this account"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Scan not found: scan-12345"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An error occurred while processing the request"
}
```

---

## 6. Postman Collection Structure

### Recommended Folder Structure:

```
Spartan AI API
├── Scans
│   ├── POST Submit Scan
│   ├── GET Scan Details
│   └── GET List Scans
├── Consent
│   └── PUT Update Consent
├── Webhooks
│   └── POST Register Webhook
├── Thresholds
│   ├── GET Get Thresholds
│   └── PUT Update Thresholds
├── GDPR
│   └── DELETE Delete Account Data
└── Public
    └── POST Demo Request
```

---

## 7. Tips & Best Practices

### 7.1 Using Variables

Use Postman variables to avoid hardcoding values:

1. **Set Variables from Response:**
   - In Tests tab, add:
   ```javascript
   var jsonData = pm.response.json();
   pm.environment.set("scanId", jsonData.scanId);
   ```

2. **Use Variables in Requests:**
   - Use `{{scanId}}` in URL path
   - Use `{{accountId}}` in headers and body

### 7.2 Pre-request Scripts

Add pre-request scripts to auto-generate values:

```javascript
// Auto-generate timestamp
pm.environment.set("timestamp", new Date().toISOString());

// Auto-generate camera ID
pm.environment.set("cameraId", "test-cam-" + Date.now());
```

### 7.3 Tests Tab

Add assertions to verify responses:

```javascript
// Check status code
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Check response structure
pm.test("Response has scanId", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('scanId');
});

// Save scanId for next request
var jsonData = pm.response.json();
if (jsonData.scanId) {
    pm.environment.set("scanId", jsonData.scanId);
}
```

### 7.4 Collection Runner

Use Collection Runner to run multiple requests in sequence:

1. Click **"..."** on collection → **"Run collection"**
2. Select requests to run
3. Set iterations and delay
4. Click **"Run"**

---

## 8. Troubleshooting

### Issue: "Invalid API key"

**Solution:**
- Verify `x-api-key` header is set correctly
- Check environment variable `apiKey` is set
- Ensure API key is not expired

### Issue: "Consent not granted"

**Solution:**
- Call `PUT /api/v1/consent` with `consentStatus: true`
- Verify `x-account-id` header matches account ID in consent record

### Issue: "Rate limit exceeded"

**Solution:**
- Wait a few seconds before retrying
- Check usage plan limits (100 req/sec, 10,000/day)

### Issue: "Scan not found"

**Solution:**
- Verify `scanId` is correct
- Ensure `x-account-id` matches the scan's account ID
- Check scan exists in `GET /api/v1/scans`

### Issue: "Invalid threshold values"

**Solution:**
- Ensure all thresholds are numbers (0-100)
- Verify order: `highThreshold > mediumThreshold > lowThreshold`
- Example valid: `95 > 85 > 70` ✅
- Example invalid: `80 > 90 > 70` ❌

---

## 9. Example Test Scenarios

### Scenario 1: High Threat Alert

1. Set thresholds: `highThreshold: 85` (lower for testing)
2. Submit scan with known high-score image
3. Poll scan until completed
4. Verify `matchLevel: "HIGH"`
5. Check CloudWatch logs for SMS/FCM/webhook delivery

### Scenario 2: Medium Threat Alert

1. Set thresholds: `mediumThreshold: 70`
2. Submit scan with medium-score image
3. Poll scan until completed
4. Verify `matchLevel: "MEDIUM"`
5. Check CloudWatch logs for FCM delivery (no SMS/webhook)

### Scenario 3: Quota Exceeded

1. Submit many scans (exceed 14,400/year limit)
2. Verify 403 Forbidden response
3. Check error message: "Quota exceeded"

### Scenario 4: Pagination

1. Submit multiple scans
2. Call `GET /api/v1/scans?limit=5`
3. Save `nextToken` from response
4. Call `GET /api/v1/scans?limit=5&nextToken={{nextToken}}`
5. Verify different results

---

## 10. API Documentation

### OpenAPI Spec

The API has an OpenAPI 3.0 specification available at:
- Check CloudFormation outputs for `ApiDocumentationUrl`
- Or visit: `https://spartan-ai-api-docs-{ACCOUNT_ID}.s3.amazonaws.com/api-docs/openapi.json`

### Swagger UI

Interactive API documentation:
- Check CloudFormation outputs for `SwaggerUIUrl`
- Or visit: `https://spartan-ai-api-docs-{ACCOUNT_ID}.cloudfront.net`

---

## 11. Quick Reference

### Base URL
```
https://yedpdu8io5.execute-api.us-east-1.amazonaws.com/v1
```

### Required Headers (Authenticated)
```
x-api-key: gHpRowMGemasl3kp73vuv94KLI14f0hU1t5sNDyl
x-account-id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json
```

### Test Account ID
```
550e8400-e29b-41d4-a716-446655440000
```

### Test Image URL
```
https://s.abcnews.com/images/US/decarlos-brown-ht-jef-250909_1757430530395_hpEmbed_4x5_992.jpg
```

---

## 12. Next Steps

1. **Import the collection** from `SpartanAI-Thermopylae-Stage.postman_collection.json`
2. **Set up environment variables** (see Section 1)
3. **Start with POST /scan** to submit your first scan
4. **Use GET /scan/{id}** to check results
5. **Explore other endpoints** based on your needs

For more detailed testing workflows, see:
- `ALERTING_FLOW_TEST_GUIDE.md` - Testing alerting flows
- `PROJECT_STATUS_OVERVIEW.md` - Complete project status

---

**Happy Testing! 🚀**

