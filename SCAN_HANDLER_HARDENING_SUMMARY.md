# Scan Handler Hardening Summary

## Overview
The scan handler (`POST /api/v1/scan`) has been comprehensively hardened with input validation, structured logging, improved error handling, and performance optimizations to meet production readiness standards.

## Improvements Implemented

### 1. Input Validation with Zod ✅

**Before:** Basic JSON parsing with no validation
```typescript
const request: ScanRequest = JSON.parse(event.body);
```

**After:** Comprehensive Zod schema validation
```typescript
const validationResult = safeValidateRequest(ScanRequestSchema, parsedBody);
if (!validationResult.success) {
  return {
    statusCode: 400,
    body: JSON.stringify(formatValidationError(validationResult.error)),
  };
}
```

**Benefits:**
- Runtime type safety prevents injection attacks
- Validates UUID format for `accountID`
- Validates latitude/longitude ranges (-90 to 90, -180 to 180)
- Validates ISO8601 timestamp format
- Validates image format (base64 or HTTP/HTTPS URL)
- Provides detailed error messages for each validation failure

**Schema Details:**
- `image`: String (base64 or HTTP/HTTPS URL)
- `metadata.accountID`: UUID format
- `metadata.cameraID`: 1-100 characters
- `metadata.location.lat`: -90 to 90
- `metadata.location.lon`: -180 to 180
- `metadata.timestamp`: ISO8601 datetime (optional)

### 2. Malformed JSON Handling ✅

**Before:** Could throw unhandled exception on malformed JSON
```typescript
const request: ScanRequest = JSON.parse(event.body);
```

**After:** Graceful error handling with proper HTTP status
```typescript
let parsedBody: unknown;
try {
  parsedBody = JSON.parse(event.body);
} catch (parseError) {
  logError(parseError, { requestId, errorType: 'JSON_PARSE_ERROR' });
  return {
    statusCode: 400,
    body: JSON.stringify({
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
    }),
  };
}
```

**Benefits:**
- Prevents Lambda crashes from malformed JSON
- Returns proper 400 Bad Request status
- Logs error for debugging
- Handles `undefined` event.body gracefully

### 3. Structured Logging ✅

**Before:** Basic console.log statements
```typescript
console.log('Scan handler invoked', JSON.stringify(event, null, 2));
console.error('Scan handler error:', error);
```

**After:** JSON-structured logging with context
```typescript
function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, any>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'scan-handler',
    ...data,
  };
  console.log(JSON.stringify(logEntry));
}

function logError(error: unknown, context?: Record<string, any>) {
  const errorData: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'scan-handler',
    ...context,
  };

  if (error instanceof Error) {
    errorData.error = {
      name: error.name,
      message: error.message,
      stack: error.stack, // Includes full stack trace
    };
  }
  console.error(JSON.stringify(errorData));
}
```

**Benefits:**
- CloudWatch Logs Insights compatible (JSON format)
- Includes request ID for tracing
- Includes error stack traces
- Structured context data for debugging
- Easy filtering by level, service, or request ID

**Example Log Output:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Scan request completed successfully",
  "service": "scan-handler",
  "requestId": "abc-123",
  "scanId": "scan-456",
  "status": "COMPLETED",
  "topScore": 85
}
```

### 4. Captis Error Handling ✅

**Before:** Generic error handling
```typescript
catch (error) {
  console.error('Scan handler error:', error);
  return { statusCode: 500, body: 'Internal error' };
}
```

**After:** Specific error mapping for Captis API errors
```typescript
function handleCaptisError(error: unknown): { statusCode: number; message: string } {
  if (axios.isAxiosError(error)) {
    const status = axiosError.response?.status;

    // Map Captis 400/401 errors to 403 (Forbidden) for security
    if (status === 400 || status === 401) {
      return {
        statusCode: 403,
        message: 'Invalid Captis credentials or request format',
      };
    }

    // Handle 429 rate limiting
    if (status === 429) {
      return {
        statusCode: 429,
        message: 'Captis API rate limit exceeded. Please try again later.',
      };
    }

    // Handle 5xx errors
    if (status && status >= 500) {
      return {
        statusCode: 503,
        message: 'Captis service temporarily unavailable',
      };
    }
  }
  // ...
}
```

**Benefits:**
- Maps Captis 400/401 to 403 (prevents credential leakage)
- Handles rate limiting (429) appropriately
- Distinguishes between client errors (4xx) and server errors (5xx)
- Provides user-friendly error messages
- Prevents information leakage about internal errors

### 5. Early Image Memory Cleanup ✅

**Before:** Image buffer cleared after all processing
```typescript
const captisResponse = await captisClient.resolve({...});
// ... lots of processing ...
imageBuffer = null as any; // Cleared much later
```

**After:** Image buffer cleared immediately after forwarding to Captis
```typescript
const captisResponse = await captisClient.resolve({...});

// Audit log: Image forwarded to Captis, now discard immediately
log('info', 'Image forwarded to Captis', { scanId, captisId: captisResponse.id });

// Explicitly clear image buffer immediately after forwarding to free memory
if (Buffer.isBuffer(imageBuffer)) {
  imageBuffer.fill(0); // Overwrite with zeros for security
  imageBuffer = null;
}
imageBuffer = null;

// ... rest of processing (quota, DB writes, etc.) ...
```

**Benefits:**
- Reduces memory footprint during processing
- Overwrites buffer with zeros for security (prevents memory dumps)
- Frees memory earlier in the execution flow
- Includes `finally` block to ensure cleanup even on errors

### 6. Timeout Wrapper ✅

**Before:** No timeout protection for initial response
```typescript
const captisResponse = await captisClient.resolve({...});
```

**After:** Timeout wrapper for initial Captis API call
```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

// Usage:
const captisResponse = await withTimeout(
  captisClient.resolve({...}),
  INITIAL_RESPONSE_TIMEOUT, // 5 seconds
  'Captis API request timeout'
);
```

**Benefits:**
- Prevents Lambda timeout from hanging Captis calls
- Ensures initial response within 5 seconds
- Better user experience (faster error feedback)
- Prevents resource exhaustion

### 7. Enhanced CORS Headers ✅

**Before:** Basic CORS headers
```typescript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}
```

**After:** Comprehensive CORS configuration
```typescript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Captis-Access-Key,X-Account-ID',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};
```

**Benefits:**
- Supports all required headers for API Gateway
- Explicitly allows OPTIONS method for preflight
- Consistent CORS headers across all responses

### 8. Race Condition Safety (Already Implemented) ✅

**Status:** Already fixed in previous hardening

The quota increment uses atomic conditional updates:
```typescript
await docClient.send(
  new UpdateCommand({
    TableName: process.env.QUOTAS_TABLE_NAME!,
    Key: { accountID, year },
    UpdateExpression: 'ADD scansUsed :inc SET scansLimit = :limit',
    ConditionExpression: 'scansUsed < :limit', // Prevents overrun
    ExpressionAttributeValues: {
      ':inc': 1,
      ':limit': SCANS_LIMIT,
    },
  })
);
```

**Benefits:**
- Prevents quota overrun in concurrent requests
- Uses DynamoDB conditional updates (atomic)
- Handles `ConditionalCheckFailedException` gracefully

### 9. Polling Logic (EventBridge-Based) ✅

**Status:** Already implemented with EventBridge

The handler uses EventBridge for async polling instead of inline polling:
```typescript
if (captisResponse.timedOutFlag) {
  // Trigger EventBridge event to start polling
  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [{
        Source: 'spartan-ai.scan',
        DetailType: 'Scan Timeout',
        Detail: JSON.stringify({
          scanId,
          captisId: captisResponse.id,
          accountID,
          captisAccessKey,
        }),
      }],
    })
  );
}
```

**Benefits:**
- Decouples polling from main handler (better scalability)
- Poll handler can implement exponential backoff independently
- Prevents Lambda timeout from long polling loops
- Better separation of concerns

**Note:** The poll handler (`functions/poll-handler/index.ts`) already implements exponential backoff with max attempts (24 attempts, 5s to 10s delays, 120s total).

## Security Improvements

1. **Input Validation:** Prevents injection attacks and malformed data
2. **Error Handling:** Maps Captis 400/401 to 403 (prevents credential leakage)
3. **Memory Security:** Overwrites image buffer with zeros before clearing
4. **Structured Logging:** Prevents log injection attacks (JSON escaping)
5. **Request ID Tracking:** Enables security audit trails

## Performance Improvements

1. **Early Memory Cleanup:** Image buffer cleared immediately after use
2. **Timeout Protection:** Prevents hanging requests
3. **Structured Logging:** Faster CloudWatch Logs Insights queries
4. **Error Context:** Faster debugging reduces MTTR

## Reliability Improvements

1. **Graceful Error Handling:** All error paths return proper HTTP status codes
2. **Structured Logging:** Better observability for production debugging
3. **Request ID Tracking:** Enables end-to-end request tracing
4. **Timeout Protection:** Prevents resource exhaustion

## Code Quality Improvements

1. **Type Safety:** Zod validation ensures runtime type safety
2. **Error Messages:** User-friendly error messages
3. **Logging:** Comprehensive logging for all operations
4. **Constants:** Magic numbers extracted to named constants
5. **Helper Functions:** Reusable error handling and logging utilities

## Testing Recommendations

1. **Unit Tests:**
   - Test Zod validation with various invalid inputs
   - Test error handling for different Captis error codes
   - Test timeout wrapper behavior
   - Test memory cleanup in error scenarios

2. **Integration Tests:**
   - Test full scan flow with valid requests
   - Test quota enforcement
   - Test consent validation
   - Test EventBridge polling trigger

3. **Load Tests:**
   - Test concurrent quota increments (race condition safety)
   - Test memory usage under load
   - Test timeout behavior under high load

## Deployment Checklist

- ✅ Input validation with Zod
- ✅ Malformed JSON handling
- ✅ Structured logging
- ✅ Captis error handling (400/401 → 403)
- ✅ Early image memory cleanup
- ✅ Timeout wrapper (5s initial response)
- ✅ Enhanced CORS headers
- ✅ Race condition safety (atomic quota updates)
- ✅ Request ID tracking
- ✅ Error stack traces in logs

## Next Steps

1. **Monitor:** Set up CloudWatch alarms for error rates
2. **Metrics:** Track validation failures, Captis errors, timeouts
3. **Alerting:** Alert on high error rates or quota warnings
4. **Documentation:** Update API documentation with validation requirements

