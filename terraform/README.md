# Terraform Configuration for Spartan AI Website

This Terraform configuration deploys a static website on AWS for `spartan.tech` with the following components:

- **S3 Buckets**: Two buckets - one for hosting (`www.spartan.tech`) and one for redirecting (`spartan.tech`)
- **CloudFront**: CDN distributions for both www and root domain with HTTPS
- **Route 53**: Hosted zone with alias records for root and www subdomain
- **ACM Certificate**: SSL/TLS certificate for HTTPS (must be created separately)

## Prerequisites

1. **AWS CLI configured** with appropriate credentials
2. **Terraform installed** (>= 1.0)
3. **ACM Certificate** in `us-east-1` region (required for CloudFront)
4. **Domain registered** in GoDaddy (or your registrar)

## Setup Instructions

### 1. Create ACM Certificate

Before running Terraform, you need to create an ACM certificate in `us-east-1`:

```bash
aws acm request-certificate \
  --domain-name spartan.tech \
  --subject-alternative-names www.spartan.tech \
  --validation-method DNS \
  --region us-east-1
```

Note the certificate ARN from the output.

### 2. Configure Variables

Create a `terraform.tfvars` file:

```hcl
domain_name         = "spartan.tech"
region              = "us-east-1"
environment         = "staging"
acm_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

tags = {
  Project     = "SpartanAI"
  Environment = "staging"
  ManagedBy   = "Terraform"
}
```

### 3. Initialize Terraform

```bash
cd terraform
terraform init
```

### 4. Plan and Apply

```bash
# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

### 5. Update GoDaddy Name Servers

After applying, Terraform will output the Route 53 name servers. Update these in GoDaddy:

1. Log into GoDaddy
2. Go to Domain Management → DNS
3. Update the name servers to match the output from `terraform output route53_name_servers`

## Architecture

```
┌─────────────────┐
│   Route 53      │
│  spartan.tech   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ CloudFront │ │ CloudFront │
│   (www)    │ │  (root)    │
└────┬───┘ └────┬───┘
     │          │
     ▼          ▼
┌────────┐ ┌────────┐
│ S3 www │ │ S3 root│
│ bucket │ │ redirect│
└────────┘ └────────┘
```

## Module Structure

- `modules/s3/` - S3 bucket configuration for hosting and redirect
- `modules/cloudfront/` - CloudFront distribution with OAC
- `modules/route53/` - Route 53 hosted zone and DNS records

## Uploading Website Files

After deployment, upload your website files to the S3 bucket:

```bash
# Upload www files
aws s3 sync www/ s3://www.spartan.tech/ --delete

# Or use the Terraform output
aws s3 sync www/ s3://$(terraform output -raw s3_website_bucket_name)/ --delete
```

## Important Notes

1. **ACM Certificate**: Must be in `us-east-1` region (CloudFront requirement)
2. **OAC vs OAI**: Uses Origin Access Control (OAC) instead of OAI (newer, recommended)
3. **Cache Invalidation**: After uploading new files, invalidate CloudFront cache:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id $(terraform output -raw cloudfront_website_distribution_id) \
     --paths "/*"
   ```
4. **Costs**: CloudFront and Route 53 have usage-based pricing

## Outputs

After applying, you'll get:
- S3 bucket names
- CloudFront distribution IDs and domain names
- Route 53 hosted zone ID
- **Name servers** (critical - update in GoDaddy)

## Cleanup

To destroy all resources:

```bash
terraform destroy
```

**Warning**: This will delete all resources including the Route 53 hosted zone. Make sure to backup any important data first.

