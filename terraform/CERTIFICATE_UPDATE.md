# ACM Certificate Update for alerts.spartan.tech

## Issue
The current ACM certificate only covers:
- `spartan.tech`
- `www.spartan.tech`

But does NOT cover:
- `alerts.spartan.tech`

## Solution Options

### Option 1: Request New Certificate with alerts.spartan.tech (Recommended)

Request a new certificate that includes all subdomains:

```bash
aws acm request-certificate \
  --domain-name spartan.tech \
  --subject-alternative-names www.spartan.tech alerts.spartan.tech \
  --validation-method DNS \
  --region us-east-1
```

After requesting:
1. Get the certificate ARN from the output
2. Validate via DNS (add CNAME records to Route53)
3. Wait for certificate to be issued
4. Update `terraform.tfvars` with the new certificate ARN
5. Re-run `terraform apply`

### Option 2: Use Wildcard Certificate

Request a wildcard certificate that covers all subdomains:

```bash
aws acm request-certificate \
  --domain-name "*.spartan.tech" \
  --subject-alternative-names spartan.tech \
  --validation-method DNS \
  --region us-east-1
```

This will cover:
- `*.spartan.tech` (all subdomains including alerts.spartan.tech)
- `spartan.tech` (root domain)

### Option 3: Temporary Workaround (Testing Only)

For testing, you can temporarily remove the `aliases` from CloudFront distribution to use CloudFront's default certificate. This won't work with the custom domain but will allow testing the infrastructure.

## Current Certificate ARN
```
arn:aws:acm:us-east-1:052380405056:certificate/4c9e2097-2a8e-4701-91cb-2c763e0f7157
```

## Next Steps
1. Choose an option above
2. Request/update the certificate
3. Validate via DNS
4. Update terraform.tfvars with new ARN (if using new certificate)
5. Re-run terraform apply

