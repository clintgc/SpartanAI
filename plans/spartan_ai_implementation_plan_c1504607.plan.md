---
name: Spartan AI Implementation Plan
overview: Build a serverless AWS-based security service that integrates with Captis API for threat detection, includes tiered alerting (SMS/webhooks/email), quota management, consent controls, and location tracking.
todos:
  - id: setup-project
    content: Initialize AWS CDK project structure with TypeScript, create base directory structure (infrastructure/, functions/, shared/), and configure package.json with dependencies
    status: completed
  - id: dynamodb-schemas
    content: "Design and implement DynamoDB tables: Scans (scanId PK, accountID GSI), Quotas (accountID PK, year SK), ThreatLocations (subjectId PK, accountID GSI), Consent (accountID PK), WebhookSubscriptions (accountID PK)"
    status: completed
    dependencies:
      - setup-project
  - id: api-gateway-setup
    content: Create API Gateway REST API with /api/v1/* routes, configure API key authentication, set up rate limiting, and create usage plans
    status: completed
    dependencies:
      - setup-project
  - id: captis-client
    content: Implement Captis ASI API client service (shared/services/captis-client.ts) with resolve endpoint, async polling logic, error handling (307 redirect, 503 retry), and response parsing
    status: completed
    dependencies:
      - setup-project
  - id: scan-handler-lambda
    content: "Create scan-handler Lambda: validate quota (check DynamoDB, return 429 if exceeded), check consent status, forward image to Captis, handle async polling initiation, return scanId and status"
    status: completed
    dependencies:
      - dynamodb-schemas
      - api-gateway-setup
      - captis-client
  - id: poll-handler-lambda
    content: "Create poll-handler Lambda: poll Captis /scan/{id} endpoint with exponential backoff, parse matches/biometrics/crimes, determine match tier, trigger alert handler via SNS, store results in DynamoDB"
    status: completed
    dependencies:
      - captis-client
      - dynamodb-schemas
  - id: twilio-integration
    content: Implement Twilio SMS service (shared/services/twilio-client.ts) for >89% matches, retrieve user phone from account profile, send E.164 formatted SMS, handle errors and log SID
    status: completed
    dependencies:
      - setup-project
  - id: sns-topics-setup
    content: Create SNS topics for high-threat alerts, medium-threat alerts, and webhook notifications, configure subscriptions for Lambda functions
    status: completed
    dependencies:
      - setup-project
  - id: alert-handler-lambda
    content: "Create alert-handler Lambda: receive SNS events, determine alert type (SMS/webhook/in-app), send Twilio SMS for >89%, dispatch webhooks, trigger in-app notifications, log threat locations"
    status: completed
    dependencies:
      - twilio-integration
      - sns-topics-setup
      - dynamodb-schemas
  - id: webhook-dispatcher
    content: "Create webhook-dispatcher Lambda: send POST requests to registered NOC webhook URLs with match data (scanId, topScore, matchLevel, threatLocation, viewMatchesUrl), handle retries and failures"
    status: completed
    dependencies:
      - sns-topics-setup
      - dynamodb-schemas
  - id: consent-api
    content: "Implement PUT /api/v1/consent endpoint: update consent status in DynamoDB, trigger in-app hooks for integrators, validate boolean payload"
    status: completed
    dependencies:
      - api-gateway-setup
      - dynamodb-schemas
  - id: scan-detail-endpoints
    content: "Implement GET /api/v1/scan/{id} and GET /api/v1/scans endpoints: retrieve scan details from DynamoDB, list scans with pagination, filter by accountID"
    status: completed
    dependencies:
      - api-gateway-setup
      - dynamodb-schemas
  - id: email-aggregator
    content: "Create email-aggregator Lambda (EventBridge cron weekly): query DynamoDB for 50-74% matches from past week, deduplicate by subjectId, generate aggregated email with SendGrid, include viewMatchesUrl links"
    status: completed
    dependencies:
      - dynamodb-schemas
  - id: location-tracking
    content: "Implement threat location tracking: store location (lat/lon) with subjectId in ThreatLocations table, update lastSeenAt, support querying by accountID for location history"
    status: completed
    dependencies:
      - dynamodb-schemas
      - poll-handler-lambda
  - id: quota-warning-system
    content: "Implement quota warning at 80%: CloudWatch alarm triggers when quota usage exceeds 11,520 scans/year, send notification to account owner, log warning timestamp"
    status: completed
    dependencies:
      - dynamodb-schemas
      - scan-handler-lambda
  - id: cloudwatch-monitoring
    content: "Set up CloudWatch metrics: Captis 4xx/5xx error rate (>1% alarm), Twilio delivery failure rate (>0.5% alarm), API Gateway latency, Lambda errors, DynamoDB throttles, and custom business metrics"
    status: completed
    dependencies:
      - scan-handler-lambda
      - poll-handler-lambda
      - alert-handler-lambda
  - id: image-deletion
    content: "Ensure image deletion compliance: verify images are never stored in DynamoDB or S3, only passed directly to Captis API, implement audit logging for image handling"
    status: completed
    dependencies:
      - scan-handler-lambda
  - id: error-handling-retry
    content: "Implement comprehensive error handling: retry logic for Captis 307/503, exponential backoff for polling, dead-letter queues for failed messages, graceful degradation"
    status: completed
    dependencies:
      - captis-client
      - poll-handler-lambda
  - id: security-compliance
    content: "Implement security features: KMS encryption for sensitive DynamoDB fields, API key rotation, HTTPS enforcement, audit logging, GDPR data deletion endpoints, incident response documentation"
    status: completed
    dependencies:
      - dynamodb-schemas
      - api-gateway-setup
  - id: testing-setup
    content: "Set up testing infrastructure: unit tests for Lambda functions, integration tests for API endpoints, mock Captis responses, test quota validation, test alerting tiers"
    status: completed
    dependencies:
      - scan-handler-lambda
      - poll-handler-lambda
      - alert-handler-lambda
  - id: deployment-pipeline
    content: "Configure CI/CD pipeline: GitHub Actions or AWS CodePipeline, CDK deployment steps, environment-specific configurations (dev/staging/prod), automated testing before deployment"
    status: completed
    dependencies:
      - setup-project
  - id: fcm-integration
    content: "Implement FCM integration for in-app notifications: Add firebase-admin to alert-handler Lambda, configure FCM_SERVER_KEY env var, send push notifications via SNS for 75-89% matches, handle device token management"
    status: completed
    dependencies:
      - alert-handler-lambda
      - sns-topics-setup
  - id: sendgrid-email-setup
    content: "Complete SendGrid integration for email-aggregator: Use @sendgrid/mail package, create email templates with viewMatchesUrl links and match scores, configure SENDGRID_API_KEY env var, implement deduplication logic for weekly emails"
    status: completed
    dependencies:
      - email-aggregator
  - id: webhook-registration-api
    content: "Implement POST /api/v1/webhooks endpoint: Validate webhook URL format, store in WebhookSubscriptions DynamoDB table, support enable/disable, add validation for HTTPS URLs, return webhookId on registration"
    status: completed
    dependencies:
      - api-gateway-setup
      - dynamodb-schemas
  - id: load-testing-artillery
    content: "Create load testing suite with Artillery: Write artillery.yml script to simulate 100 concurrent /scan requests, measure latency (<5s target), error rates, and throughput, add post-deployment test script, validate 10k+ account scale requirements"
    status: completed
    dependencies:
      - scan-handler-lambda
      - api-gateway-setup
  - id: openapi-documentation
    content: "Generate OpenAPI/Swagger documentation: Use aws-apigateway-rest-api-openapi-extension in CDK to auto-generate Swagger JSON, document all endpoints with request/response schemas, include authentication details, publish to S3 or API Gateway console"
    status: completed
    dependencies:
      - api-gateway-setup
  - id: cost-monitoring-dashboard
    content: "Implement CloudWatch cost monitoring dashboard: Track Lambda duration/requests, DynamoDB read/write units, API Gateway requests, create alarms for >20% budget spikes, set up monthly cost reports, integrate with AWS Cost Explorer"
    status: completed
    dependencies:
      - cloudwatch-monitoring
  - id: phase2-placeholders
    content: "Add Phase 2 infrastructure placeholders in CDK: Comment sections for AWS Rekognition integration, Verified Database table schema, migration paths from Captis to Verified DB, prepare for 2027 roadmap items"
    status: completed
    dependencies:
      - setup-project
      - dynamodb-schemas
  - id: todo-1765572235593-yhsnrucsf
    content: Add Captis Access Key where necessary
    status: pending
---

# Spartan AI Security Service - Implementation Plan

## Overview

Build a Phase 1 serverless security service on AWS that acts as a Captis API wrapper, providing threat detection for security camera images with tiered alerting, quota management, and consent controls.

## Architecture Summary

- **API Layer**: API Gateway with API keys and rate limiting
- **Processing**: Lambda functions for quota validation, Captis integration, polling, and response parsing
- **Storage**: DynamoDB for quotas, threat locations, scan logs, and consent status
- **Notifications**: SNS topics triggering Twilio (SMS), SendGrid (email), FCM (in-app), and webhooks
- **Monitoring**: CloudWatch for metrics, alarms, and logging
- **Infrastructure**: AWS CDK for IaC

## Key Components

### 1. API Endpoints

- `POST /api/v1/scan` - Image threat lookup
- `GET /api/v1/scan/{id}` - Scan details
- `GET /api/v1/scans` - List scans (with pagination)
- `PUT /api/v1/consent` - Update opt-in/opt-out status
- `POST /api/v1/webhooks` - Register NOC webhook URLs
- Webhook endpoints for NOC alerts

### 2. Core Lambda Functions

- **Scan Handler**: Validates quota, checks consent, forwards to Captis, initiates polling
- **Poll Handler**: Polls Captis for async results, processes matches
- **Alert Handler**: Sends SMS (Twilio), FCM (in-app), webhooks, in-app notifications based on match scores
- **Email Aggregator**: Weekly cron job to send aggregated low-threat matches via SendGrid
- **Webhook Dispatcher**: Sends webhook notifications to registered NOC endpoints

### 3. Data Models (DynamoDB Tables)

- **Scans**: scanId (PK), accountID (GSI), status, topScore, viewMatchesUrl, metadata, timestamps
- **Quotas**: accountID (PK), year (SK), scansUsed, scansLimit (14400), lastWarnedAt
- **ThreatLocations**: subjectId (PK), accountID (GSI), locations array, lastSeenAt
- **Consent**: accountID (PK), consentStatus, updatedAt
- **WebhookSubscriptions**: accountID (PK), webhookUrl, enabled, createdAt

### 4. External Integrations

- **Captis ASI API**: `/pub/asi/v4/resolve` with async polling
- **Twilio**: SMS for >89% matches
- **Firebase Cloud Messaging (FCM)**: In-app push notifications for 75-89% matches
- **SendGrid**: Weekly aggregated emails for 50-74% matches
- **SNS**: Event-driven notifications

## Implementation Phases

### Phase 1: Foundation & Core API

1. Project setup with AWS CDK
2. DynamoDB table schemas
3. API Gateway with API key auth
4. Basic scan endpoint with quota validation
5. Captis integration (sync first, then async with polling)

### Phase 2: Alerting & Notifications

1. Twilio SMS integration for high-threat matches
2. FCM integration for in-app notifications
3. SNS topic setup and subscriptions
4. Webhook infrastructure and registration API
5. SendGrid email templates

### Phase 3: Advanced Features

1. Consent management API
2. Location tracking and storage
3. Weekly email aggregation cron job
4. Scan listing and detail endpoints

### Phase 4: Monitoring & Operations

1. CloudWatch metrics and alarms
2. Cost monitoring dashboard
3. Error handling and retry logic
4. Logging and audit trails
5. Quota warning system (80% threshold)
6. Load testing with Artillery

### Phase 5: Security & Compliance

1. Image deletion after Captis forwarding
2. KMS encryption for sensitive data
3. GDPR compliance features
4. Incident response documentation
5. OpenAPI/Swagger documentation

## Technical Decisions

### Image Handling

- Accept base64 or URL in request
- Forward directly to Captis (single-part body, Content-Type: image/*)
- Delete immediately after forwarding (never store on Spartan AI servers)

### Async Polling Strategy

- Initial Captis call with `async=true`
- If `timedOutFlag=true`, poll `/scan/{id}` every 5s with exponential backoff
- Max polling duration: 120s
- Store polling state in DynamoDB

### Match Score Tiers

- **>89%**: Immediate SMS + FCM + webhook + in-app
- **75-89%**: FCM in-app notification only
- **50-74%**: Weekly aggregated email
- **<50%**: No alert (logged only)

### Quota Management

- 14,400 scans per account per year
- Validate before each scan
- CloudWatch alarm at 80% usage
- Return 429 when exceeded

## File Structure

```
spartan-ai/
├── infrastructure/
│   ├── cdk.json
│   ├── package.json
│   └── lib/
│       ├── spartan-ai-stack.ts
│       ├── api-gateway.ts
│       ├── dynamodb-tables.ts
│       ├── lambda-functions.ts
│       └── sns-topics.ts
├── functions/
│   ├── scan-handler/
│   ├── poll-handler/
│   ├── alert-handler/
│   ├── email-aggregator/
│   └── webhook-dispatcher/
├── shared/
│   ├── models/
│   ├── services/
│   │   ├── captis-client.ts
│   │   ├── twilio-client.ts
│   │   ├── fcm-client.ts
│   │   └── dynamodb-service.ts
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/
│       └── artillery.yml
└── README.md
```

## Environment Variables

- `CAPTIS_ACCESS_KEY` (per account, from SAC UI)
- `CAPTIS_BASE_URL` (https://asi-api.solveacrime.com)
- `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `FCM_SERVER_KEY`
- `SENDGRID_API_KEY`
- `DYNAMODB_TABLE_PREFIX`
- `SNS_TOPIC_ARN`

## Success Criteria

- ✅ <5s initial API response time
- ✅ ≤120s total result latency (including polling)
- ✅ 99.99% uptime
- ✅ Handles 10k+ accounts (validated via load testing)
- ✅ Images deleted immediately after Captis forwarding
- ✅ Quota validation working
- ✅ Tiered alerting functional (SMS, FCM, webhooks, email)
- ✅ Weekly email aggregation working
- ✅ Consent management operational
- ✅ API documentation auto-generated
- ✅ Cost monitoring and alerts configured

## Enhancements & Future-Proofing

### High Priority Additions

1. **FCM Integration**: In-app push notifications for 75-89% matches via Firebase Cloud Messaging
2. **Webhook Registration API**: Endpoint for NOC operators to register webhook URLs
3. **Load Testing**: Artillery scripts to validate 10k+ account scale requirements
4. **Cost Monitoring**: CloudWatch dashboard and alarms for budget tracking

### Medium Priority Additions

5. **SendGrid Email Setup**: Complete integration with templates for aggregated emails
6. **OpenAPI/Swagger Docs**: Auto-generated API documentation for integrators
7. **Phase 2 Hooks**: Placeholder infrastructure for Verified DB integration (2027)