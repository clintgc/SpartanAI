# Node.js Runtime Upgrade - AWS Lambda

## Summary

AWS is ending support for Node.js 20.x runtime in Lambda on **April 30, 2026**. All Lambda functions have been upgraded from `NODEJS_20_X` to `NODEJS_22_X`.

## Timeline

- **April 30, 2026**: Node.js 20.x EOL - No more security patches or updates
- **June 1, 2026**: Cannot create new functions with Node.js 20.x
- **July 1, 2026**: Cannot update existing functions with Node.js 20.x

## Changes Made

### Files Updated

1. **`spartan-ai/infrastructure/lib/lambda-functions.ts`**
   - Updated `defaultLambdaProps.runtime` from `NODEJS_20_X` to `NODEJS_22_X`
   - Affects all 13 Lambda functions:
     - scan-handler
     - poll-handler
     - alert-handler
     - email-aggregator
     - webhook-dispatcher
     - scan-detail-handler
     - scan-list-handler
     - consent-handler
     - webhook-registration-handler
     - gdpr-deletion-handler
     - threshold-handler
     - demo-request-handler

2. **`spartan-ai/infrastructure/lib/openapi-documentation.ts`**
   - Updated `exportOpenApiLambda.runtime` from `NODEJS_20_X` to `NODEJS_22_X`

## Deployment Steps

1. **Build and Deploy:**
   ```bash
   cd spartan-ai/infrastructure
   npm run build
   npm run cdk deploy SpartanAiStack
   ```

2. **Verify Deployment:**
   ```bash
   aws lambda list-functions --region us-east-1 \
     --query "Functions[?Runtime=='nodejs20.x'].FunctionArn" \
     --output text
   ```
   Should return empty (no functions using nodejs20.x)

3. **Verify New Runtime:**
   ```bash
   aws lambda list-functions --region us-east-1 \
     --query "Functions[?Runtime=='nodejs22.x'].FunctionArn" \
     --output text
   ```
   Should list all 14 Lambda functions

## Testing

After deployment, verify:
- ✅ All Lambda functions are using Node.js 22.x
- ✅ Scan endpoint still works correctly
- ✅ Poll handler processes results correctly
- ✅ Alert handler sends notifications
- ✅ All other endpoints function normally

## Node.js 22.x Support

- **Supported until:** April 30, 2027
- **LTS Status:** Active LTS
- **Compatibility:** Node.js 22.x is backward compatible with Node.js 20.x code

## Notes

- No code changes required - only runtime version update
- Node.js 22.x is fully backward compatible with Node.js 20.x
- All existing functionality should work without modification
- This is a low-risk upgrade

## Reference

- AWS Health Event: Node.js 20.x EOL notification
- AWS Lambda Runtime Support Policy: https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html
- Node.js Release Schedule: https://github.com/nodejs/Release#release-schedule

