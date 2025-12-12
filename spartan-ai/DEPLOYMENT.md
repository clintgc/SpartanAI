# Deployment Guide - Spartan AI Security Service

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Node.js 20+** and npm installed
3. **AWS CDK CLI** installed globally: `npm install -g aws-cdk`
4. **AWS CLI** configured with credentials

## Initial Setup

### 1. Install Dependencies

```bash
# Infrastructure
cd infrastructure
npm install

# Shared code
cd ../shared
npm install

# Lambda functions (each one)
cd ../functions/scan-handler
npm install
# Repeat for other Lambda functions
```

### 2. Configure Environment Variables

Set the following in AWS Systems Manager Parameter Store or Lambda environment variables:

- `/spartan-ai/twilio/account-sid`
- `/spartan-ai/twilio/auth-token`
- `/spartan-ai/twilio/phone-number`
- `/spartan-ai/fcm/server-key`
- `/spartan-ai/sendgrid/api-key`
- `/spartan-ai/captis/access-key` (per account)

### 3. Bootstrap CDK (First Time Only)

```bash
cd infrastructure
cdk bootstrap
```

## Deployment

### Development Environment

```bash
cd infrastructure
cdk deploy --context environment=dev
```

### Production Environment

```bash
cd infrastructure
cdk deploy --context environment=prod
```

Or use the deployment script:

```bash
./scripts/deploy.sh prod
```

## Post-Deployment

1. **Get API Gateway URL** from CDK outputs
2. **Get API Key** from CDK outputs or AWS Console
3. **Run Load Tests**:
   ```bash
   cd tests/load
   npm install
   artillery run artillery.yml
   ```

## Verification

1. Test scan endpoint:
```bash
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

2. Check CloudWatch logs for Lambda functions
3. Verify DynamoDB tables are created
4. Verify SNS topics are created

## Troubleshooting

- **CDK deployment fails**: Check AWS credentials and permissions
- **Lambda timeout**: Increase timeout in lambda-functions.ts
- **DynamoDB throttling**: Adjust billing mode or add capacity
- **API Gateway 403**: Verify API key is correct

## Cost Monitoring

Monitor costs via CloudWatch dashboard:
- Lambda invocations and duration
- DynamoDB read/write units
- API Gateway requests
- Set up budget alerts for >20% spikes

