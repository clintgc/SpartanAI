# Configurable Threat Thresholds Implementation

## Three-Tier Priority System

The threat score thresholds use a priority system where higher-priority settings override lower-priority ones:

**Priority Order:**
1. **User-level** (highest priority) - Stored in DynamoDB
2. **Service-level** (medium priority) - Placeholder for future implementation
3. **Global defaults** (lowest priority) - Stored in SSM Parameter Store

---

## 1. Global Config (SSM Parameter Store)

**Location:** AWS Systems Manager Parameter Store
- **Parameter Path:** `/spartan-ai/threat-thresholds/global`
- **Type:** String (JSON)
- **Default Value:**
  ```json
  {
    "highThreshold": 89,
    "mediumThreshold": 75,
    "lowThreshold": 50
  }
  ```

**Created in:** `spartan-ai/infrastructure/lib/ssm-parameters.ts`
```typescript
this.globalThresholdsParameter = new ssm.StringParameter(this, 'GlobalThresholds', {
  parameterName: '/spartan-ai/threat-thresholds/global',
  description: 'Global default threat score thresholds',
  stringValue: JSON.stringify({
    highThreshold: 89,
    mediumThreshold: 75,
    lowThreshold: 50,
  }),
  type: ssm.ParameterType.STRING,
});
```

**Read by:** `ThresholdService.getGlobalThresholds()`
- First checks cache
- Then reads from SSM Parameter Store
- Falls back to hardcoded defaults if SSM read fails

**How to update:**
```bash
aws ssm put-parameter \
  --name "/spartan-ai/threat-thresholds/global" \
  --value '{"highThreshold":90,"mediumThreshold":80,"lowThreshold":60}' \
  --type String \
  --overwrite
```

---

## 2. Service-Level Config (Placeholder - Not Fully Implemented)

**Status:** TODO - Placeholder for future implementation

**Intended Location:** DynamoDB table (would be `spartan-ai-service-configs`)
- **Partition Key:** `serviceId` (e.g., 'captis', 'rekognition')
- **Attributes:** `thresholds` (ThreatThresholdConfig object)

**Current Implementation:** `ThresholdService.getServiceThresholds()`
```typescript
private async getServiceThresholds(serviceId: string): Promise<ThreatThresholdConfig | null> {
  // TODO: Implement service thresholds table lookup
  // For now, return null to fall back to global defaults
  return null;
}
```

**To Complete Implementation:**
1. Create `service-configs` DynamoDB table in CDK
2. Add methods to `DynamoDbService` for service config operations
3. Implement the lookup in `getServiceThresholds()`

**Use Case:** Different services (Captis, Rekognition, etc.) might have different default thresholds based on their accuracy characteristics.

---

## 3. User-Level Config (DynamoDB Account Profile)

**Location:** DynamoDB `account-profiles` table
- **Partition Key:** `accountID`
- **Field:** `threatThresholds` (optional ThreatThresholdConfig object)

**Model Definition:** `shared/models/index.ts`
```typescript
export interface AccountProfile {
  accountID: string;
  // ... other fields ...
  threatThresholds?: ThreatThresholdConfig; // User-level threshold overrides
}
```

**API Endpoint:** `PUT /api/v1/thresholds`
- **Handler:** `functions/threshold-handler/index.ts`
- **Updates:** Account profile in DynamoDB via `ThresholdService.updateUserThresholds()`

**Example Request:**
```bash
curl -X PUT "https://api.example.com/api/v1/thresholds" \
  -H "x-api-key: YOUR_KEY" \
  -H "x-account-id: YOUR_ACCOUNT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "highThreshold": 95,
    "mediumThreshold": 85,
    "lowThreshold": 70
  }'
```

**Storage:** `shared/services/dynamodb-service.ts`
- `getAccountProfile()` - Reads account profile (includes `threatThresholds`)
- `updateAccountProfile()` - Updates account profile with new thresholds

**How it works:**
1. User calls `PUT /api/v1/thresholds` with custom thresholds
2. `threshold-handler` validates the thresholds
3. `ThresholdService.updateUserThresholds()` updates the account profile
4. Future scans use these user-specific thresholds

---

## Priority Resolution Flow

When `ThresholdService.getThresholds(accountID, serviceId)` is called:

```
1. Check Account Profile (DynamoDB)
   └─> If threatThresholds exists → Return user thresholds ✅
   
2. Check Service Config (DynamoDB) - Currently returns null
   └─> If service thresholds exist → Return service thresholds
   
3. Check Global Config (SSM Parameter Store)
   └─> Read from /spartan-ai/threat-thresholds/global
   └─> If SSM read fails → Use hardcoded defaults (89/75/50)
```

**Code Flow:**
```typescript
// In poll-handler or alert-handler
const thresholds = await thresholdService.getThresholds(accountID, 'captis');

// thresholds will be:
// - User's custom thresholds (if set in account profile)
// - Service defaults (if implemented and set)
// - Global defaults (from SSM or hardcoded)
```

---

## Current Implementation Status

✅ **Fully Implemented:**
- Global config (SSM Parameter Store)
- User-level config (DynamoDB account-profiles table)
- API endpoint (GET/PUT /api/v1/thresholds)
- Priority resolution logic
- Validation (0-100 range, correct order)

⏳ **Partially Implemented:**
- Service-level config (placeholder method exists, but no DynamoDB table yet)

---

## Example Usage

**Get current thresholds:**
```bash
GET /api/v1/thresholds
# Returns user thresholds if set, otherwise service/global defaults
```

**Set user thresholds:**
```bash
PUT /api/v1/thresholds
Body: {
  "highThreshold": 95,
  "mediumThreshold": 85,
  "lowThreshold": 70
}
# Stores in account-profiles.threatThresholds
```

**Result:** All future scans for that account will use these thresholds instead of global defaults.

