# Steps to Update ACM Certificate for alerts.spartan.tech

## Current Status

- ✅ Terraform is configured to use certificate from `terraform.tfvars`
- ⏳ Need to request new certificate via AWS Console (CLI access restricted)
- ⏳ After certificate is issued, update `terraform.tfvars` and re-run `terraform apply`

## Step-by-Step Instructions

### Step 1: Request Certificate via AWS Console

1. **Open AWS Certificate Manager**
   - Go to: https://console.aws.amazon.com/acm/home?region=us-east-1
   - **Important**: Must be in **us-east-1** region (CloudFront requirement)

2. **Request Public Certificate**
   - Click "Request a certificate"
   - Select "Request a public certificate"
   - Click "Next"

3. **Configure Domains**
   - **Fully qualified domain name**: `spartan.tech`
   - **Subject alternative names**: Add these:
     - `www.spartan.tech`
     - `alerts.spartan.tech`
   - Click "Next"

4. **Choose Validation Method**
   - Select "DNS validation"
   - Click "Request"

5. **Validate Certificate**
   - AWS will show CNAME records to add
   - Since you're using Route53, click "Create record in Route53" for automatic validation
   - Or manually add CNAME records to hosted zone `Z0652485TZM0N7T1PPFP`

6. **Wait for Issuance**
   - Status will change from "Pending validation" → "Issued"
   - Usually takes 5-15 minutes

### Step 2: Get Certificate ARN

Once issued, copy the Certificate ARN:
- Format: `arn:aws:acm:us-east-1:052380405056:certificate/XXXX-XXXX-XXXX-XXXX`
- You can find it in the certificate details page

### Step 3: Update terraform.tfvars

Update the `acm_certificate_arn` value:

```hcl
acm_certificate_arn = "arn:aws:acm:us-east-1:052380405056:certificate/NEW-CERTIFICATE-ID"
```

### Step 4: Apply Terraform Changes

```bash
cd terraform
terraform plan  # Review changes
terraform apply  # Apply changes
```

This will:
- Update CloudFront distribution to use the new certificate
- Enable the `alerts.spartan.tech` custom domain
- Update Route53 records if needed

### Step 5: Verify

After terraform apply completes:

```bash
# Test the custom domain
curl -I https://alerts.spartan.tech/scan/test-scan-id

# Check DNS
dig alerts.spartan.tech
```

## Quick Reference

**Current Certificate ARN** (doesn't include alerts.spartan.tech):
```
arn:aws:acm:us-east-1:052380405056:certificate/4c9e2097-2a8e-4701-91cb-2c763e0f7157
```

**Route53 Hosted Zone ID**:
```
Z0652485TZM0N7T1PPFP
```

**Current CloudFront Distribution ID**:
```
E3ODK6WAH5F091
```

## Alternative: Use Wildcard Certificate

If you prefer a wildcard certificate that covers all subdomains:

1. Request certificate with:
   - Domain: `*.spartan.tech`
   - SAN: `spartan.tech`

2. This will cover:
   - `*.spartan.tech` (all subdomains including alerts.spartan.tech)
   - `spartan.tech` (root domain)

3. Update `terraform.tfvars` with the wildcard certificate ARN

## Notes

- ACM certificates cannot be modified after creation - you must request a new one
- Certificate must be in **us-east-1** region for CloudFront
- DNS validation is required for public certificates
- The new certificate will replace the old one in CloudFront configuration

