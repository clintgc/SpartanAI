# Certificate Fix - Configuration Updated ✅

## Problem Identified

- **Main site certificate** (`4c9e2097-2a8e-4701-91cb-2c763e0f7157`) exists and covers:
  - ✅ `www.spartan.tech`
  - ✅ `spartan.tech`
  - ❌ **Not being used** - Terraform was using alerts certificate for everything

- **Alerts certificate** (`a4cd02d9-28e8-43b3-90f4-b8820942fd1d`) covers:
  - ✅ `alerts.spartan.tech`
  - ❌ **Was being used for main site** - causing SSL errors

## Solution Applied

Updated Terraform configuration to use **separate certificates** for different CloudFront distributions:

1. **Main CloudFront distributions** (www and root redirect):
   - Use: `acm_certificate_arn` (main site certificate)
   - Certificate: `arn:aws:acm:us-east-1:052380405056:certificate/4c9e2097-2a8e-4701-91cb-2c763e0f7157`

2. **Alerts CloudFront distribution**:
   - Use: `acm_certificate_arn_alerts` (alerts certificate)
   - Certificate: `arn:aws:acm:us-east-1:052380405056:certificate/a4cd02d9-28e8-43b3-90f4-b8820942fd1d`

## Changes Made

### 1. Updated `variables.tf`
- Added new variable: `acm_certificate_arn_alerts`
- Updated description for `acm_certificate_arn` to clarify it's for main site

### 2. Updated `main.tf`
- Changed alerts CloudFront module to use `acm_certificate_arn_alerts` instead of `acm_certificate_arn`

### 3. Updated `terraform.tfvars`
- Set `acm_certificate_arn` to main site certificate
- Set `acm_certificate_arn_alerts` to alerts certificate

## Next Steps

### 1. Review Changes
```bash
cd terraform
git diff variables.tf main.tf terraform.tfvars
```

### 2. Validate Configuration
```bash
terraform init
terraform validate
```

### 3. Review Plan
```bash
terraform plan
```

Expected changes:
- ✅ Main CloudFront distributions will use the correct certificate (`4c9e2097...`)
- ✅ Alerts CloudFront distribution will continue using alerts certificate (`a4cd02d9...`)
- ✅ No certificate changes for alerts (should show no changes or minor updates)

### 4. Apply Changes
```bash
terraform apply
```

This will:
- Update main CloudFront distributions to use the correct certificate
- Fix SSL for `spartan.tech` and `www.spartan.tech`
- Keep `alerts.spartan.tech` working with its certificate

### 5. Verify Fix

After applying, test all domains:

```bash
# Main site (should work now)
curl -I https://www.spartan.tech
curl -I https://spartan.tech

# Alerts (should still work)
curl -I https://alerts.spartan.tech/scan/test-scan-id
```

All should return `200 OK` with valid SSL certificates.

## Certificate Details

### Main Site Certificate
- **ARN**: `arn:aws:acm:us-east-1:052380405056:certificate/4c9e2097-2a8e-4701-91cb-2c763e0f7157`
- **Status**: ISSUED ✅
- **Domains**:
  - Primary: `www.spartan.tech`
  - SAN: `spartan.tech`

### Alerts Certificate
- **ARN**: `arn:aws:acm:us-east-1:052380405056:certificate/a4cd02d9-28e8-43b3-90f4-b8820942fd1d`
- **Status**: ISSUED ✅
- **Domains**:
  - Primary: `alerts.spartan.tech`

## Summary

✅ Configuration updated to use correct certificates  
✅ Main site will use its existing certificate  
✅ Alerts will continue using its certificate  
✅ No new certificates needed  
⏳ Ready for `terraform apply` to fix the main site

