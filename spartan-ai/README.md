# Spartan AI Security Service

A serverless AWS-based security service that integrates with Captis API for threat detection, providing tiered alerting (SMS/webhooks/email), quota management, consent controls, and location tracking.

## Architecture

- **API Layer**: API Gateway with API keys and rate limiting
- **Processing**: Lambda functions for quota validation, Captis integration, polling, and response parsing
- **Storage**: DynamoDB for quotas, threat locations, scan logs, and consent status
- **Notifications**: SNS topics triggering Twilio (SMS), SendGrid (email), FCM (in-app), and webhooks
- **Monitoring**: CloudWatch for metrics, alarms, and logging
- **Infrastructure**: AWS CDK for IaC

## Project Structure

```
spartan-ai/
├── infrastructure/     # AWS CDK infrastructure code
├── functions/         # Lambda function handlers
├── shared/           # Shared code (services, models, utils)
└── tests/            # Unit, integration, and load tests
```

## Getting Started

**Quick Start**: See [QUICK_START.md](QUICK_START.md) for step-by-step instructions.

### Prerequisites

- Node.js 20+ and npm
- AWS CLI configured
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Captis access key (provided: `485989b1-7960-4932-bb91-cd15d406df33`)

### Installation

1. **Configure Captis Access Key** (Required):
```bash
# Quick setup
./scripts/setup-captis-key.sh 485989b1-7960-4932-bb91-cd15d406df33
```

2. Install infrastructure dependencies:
```bash
cd infrastructure
npm install
```

3. Install shared dependencies:
```bash
cd ../shared
npm install
```

### Deployment

1. Bootstrap CDK (first time only):
```bash
cd infrastructure
cdk bootstrap
```

2. Deploy the stack:
```bash
# Option 1: With SSM parameter (recommended)
cdk deploy

# Option 2: With environment variable
export CAPTIS_ACCESS_KEY=485989b1-7960-4932-bb91-cd15d406df33
cdk deploy
```

See [QUICK_START.md](QUICK_START.md) for detailed instructions.

## Environment Variables

Required environment variables (set in AWS Systems Manager Parameter Store or Lambda environment):

- `CAPTIS_ACCESS_KEY` - Captis API access key (per account)
- `CAPTIS_BASE_URL` - https://asi-api.solveacrime.com
- `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `FCM_SERVER_KEY`
- `SENDGRID_API_KEY`
- `DYNAMODB_TABLE_PREFIX`
- `SNS_TOPIC_ARN`

## API Endpoints

- `POST /api/v1/scan` - Image threat lookup
- `GET /api/v1/scan/{id}` - Scan details
- `GET /api/v1/scans` - List scans (with pagination)
- `PUT /api/v1/consent` - Update opt-in/opt-out status
- `POST /api/v1/webhooks` - Register NOC webhook URLs

## API Documentation

After deployment, the API documentation is automatically generated and available in multiple formats:

### Accessing Documentation

1. **Swagger UI (Interactive)** - Main documentation interface:
   - Check CloudFormation outputs after deployment for the `SwaggerUIUrl` output
   - Example: `http://spartan-ai-api-docs-ACCOUNT_ID.s3-website-REGION.amazonaws.com`
   - The Swagger UI allows you to:
     - Browse all API endpoints
     - View request/response schemas
     - Test API calls directly from the browser
     - Save your API key for authenticated requests

2. **OpenAPI JSON (Latest)**:
   - Check CloudFormation outputs for `ApiDocumentationUrl`
   - Direct URL: `https://spartan-ai-api-docs-ACCOUNT_ID.s3.amazonaws.com/api-docs/openapi.json`
   - Use this URL with OpenAPI tools, Postman, or API clients

3. **Versioned Documentation**:
   - Each deployment creates timestamped versions: `openapi-YYYYMMDD.json`
   - Example: `openapi-20241212.json` for December 12, 2024 deployment
   - Access via: `https://spartan-ai-api-docs-ACCOUNT_ID.s3.amazonaws.com/api-docs/openapi-YYYYMMDD.json`
   - Useful for tracking API changes over time

### Finding Documentation URLs

After deploying, run:
```bash
cd infrastructure
aws cloudformation describe-stacks \
  --stack-name SpartanAiStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SwaggerUIUrl` || OutputKey==`ApiDocumentationUrl`].{Key:OutputKey,Value:OutputValue}' \
  --output table
```

Or check the AWS Console:
1. Go to CloudFormation → Your Stack
2. Click the "Outputs" tab
3. Look for:
   - `SwaggerUIUrl` - Interactive documentation
   - `ApiDocumentationUrl` - OpenAPI JSON (latest)
   - `SwaggerDocumentationUrl` - Swagger JSON (latest)
   - `DocumentationBucketName` - S3 bucket with all versions

### Documentation Features

- **Auto-generated**: Documentation is automatically exported from your deployed API Gateway on every CDK deploy
- **Versioned**: Each deployment creates a timestamped version for change tracking
- **Interactive**: Swagger UI provides a fully interactive API testing interface
- **Always up-to-date**: Documentation reflects your current API Gateway configuration

## License

MIT

