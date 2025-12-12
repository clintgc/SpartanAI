# End-to-End Tests for Spartan AI POC

## Overview

This directory contains end-to-end tests that simulate the complete flow of the Spartan AI Security Service, including:

1. POST /scan request with image and metadata
2. Quota and consent validation
3. Captis API response simulation (75-89% match)
4. FCM in-app notification via SNS
5. Location logging
6. Email aggregator cron execution with deduplication
7. CDK deployment output verification

## Prerequisites

```bash
# Install dependencies
npm install

# Install Mocha and Chai globally (optional)
npm install -g mocha chai
```

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with watch mode
npm run test:e2e:watch

# Run specific test file
mocha tests/e2e/spartan-ai-poc.test.ts --require ts-node/register
```

## Test Structure

### Main Test Flow

The `spartan-ai-poc.test.ts` test simulates the complete POC flow:

1. **Scan Request**: POST /api/v1/scan with base64 image
   - Validates quota (account has available scans)
   - Validates consent (account has consented)
   - Creates scan record in DynamoDB
   - Returns scanId and processing status

2. **Captis Poll Simulation**: Simulates Captis API response
   - Returns 75-89% match score (medium threat)
   - Includes subject details and biometrics
   - Triggers SNS event for medium threat

3. **FCM Notification**: Alert handler processes SNS event
   - Fetches device tokens from DynamoDB
   - Sends FCM in-app notification
   - Verifies notification payload

4. **Location Logging**: Verifies threat location storage
   - Checks DynamoDB PutItem call for ThreatLocations table
   - Validates location coordinates

5. **Email Aggregation**: Runs weekly cron job
   - Queries for low-threat matches (50-74%)
   - Deduplicates by subjectId and biometrics
   - Fetches account profile for personalization
   - Sends SendGrid email with unsubscribe link

6. **CDK Verification**: Checks deployment outputs
   - Verifies API Gateway URL
   - Verifies API Key ID
   - Verifies Cost Dashboard URL
   - Verifies Swagger UI URL
   - Verifies EventBridge cron rule

## Mocking Strategy

### AWS Services

- **DynamoDB**: Mocked using Sinon stubs on `DynamoDBDocumentClient.send()`
- **SNS**: Mocked using Sinon stubs on `SNSClient.send()`
- **SendGrid**: Mocked using Sinon stubs on `sgMail.send()`
- **Firebase Admin**: Mocked using Sinon stubs on `admin.messaging().send()`

### Test Data

- Test Account ID: `test-account-e2e-001`
- Test Scan ID: `scan-e2e-12345`
- Test Subject ID: `subject-789`
- Test Location: `{ lat: 40.7128, lon: -74.0060 }`

## Environment Variables

Tests set up the following environment variables:

- `SCANS_TABLE_NAME`: test-scans
- `QUOTAS_TABLE_NAME`: test-quotas
- `THREAT_LOCATIONS_TABLE_NAME`: test-threat-locations
- `CONSENT_TABLE_NAME`: test-consent
- `DEVICE_TOKENS_TABLE_NAME`: test-device-tokens
- `ACCOUNT_PROFILES_TABLE_NAME`: test-account-profiles
- `HIGH_THREAT_TOPIC_ARN`: SNS topic for high threats
- `MEDIUM_THREAT_TOPIC_ARN`: SNS topic for medium threats
- `SENDGRID_API_KEY`: Test SendGrid API key
- `FCM_SERVER_KEY`: Test FCM server key

## Expected Results

### Scan Request
- Status: 202 Accepted
- Response includes: scanId, status: 'processing'

### Captis Response
- Match score: 75-89% (medium threat)
- Match level: 'medium'
- Subject details included

### FCM Notification
- Notification sent to device tokens
- Title and body included
- Data payload includes scan details

### Email Aggregation
- Email sent to account email
- Personalized greeting included
- Unsubscribe link included
- Matches deduplicated (only highest score per subject)

### CDK Outputs
- All expected outputs present
- Outputs are non-empty strings
- EventBridge cron rule configured

## Troubleshooting

### Common Issues

1. **Timeout Errors**
   - Increase timeout in `.mocharc.json` or test file
   - Check for hanging async operations

2. **Mock Not Working**
   - Ensure Sinon stubs are set up before handler execution
   - Verify stub is called with correct arguments

3. **Environment Variables**
   - Check that all required env vars are set in `before()` hook
   - Verify env vars match handler expectations

4. **DynamoDB Mock Issues**
   - Ensure stub returns correct structure
   - Check table names match environment variables

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
- name: Run E2E Tests
  run: npm run test:e2e
```

## Next Steps

- Add more test scenarios (high threat, low threat, no matches)
- Add performance benchmarks
- Add integration with real AWS services (optional)
- Add test data cleanup after runs

