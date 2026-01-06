# Request ACM Certificate with alerts.spartan.tech

## Current Situation

The existing certificate only covers:
- `spartan.tech`
- `www.spartan.tech`

But does NOT cover:
- `alerts.spartan.tech`

## Solution: Request New Certificate via AWS Console

Since CLI access is restricted, please request the certificate via AWS Console:

### Steps:

1. **Go to AWS Certificate Manager Console**
   - Navigate to: https://console.aws.amazon.com/acm/home?region=us-east-1
   - Make sure you're in **us-east-1** region (required for CloudFront)

2. **Request a Public Certificate**
   - Click "Request a certificate"
   - Select "Request a public certificate"
   - Click "Next"

3. **Configure Certificate**
   - **Domain name**: `spartan.tech`
   - **Subject alternative names (SANs)**:
     - `www.spartan.tech`
     - `alerts.spartan.tech`
   - Click "Next"

4. **Validation Method**
   - Select "DNS validation"
   - Click "Request"

5. **Validate Certificate**
   - AWS will provide CNAME records to add to Route53
   - Since you're using Route53, you can use "Create record in Route53" button for automatic validation
   - Or manually add the CNAME records to your hosted zone

6. **Wait for Validation**
   - Certificate status will change from "Pending validation" to "Issued"
   - This usually takes a few minutes

7. **Get Certificate ARN**
   - Once issued, copy the Certificate ARN
   - Format: `arn:aws:acm:us-east-1:052380405056:certificate/XXXX-XXXX-XXXX-XXXX`

8. **Update Terraform Configuration**
   - Update `terraform.tfvars` with the new certificate ARN
   - Update `terraform/main.tf` to use the certificate (change `acm_certificate_arn = ""` to `acm_certificate_arn = var.acm_certificate_arn`)
   - Run `terraform apply`

## Alternative: Use Existing Certificate (Temporary)

If you want to test immediately without requesting a new certificate, the current setup works with CloudFront's default certificate:
- CloudFront URL: `https://d1qvafaj2hzk41.cloudfront.net/scan/{scanId}`
- This works but doesn't use the custom domain

## After Certificate is Ready

Once you have the new certificate ARN, I can help you:
1. Update `terraform.tfvars`
2. Update `terraform/main.tf`
3. Run `terraform apply` to enable the custom domain

