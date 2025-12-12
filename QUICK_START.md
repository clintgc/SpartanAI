# Quick Start Guide - Spartan AI

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20+ installed
- AWS CDK CLI installed: `npm install -g aws-cdk`

## Step 1: Configure Captis Access Key

You have the Captis access key: `485989b1-7960-4932-bb91-cd15d406df33`

### Option A: Quick Setup (Recommended)

```bash
cd spartan-ai
./scripts/setup-captis-key.sh 485989b1-7960-4932-bb91-cd15d406df33
```

### Option B: Using Environment File

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and set your Captis access key:
```
CAPTIS_ACCESS_KEY=485989b1-7960-4932-bb91-cd15d406df33
```

3. Run the setup script:
```bash
./scripts/setup-all-parameters.sh
```

### Option C: Manual AWS CLI

```bash
aws ssm put-parameter \
  --name "/spartan-ai/captis/access-key" \
  --value "485989b1-7960-4932-bb91-cd15d406df33" \
  --type "SecureString" \
  --overwrite
```

## Step 2: Install Dependencies

```bash
# Infrastructure
cd infrastructure
npm install

# Shared code
cd ../shared
npm install

# Tests
cd ../tests
npm install
```

## Step 3: Bootstrap CDK (First Time Only)

```bash
cd infrastructure
cdk bootstrap
```

## Step 4: Deploy

```bash
# Set the Captis key as environment variable (optional, if not using SSM)
export CAPTIS_ACCESS_KEY=485989b1-7960-4932-bb91-cd15d406df33

# Deploy the stack
cdk deploy
```

## Step 5: Get API Endpoint and Key

After deployment, CDK will output:
- API Gateway URL
- API Key ID

Get the actual API key value:
```bash
aws apigateway get-api-key --api-key <KEY_ID> --include-value
```

## Step 6: Test the API

```bash
# Replace with your actual API Gateway URL and API key
curl -X POST https://YOUR_API_URL/v1/api/v1/scan \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64encodedimage",
    "metadata": {
      "cameraID": "test-001",
      "accountID": "account-001",
      "location": {"lat": 40.7128, "lon": -74.0060},
      "timestamp": "2025-12-09T12:00:00Z"
    }
  }'
```

## Next Steps

- Configure additional services (Twilio, SendGrid, FCM) - see `CONFIGURATION.md`
- Set up monitoring dashboards in CloudWatch
- Run load tests: `cd tests/load && artillery run artillery.yml`
- Review API documentation: Check CloudWatch outputs for OpenAPI spec URL

## Troubleshooting

- **"Captis access key is required"**: Make sure the key is set in SSM or environment variable
- **CDK deployment fails**: Check AWS credentials and permissions
- **Lambda timeout**: Increase timeout in `lambda-functions.ts` if needed

## Security Notes

- Never commit `.env` files to version control
- The Captis key is stored securely in SSM Parameter Store
- Lambda functions automatically retrieve the key from SSM at runtime
- For production, consider using per-account keys stored in a database

