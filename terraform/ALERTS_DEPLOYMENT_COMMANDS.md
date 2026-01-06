# Alerts Subdomain Deployment Commands

## 1. Apply Terraform

```bash
cd terraform
terraform init
terraform plan  # Review changes
terraform apply
```

## 2. Upload alert.html to S3

After Terraform applies successfully, upload the alert.html file:

```bash
# Option 1: Create directory structure and upload
mkdir -p alert-page/scan
cp ../www/alert.html alert-page/scan/index.html
aws s3 sync alert-page/ s3://$(terraform output -raw alerts_s3_bucket_name)/ --delete

# Option 2: Direct upload (simpler)
aws s3 cp ../www/alert.html s3://$(terraform output -raw alerts_s3_bucket_name)/scan/index.html \
  --content-type "text/html" \
  --cache-control "public, max-age=3600"
```

## 3. Invalidate CloudFront Cache

After uploading, invalidate the CloudFront cache:

```bash
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw alerts_cloudfront_distribution_id) \
  --paths "/scan/*" "/*"
```

## 4. Verify Deployment

```bash
# Get the final URL
terraform output alerts_final_url

# Test with a scan ID
curl -I https://alerts.spartan.tech/scan/test-scan-id-123

# Check DNS propagation
dig alerts.spartan.tech
```

## Quick Deploy Script

```bash
#!/bin/bash
set -e

cd terraform

echo "📦 Applying Terraform..."
terraform apply -auto-approve

echo "📤 Uploading alert.html..."
BUCKET=$(terraform output -raw alerts_s3_bucket_name)
aws s3 cp ../www/alert.html s3://${BUCKET}/scan/index.html \
  --content-type "text/html" \
  --cache-control "public, max-age=3600"

echo "🔄 Invalidating CloudFront cache..."
DIST_ID=$(terraform output -raw alerts_cloudfront_distribution_id)
aws cloudfront create-invalidation \
  --distribution-id ${DIST_ID} \
  --paths "/scan/*" "/*"

echo "✅ Deployment complete!"
echo "🌐 URL: $(terraform output -raw alerts_final_url)"
```

