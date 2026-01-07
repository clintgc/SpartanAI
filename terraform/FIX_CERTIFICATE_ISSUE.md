# Fix Certificate Issue for spartan.tech Home Page

## Problem
The certificate currently configured in `terraform.tfvars` likely only covers `alerts.spartan.tech`, breaking the main site (`spartan.tech` and `www.spartan.tech`).

## Solution: Request New Certificate with All Domains

You need a certificate that covers **all three domains**:
- `spartan.tech` (root domain)
- `www.spartan.tech` (www subdomain)
- `alerts.spartan.tech` (alerts subdomain)

## Step-by-Step Fix

### Step 1: Request New Certificate via AWS Console

1. **Go to AWS Certificate Manager**
   - URL: https://console.aws.amazon.com/acm/home?region=us-east-1
   - **CRITICAL**: Must be in **us-east-1** region (CloudFront requirement)

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
   - Or manually add CNAME records to your Route53 hosted zone

6. **Wait for Issuance**
   - Status will change from "Pending validation" → "Issued"
   - Usually takes 5-15 minutes

### Step 2: Get Certificate ARN

Once issued, copy the Certificate ARN:
- Format: `arn:aws:acm:us-east-1:052380405056:certificate/XXXX-XXXX-XXXX-XXXX`
- You can find it in the certificate details page

### Step 3: Update terraform.tfvars

Edit `terraform/terraform.tfvars` and update the certificate ARN:

```hcl
acm_certificate_arn = "arn:aws:acm:us-east-1:052380405056:certificate/NEW-CERTIFICATE-ID"
```

Replace `NEW-CERTIFICATE-ID` with the actual certificate ID from Step 2.

### Step 4: Apply Terraform Changes

```bash
cd terraform
terraform plan  # Review changes - should show CloudFront distribution updates
terraform apply  # Apply changes
```

This will:
- Update the main CloudFront distribution (`www.spartan.tech`) to use the new certificate
- Update the root domain redirect (`spartan.tech`) to use the new certificate
- Update the alerts CloudFront distribution (`alerts.spartan.tech`) to use the new certificate

### Step 5: Verify Fix

After terraform apply completes, test all domains:

```bash
# Test main site
curl -I https://www.spartan.tech
curl -I https://spartan.tech

# Test alerts subdomain
curl -I https://alerts.spartan.tech/scan/test-scan-id
```

All should return `200 OK` with valid SSL certificates.

## Alternative: Use Wildcard Certificate

If you prefer a wildcard certificate that covers all current and future subdomains:

1. **Request certificate with**:
   - Domain: `*.spartan.tech` (wildcard for all subdomains)
   - SAN: `spartan.tech` (root domain)

2. **This will cover**:
   - `*.spartan.tech` (all subdomains including `www.spartan.tech`, `alerts.spartan.tech`, and any future subdomains)
   - `spartan.tech` (root domain)

3. **Update `terraform.tfvars`** with the wildcard certificate ARN

## Current Certificate ARN (Likely Broken)

The current certificate in `terraform.tfvars`:
```
arn:aws:acm:us-east-1:052380405056:certificate/a4cd02d9-28e8-43b3-90f4-b8820942fd1d
```

This certificate likely only covers `alerts.spartan.tech`, which is why the main site is broken.

## Quick Check: Verify Certificate Domains

To check what domains a certificate covers (requires AWS CLI access):

```bash
aws acm describe-certificate \
  --certificate-arn "arn:aws:acm:us-east-1:052380405056:certificate/a4cd02d9-28e8-43b3-90f4-b8820942fd1d" \
  --region us-east-1 \
  --query 'Certificate.{DomainName:DomainName,SubjectAlternativeNames:SubjectAlternativeNames,Status:Status}' \
  --output json
```

This will show you exactly which domains the certificate covers.

## Notes

- ACM certificates cannot be modified after creation - you must request a new one
- Certificate must be in **us-east-1** region for CloudFront
- DNS validation is required for public certificates
- The new certificate will replace the old one in all CloudFront distributions
- After updating, CloudFront may take 5-15 minutes to propagate the certificate change

