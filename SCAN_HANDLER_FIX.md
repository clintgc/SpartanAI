# Scan Handler Fix - Results Extraction

## Problem

All 4 test images should return >89% from Captis, but we were seeing:
- `topScore: null`
- `matchLevel: null`
- Status: `COMPLETED` (but no results)

### Root Cause

The scan handler had a logic flaw:
1. **If Captis returned synchronously** (no `timedOutFlag`):
   - Status was set to `COMPLETED` immediately
   - Poll handler was **NOT triggered** (only triggered if `timedOutFlag=true`)
   - `topScore` was extracted from immediate response, but if Captis hadn't finished processing, `matches` array was empty
   - Result: `topScore = undefined`, `matchLevel = null`

2. **If Captis returned with `timedOutFlag=true`**:
   - Status was set to `PENDING`
   - Poll handler **WAS triggered** via EventBridge
   - Poll handler extracted `topScore` and `matchLevel` correctly
   - Result: ✅ Works correctly

## Solution

Modified `functions/scan-handler/index.ts` to:

### 1. Extract Results Immediately (if available)

```typescript
// Check if we have results immediately
const hasImmediateResults = captisResponse.matches && 
  captisResponse.matches.length > 0 && 
  captisResponse.status === 'COMPLETED' && 
  !captisResponse.timedOutFlag;

if (hasImmediateResults && captisResponse.matches && captisResponse.matches.length > 0) {
  // Extract results immediately and store in DynamoDB
  const topScore = captisResponse.matches[0].score;
  const thresholds = await thresholdService.getThresholds(accountID, 'captis');
  const matchLevel = topScore > thresholds.highThreshold 
    ? 'HIGH' 
    : topScore > thresholds.mediumThreshold 
      ? 'MEDIUM' 
      : topScore > thresholds.lowThreshold 
        ? 'LOW' 
        : undefined;

  // Update scan record with results
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.SCANS_TABLE_NAME!,
      Key: { scanId },
      UpdateExpression: 'SET topScore = :score, matchLevel = :level, viewMatchesUrl = :url, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':score': topScore,
        ':level': matchLevel || null,
        ':url': captisResponse.viewMatchesUrl || null,
        ':updated': new Date().toISOString(),
      },
    })
  );
}
```

### 2. Always Trigger Poll Handler (if no immediate results)

```typescript
else if (captisResponse.timedOutFlag || captisResponse.status !== 'COMPLETED') {
  // If timed out or not completed, trigger polling via EventBridge
  // ... trigger poll handler
} else {
  // Status is COMPLETED but no matches - still trigger poll handler to verify
  // This handles cases where Captis returns COMPLETED but results aren't in initial response
  // ... trigger poll handler
}
```

### 3. Return Accurate Results from DynamoDB

```typescript
// Get final scan record to return accurate status and topScore
const finalScan = await docClient.send(
  new GetCommand({
    TableName: process.env.SCANS_TABLE_NAME!,
    Key: { scanId },
  })
);

// Return response with results from DynamoDB
const response: ScanResponse = {
  scanId,
  status: (finalScan.Item?.status as string) || (captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED'),
  topScore: finalScan.Item?.topScore || captisResponse.matches?.[0]?.score,
  viewMatchesUrl: finalScan.Item?.viewMatchesUrl || captisResponse.viewMatchesUrl,
};
```

## Changes Made

1. **Added ThresholdService import** - To calculate matchLevel
2. **Added immediate results extraction** - If Captis returns results synchronously, extract and store them
3. **Always trigger poll handler** - If no immediate results, always trigger poll handler to get results
4. **Read from DynamoDB for response** - Return the most up-to-date results from DynamoDB

## Testing

### Test with S3 URLs:

```bash
# Test single image
./test-scan.sh "https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/Anthony-FL.jpeg"

# Test all images
for url in \
  "https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/Anthony-FL.jpeg" \
  "https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/ArmedRobbery-MI.webp" \
  "https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/ASSAULT-NC2.webp" \
  "https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/Burglary-OR.webp"; do
  echo "Testing: $url"
  ./test-scan.sh "$url"
  sleep 5
done
```

### Expected Results:

All 4 images should now show:
- `topScore: >89` (HIGH threat)
- `matchLevel: "HIGH"`
- `status: "COMPLETED"`

## Deployment

The fix is ready to deploy. The scan handler will now:
1. ✅ Extract results immediately if available
2. ✅ Always trigger poll handler if results aren't available
3. ✅ Store topScore and matchLevel in DynamoDB
4. ✅ Return accurate results in API response

## Files Modified

- `functions/scan-handler/index.ts` - Added immediate results extraction and always-trigger poll handler logic

