# BugBot Review: Email Aggregator Lambda

## Review Focus Areas
1. GDPR Unsubscribe Compliance
2. SendGrid Error Handling
3. Dedup Logic Efficiency

---

## 🔴 Critical Issues Found

### 1. GDPR Unsubscribe Compliance Violation

**Issue:** The aggregator does NOT check if users have unsubscribed before sending emails, violating GDPR requirements.

**Location:** `functions/email-aggregator/index.ts:154-193`

**Problem:**
- No `emailOptOut` or `unsubscribed` flag check in AccountProfile
- Emails are sent to users who may have clicked unsubscribe
- Missing unsubscribe handler endpoint
- No audit trail for unsubscribe actions

**GDPR Impact:**
- Violates user's right to opt-out (GDPR Article 7, 21)
- Risk of sending unsolicited emails
- Potential legal liability

**Fix Required:**
1. Add `emailOptOut?: boolean` field to AccountProfile model
2. Check `accountProfile.emailOptOut` before sending emails
3. Create unsubscribe handler endpoint (`/api/v1/unsubscribe`)
4. Update AccountProfile when user unsubscribes

---

### 2. Inadequate SendGrid Error Handling

**Issue:** SendGrid errors are silently logged but not properly handled, leading to:
- No retry logic for transient failures
- No handling of specific error types (rate limits, invalid emails, bounces)
- No dead letter queue or alerting
- Failed sends are lost without notification

**Location:** `functions/email-aggregator/index.ts:181-192`

**Problem:**
```typescript
try {
  await sgMail.send({...});
} catch (error) {
  console.error(`Failed to send email...`, error);
  // Error is swallowed - no retry, no alert, no DLQ
}
```

**SendGrid Error Types Not Handled:**
- Rate limiting (429) - should retry with backoff
- Invalid email addresses (400) - should mark as invalid
- Bounces/Spam reports - should unsubscribe user
- Transient failures (500, 503) - should retry
- Authentication failures - should alert ops

**Fix Required:**
1. Implement retry logic with exponential backoff for transient errors
2. Handle specific SendGrid error codes
3. Mark invalid emails in AccountProfile
4. Auto-unsubscribe on bounce/spam reports
5. Send alerts to SNS for critical failures
6. Consider dead letter queue for persistent failures

---

### 3. Inefficient Biometric Hash Implementation

**Issue:** The biometric hash uses simple base64 encoding instead of cryptographic hashing, leading to:
- Potential hash collisions
- Insecure hash (can be reverse-engineered)
- Missing biometric features in hash calculation
- Comment says "use crypto.createHash" but it's not implemented

**Location:** `functions/email-aggregator/index.ts:34-47`

**Problem:**
```typescript
// Simple hash (in production, use crypto.createHash)
return Buffer.from(features).toString('base64').substring(0, 32);
```

**Issues:**
- Base64 encoding is NOT a hash - it's reversible
- Only uses age, gender, position - misses other biometric features
- 32-character truncation increases collision risk
- No cryptographic security

**Fix Required:**
1. Use `crypto.createHash('sha256')` for proper hashing
2. Include all relevant biometric features in hash
3. Use full hash (64 hex chars) instead of truncation
4. Add hash validation to prevent collisions

---

## 🟡 Medium Priority Issues

### 4. Missing Unsubscribe Handler Endpoint

**Issue:** Unsubscribe links point to `/api/v1/unsubscribe` but no handler exists.

**Impact:**
- Users cannot unsubscribe (GDPR violation)
- Unsubscribe links return 404
- Legal compliance risk

**Fix Required:**
- Create `unsubscribe-handler` Lambda
- Validate token and email
- Update AccountProfile.emailOptOut = true
- Return confirmation page

---

### 5. No Email Validation Before Sending

**Issue:** No validation that email addresses are valid format before SendGrid call.

**Fix Required:**
- Validate email format before sending
- Check for common invalid patterns

---

### 6. Inefficient Scan Operation

**Issue:** Uses full table scan to find accounts, which is expensive and slow.

**Location:** `functions/email-aggregator/index.ts:69-80`

**Fix Required:**
- Consider GSI on `topScore` + `createdAt`
- Or maintain separate accounts index
- Add pagination for large datasets

---

## ✅ Recommended Fixes

### Fix 1: Add Email Opt-Out Check

```typescript
// After line 161
if (!accountProfile || !accountProfile.email) {
  console.warn(`No email found for account ${accountID}, skipping email`);
  continue;
}

// ADD: Check if user has unsubscribed
if (accountProfile.emailOptOut === true) {
  console.log(`Account ${accountID} has opted out of emails, skipping`);
  continue;
}
```

### Fix 2: Enhance SendGrid Error Handling

```typescript
// Replace lines 181-192 with:
const MAX_RETRIES = 3;
let retryCount = 0;
let emailSent = false;

while (retryCount < MAX_RETRIES && !emailSent) {
  try {
    await sgMail.send({
      to: accountProfile.email,
      from: process.env.SENDGRID_FROM_EMAIL || 'alerts@spartan-ai.com',
      subject: `Weekly Threat Summary - ${matchList.length} Potential Match${matchList.length > 1 ? 'es' : ''}`,
      html: emailHtml,
    });
    emailSent = true;
    console.log(`Aggregated email sent to ${accountProfile.email} for account ${accountID}`);
  } catch (error: any) {
    retryCount++;
    const statusCode = error?.response?.statusCode || error?.code;
    
    // Handle specific error types
    if (statusCode === 429) {
      // Rate limit - wait and retry
      const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
      if (retryCount < MAX_RETRIES) {
        console.warn(`Rate limited, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    } else if (statusCode === 400 && error?.response?.body?.errors) {
      // Invalid email - mark as invalid
      const errors = error.response.body.errors;
      if (errors.some((e: any) => e.message?.includes('invalid'))) {
        console.error(`Invalid email address for account ${accountID}: ${accountProfile.email}`);
        await dbService.updateAccountProfile({
          ...accountProfile,
          emailOptOut: true, // Auto-opt-out invalid emails
        });
        continue; // Skip this account
      }
    } else if (statusCode >= 500) {
      // Transient error - retry
      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.warn(`Transient error, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    }
    
    // Final failure - log and alert
    console.error(`Failed to send email to ${accountProfile.email} after ${retryCount} attempts:`, error);
    // TODO: Send to SNS alert topic for monitoring
  }
}
```

### Fix 3: Implement Proper Cryptographic Hash

```typescript
import * as crypto from 'crypto';

function generateBiometricHash(biometrics: any[]): string | undefined {
  if (!biometrics || biometrics.length === 0) {
    return undefined;
  }
  
  // Include all relevant biometric features for comprehensive hashing
  const features = biometrics
    .map(bio => {
      // Include all available biometric data
      const featureStr = [
        bio.age || 0,
        bio.femaleScore || 0,
        bio.x || 0,
        bio.y || 0,
        bio.w || 0,
        bio.h || 0,
        bio.quality || 0,
      ].join('-');
      return featureStr;
    })
    .sort()
    .join('|');
  
  // Use proper cryptographic hash (SHA-256)
  const hash = crypto.createHash('sha256');
  hash.update(features);
  return hash.digest('hex'); // Full 64-character hex hash
}
```

### Fix 4: Update AccountProfile Model

```typescript
export interface AccountProfile {
  accountID: string;
  name?: string;
  email: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
  unsubscribeToken?: string;
  emailOptOut?: boolean; // ADD: GDPR compliance flag
  emailOptOutAt?: string; // ADD: Timestamp of opt-out
}
```

---

## Summary

**Critical:** 3 issues
**Medium:** 3 issues
**Total:** 6 issues requiring fixes

**Priority Actions:**
1. ✅ Add emailOptOut check (GDPR compliance)
2. ✅ Enhance SendGrid error handling (reliability)
3. ✅ Fix biometric hash (security & efficiency)
4. ⚠️ Create unsubscribe handler endpoint
5. ⚠️ Add email validation
6. ⚠️ Optimize scan operation

