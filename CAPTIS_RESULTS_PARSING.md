# Captis Results Parsing - How topScore and matchLevel are Extracted

## Overview

This document explains how the Spartan AI system parses Captis API responses to extract `topScore` and `matchLevel` values.

---

## Flow Diagram

```
1. Scan Handler
   └─> Submits image to Captis API (async=true)
   └─> Gets captisId
   └─> Publishes EventBridge event to trigger Poll Handler

2. Poll Handler (EventBridge Trigger)
   └─> Polls Captis API until scan completes
   └─> Receives CaptisResolveResponse
   └─> Extracts topScore from result.matches[0].score
   └─> Calculates matchLevel based on thresholds
   └─> Updates DynamoDB scan record
   └─> Publishes to SNS topics if threat detected
```

---

## Code Location

**File:** `functions/poll-handler/index.ts`

**Key Lines:**
```typescript
// Line 34: Poll until complete
const result = await captisClient.pollUntilComplete(captisId, 120000, 5000);

// Line 40: Extract topScore from first match
const topScore = result.matches?.[0]?.score || 0;

// Lines 41-47: Calculate matchLevel based on thresholds
const matchLevel = topScore > thresholds.highThreshold 
  ? 'HIGH' 
  : topScore > thresholds.mediumThreshold 
    ? 'MEDIUM' 
    : topScore > thresholds.lowThreshold 
      ? 'LOW' 
      : undefined;

// Lines 49-64: Update DynamoDB with results
await docClient.send(
  new UpdateCommand({
    TableName: process.env.SCANS_TABLE_NAME!,
    Key: { scanId },
    UpdateExpression: 'SET #status = :status, topScore = :score, viewMatchesUrl = :url, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':status': result.status,
      ':score': topScore,
      ':url': result.viewMatchesUrl || null,
      ':updated': new Date().toISOString(),
    },
  })
);
```

---

## Captis API Response Structure

**Model:** `shared/models/index.ts` - `CaptisResolveResponse`

```typescript
export interface CaptisResolveResponse {
  id: string;                    // Captis scan ID
  status: string;                // "COMPLETED", "PROCESSING", "FAILED"
  matches?: Array<{
    id: string;
    score: number;               // Match score (0-100)
    scoreLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    subject: {
      id: string;
      name: string;
      type: string;
      photo?: string;
    };
  }>;
  biometrics?: Array<{...}>;
  crimes?: Array<{...}>;
  viewMatchesUrl?: string;       // URL to view matches in Captis UI
  timedOutFlag?: boolean;
}
```

---

## How topScore is Extracted

### Step 1: Poll Captis API

The poll handler calls `captisClient.pollUntilComplete()` which:
- Polls the Captis API every 5 seconds
- Checks if `status === "COMPLETED"`
- Returns the full `CaptisResolveResponse` when complete

### Step 2: Extract topScore

```typescript
const topScore = result.matches?.[0]?.score || 0;
```

**Logic:**
- Gets the first match from the `matches` array (highest score)
- Extracts the `score` field (0-100)
- Defaults to `0` if no matches found

**Example:**
```json
{
  "matches": [
    {
      "id": "match-123",
      "score": 85.5,        // ← This becomes topScore
      "scoreLevel": "HIGH",
      "subject": {...}
    },
    {
      "id": "match-456",
      "score": 72.3,
      ...
    }
  ]
}
```

Result: `topScore = 85.5`

---

## How matchLevel is Calculated

### Step 1: Get Thresholds

```typescript
const thresholds = await thresholdService.getThresholds(accountID, 'captis');
```

Returns thresholds with priority:
1. User-level (from account profile) - highest priority
2. Service-level (from DynamoDB) - medium priority (not yet implemented)
3. Global (from SSM Parameter Store) - lowest priority

**Default thresholds:**
- `highThreshold`: 89
- `mediumThreshold`: 75
- `lowThreshold`: 50

### Step 2: Calculate matchLevel

```typescript
const matchLevel = topScore > thresholds.highThreshold 
  ? 'HIGH' 
  : topScore > thresholds.mediumThreshold 
    ? 'MEDIUM' 
    : topScore > thresholds.lowThreshold 
      ? 'LOW' 
      : undefined;
```

**Logic:**
- If `topScore > 89`: `matchLevel = 'HIGH'`
- Else if `topScore > 75`: `matchLevel = 'MEDIUM'`
- Else if `topScore > 50`: `matchLevel = 'LOW'`
- Else: `matchLevel = undefined` (no threat)

**Examples:**
- `topScore = 95` → `matchLevel = 'HIGH'`
- `topScore = 80` → `matchLevel = 'MEDIUM'`
- `topScore = 60` → `matchLevel = 'LOW'`
- `topScore = 30` → `matchLevel = undefined`

---

## Why topScore/matchLevel Might Be Null

### Issue: Synchronous Captis Response

If Captis returns results **synchronously** (immediately), the scan handler might set `status: "COMPLETED"` but the **poll handler is never triggered** because:

1. Scan handler receives immediate response from Captis
2. Sets status to COMPLETED in DynamoDB
3. But doesn't trigger EventBridge event for poll handler
4. Poll handler never runs to extract topScore/matchLevel

### Solution: Check Scan Handler Code

**File:** `functions/scan-handler/index.ts`

The scan handler should:
1. Always use `async=true` when calling Captis
2. Always trigger EventBridge event for poll handler
3. Never set status to COMPLETED directly (let poll handler do it)

**Current behavior (needs verification):**
- If Captis returns synchronously, scan handler might set COMPLETED
- Poll handler might not be triggered
- Results never parsed

---

## How to Verify Results

### 1. Check DynamoDB

```bash
aws dynamodb get-item \
  --table-name spartan-ai-scans \
  --key '{"scanId": {"S": "YOUR_SCAN_ID"}}' \
  --region us-east-1 | jq '.Item'
```

**Look for:**
- `topScore.N` - Should be a number (0-100)
- `matchLevel.S` - Should be "HIGH", "MEDIUM", "LOW", or null
- `status.S` - Should be "COMPLETED"

### 2. Check Poll Handler Logs

```bash
aws logs tail /aws/lambda/spartan-ai-poll-handler \
  --since 10m \
  --format short \
  --region us-east-1
```

**Look for:**
- "Poll handler invoked"
- "topScore" in logs
- "matchLevel" in logs
- "Publishing to HIGH_THREAT_TOPIC_ARN" or "MEDIUM_THREAT_TOPIC_ARN"

### 3. Check EventBridge Events

```bash
aws events list-rules --name-prefix "poll-scan" --region us-east-1
```

Verify that EventBridge rule exists to trigger poll handler.

---

## Troubleshooting

### Problem: topScore is null

**Possible causes:**
1. Poll handler never ran (EventBridge event not triggered)
2. Captis returned no matches (`matches` array is empty)
3. Captis response format changed
4. Poll handler error (check CloudWatch logs)

**Fix:**
1. Check if EventBridge event was published
2. Check poll handler logs for errors
3. Verify Captis response structure
4. Manually trigger poll handler if needed

### Problem: matchLevel is null

**Possible causes:**
1. `topScore` is null (see above)
2. `topScore` is below `lowThreshold` (default: 50)
3. Thresholds not configured correctly

**Fix:**
1. Check `topScore` value
2. Verify thresholds are set correctly
3. Check threshold service logs

---

## Example: Complete Flow

### 1. Scan Submitted

```json
{
  "scanId": "scan-123",
  "captisId": "captis-456",
  "status": "PENDING"
}
```

### 2. EventBridge Event Published

```json
{
  "detail": {
    "scanId": "scan-123",
    "captisId": "captis-456",
    "accountID": "account-789",
    "captisAccessKey": "key-abc"
  }
}
```

### 3. Poll Handler Runs

- Polls Captis API
- Gets response with matches
- Extracts `topScore = 85.5`
- Calculates `matchLevel = 'MEDIUM'` (85.5 > 75 but <= 89)

### 4. DynamoDB Updated

```json
{
  "scanId": "scan-123",
  "status": "COMPLETED",
  "topScore": 85.5,
  "matchLevel": "MEDIUM",
  "viewMatchesUrl": "https://..."
}
```

### 5. SNS Topic Published

- Publishes to `MEDIUM_THREAT_TOPIC_ARN`
- Alert handler processes and sends FCM notification

---

## Key Files

- **Poll Handler:** `functions/poll-handler/index.ts`
- **Captis Client:** `shared/services/captis-client.ts`
- **Models:** `shared/models/index.ts`
- **Threshold Service:** `shared/services/threshold-service.ts`

---

## Summary

1. **topScore** = `result.matches[0].score` (first/highest match score)
2. **matchLevel** = Calculated from `topScore` using configurable thresholds
3. **Poll handler** must run to extract and store these values
4. **EventBridge** triggers poll handler after scan is submitted
5. If poll handler doesn't run, `topScore` and `matchLevel` will be null

