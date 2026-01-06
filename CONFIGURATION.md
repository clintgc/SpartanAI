# Configuration Guide - Spartan AI

## Captis Access Key Setup

The Captis access key can be configured in multiple ways:

### Option 1: AWS Systems Manager Parameter Store (Recommended)

Store the key securely in SSM Parameter Store:

```bash
./scripts/setup-captis-key.sh 485989b1-7960-4932-bb91-cd15d406df33
```

Or manually:

```bash
aws ssm put-parameter \
  --name "/spartan-ai/captis/access-key" \
  --value "485989b1-7960-4932-bb91-cd15d406df33" \
  --type "SecureString" \
  --overwrite
```

### Option 2: Environment Variable (Development Only)

For local development or testing:

```bash
export CAPTIS_ACCESS_KEY=485989b1-7960-4932-bb91-cd15d406df33
```

### Option 3: Request Header (Per-Request)

Include in API request headers:

```bash
curl -X POST https://api-url/v1/api/v1/scan \
  -H "x-captis-access-key: 485989b1-7960-4932-bb91-cd15d406df33" \
  -H "x-api-key: YOUR_API_KEY" \
  ...
```

## Priority Order

The Lambda function checks for the Captis access key in this order:

1. **Request Header** (`x-captis-access-key`) - Highest priority
2. **SSM Parameter Store** (`/spartan-ai/captis/access-key`) - Recommended for production
3. **Environment Variable** (`CAPTIS_ACCESS_KEY`) - Development only

## Production Best Practices

- **Never hardcode** access keys in source code
- Use **SSM Parameter Store** with SecureString type
- For multi-tenant scenarios, store keys per account in SSM:
  - `/spartan-ai/captis/access-key/{accountID}`
- Rotate keys regularly
- Use AWS KMS for additional encryption if needed

## Other Configuration

### Twilio Credentials

```bash
aws ssm put-parameter --name "/spartan-ai/twilio/sid" --value "YOUR_SID" --type "SecureString"
aws ssm put-parameter --name "/spartan-ai/twilio/auth-token" --value "YOUR_TOKEN" --type "SecureString"
aws ssm put-parameter --name "/spartan-ai/twilio/phone-number" --value "+1234567890" --type "SecureString"
```

### SendGrid API Key

```bash
aws ssm put-parameter --name "/spartan-ai/sendgrid/api-key" --value "YOUR_KEY" --type "SecureString"
```

### FCM Server Key

```bash
aws ssm put-parameter --name "/spartan-ai/fcm/server-key" --value "YOUR_KEY" --type "SecureString"
```

