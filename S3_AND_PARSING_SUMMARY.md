# S3 Image Upload & Captis Results Parsing Summary

## ✅ Task 1: Upload Images to S3

### S3 Bucket Created:
- **Bucket Name:** `spartan-ai-test-images-1767651941`
- **Region:** `us-east-1`
- **Access:** Public read (via bucket policy)

### Image URLs Generated:

1. **Anthony-FL.jpeg**
   ```
   https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/Anthony-FL.jpeg
   ```

2. **ArmedRobbery-MI.webp**
   ```
   https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/ArmedRobbery-MI.webp
   ```

3. **ASSAULT-NC2.webp**
   ```
   https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/ASSAULT-NC2.webp
   ```

4. **Burglary-OR.webp**
   ```
   https://spartan-ai-test-images-1767651941.s3.us-east-1.amazonaws.com/Burglary-OR.webp
   ```

### Test Commands:

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

### Upload Script:
- **File:** `upload-test-images-to-s3.sh`
- **Usage:** `./upload-test-images-to-s3.sh [bucket-name]`
- Creates bucket, sets public access, uploads all 4 images

---

## ✅ Task 2: How Captis Results are Parsed

### Flow Overview:

```
1. Scan Handler
   └─> Calls Captis API with async=true
   └─> Gets immediate response with captisId
   └─> If timedOutFlag=true → Triggers EventBridge → Poll Handler
   └─> If timedOutFlag=false → Sets status=COMPLETED (but may not have results)

2. Poll Handler (if triggered)
   └─> Polls Captis API until status=COMPLETED
   └─> Extracts: topScore = result.matches[0].score
   └─> Calculates: matchLevel based on thresholds
   └─> Updates DynamoDB with topScore and matchLevel
```

### Code Location:

**File:** `functions/poll-handler/index.ts`

**Key Code:**
```typescript
// Line 40: Extract topScore from first match
const topScore = result.matches?.[0]?.score || 0;

// Lines 41-47: Calculate matchLevel
const matchLevel = topScore > thresholds.highThreshold 
  ? 'HIGH' 
  : topScore > thresholds.mediumThreshold 
    ? 'MEDIUM' 
    : topScore > thresholds.lowThreshold 
      ? 'LOW' 
      : undefined;

// Lines 49-64: Update DynamoDB
UpdateExpression: 'SET #status = :status, topScore = :score, viewMatchesUrl = :url, updatedAt = :updated'
```

### Captis Response Structure:

```typescript
interface CaptisResolveResponse {
  id: string;
  status: "COMPLETED" | "PROCESSING" | "PENDING";
  matches?: Array<{
    id: string;
    score: number;        // ← This becomes topScore
    scoreLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    subject: {
      id: string;
      name: string;
      ...
    };
  }>;
  viewMatchesUrl?: string;
  timedOutFlag?: boolean;  // ← Determines if polling needed
}
```

---

## ⚠️ Issue Found: Why topScore/matchLevel Are Null

### Problem:

**Scan Handler Logic (lines 427, 476, 527):**
```typescript
// Line 427: Sets status based on timedOutFlag
status: captisResponse.timedOutFlag ? 'PENDING' : 'COMPLETED'

// Line 476: Only triggers poll handler if timedOutFlag is true
if (captisResponse.timedOutFlag) {
  // Trigger EventBridge → Poll Handler
}

// Line 527: Tries to get topScore from immediate response
topScore: captisResponse.matches?.[0]?.score
```

### The Issue:

1. **If Captis returns synchronously** (no `timedOutFlag`):
   - Status is set to `COMPLETED` immediately
   - Poll handler is **NOT triggered** (only triggered if `timedOutFlag=true`)
   - `topScore` is extracted from immediate response, but if Captis hasn't finished processing, `matches` array might be empty
   - Result: `topScore = undefined`, `matchLevel = null`

2. **If Captis returns with `timedOutFlag=true`**:
   - Status is set to `PENDING`
   - Poll handler **IS triggered** via EventBridge
   - Poll handler extracts `topScore` and `matchLevel` correctly
   - Result: ✅ Works correctly

### Current Test Result:

```
Scan ID: f3c6125b-4b95-4d39-863c-9b79837b56ca
Status: COMPLETED
topScore: null
matchLevel: null
timedOutFlag: null
pollingRequired: null
```

**Analysis:**
- Captis returned synchronously (no `timedOutFlag`)
- Poll handler was **NOT triggered**
- `topScore` and `matchLevel` are null because they were never extracted

---

## 🔧 Solution Options

### Option 1: Always Trigger Poll Handler (Recommended)

Modify scan handler to always trigger poll handler, even if `timedOutFlag` is false:

```typescript
// Always trigger poll handler to ensure results are parsed
if (!captisResponse.timedOutFlag && captisResponse.status === 'COMPLETED') {
  // Still trigger poll handler to extract topScore/matchLevel
  // This ensures results are properly parsed even for synchronous responses
}
```

### Option 2: Extract Results in Scan Handler

If Captis returns synchronously with results, extract them in scan handler:

```typescript
// If results are available immediately, extract them
if (captisResponse.matches && captisResponse.matches.length > 0) {
  const topScore = captisResponse.matches[0].score;
  const matchLevel = calculateMatchLevel(topScore, thresholds);
  // Store in DynamoDB
}
```

### Option 3: Check for Results Before Setting COMPLETED

Only set status to COMPLETED if results are available:

```typescript
// Only set COMPLETED if we have results or timedOutFlag is false
const hasResults = captisResponse.matches && captisResponse.matches.length > 0;
status: (captisResponse.timedOutFlag || !hasResults) ? 'PENDING' : 'COMPLETED'
```

---

## 📋 Summary

### ✅ Completed:
1. **S3 Upload:** All 4 images uploaded, URLs generated
2. **Parsing Documentation:** Complete explanation of how results are parsed
3. **Issue Identified:** Why topScore/matchLevel are null

### 🔍 Key Findings:
- **S3 URLs work** ✅ (tested successfully)
- **Poll handler extracts topScore/matchLevel** ✅ (when triggered)
- **Issue:** Poll handler not triggered for synchronous Captis responses
- **Result:** topScore/matchLevel are null for synchronous responses

### 📝 Next Steps:
1. Fix scan handler to always trigger poll handler (or extract results immediately)
2. Test with S3 URLs to verify results are parsed correctly
3. Monitor poll handler logs to ensure it's being triggered

---

**Files Created:**
- `upload-test-images-to-s3.sh` - Upload script
- `CAPTIS_RESULTS_PARSING.md` - Detailed parsing documentation
- `S3_IMAGE_URLS.txt` - Quick reference for URLs
- `S3_AND_PARSING_SUMMARY.md` - This summary

