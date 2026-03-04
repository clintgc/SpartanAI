# Opt-Out Page Deployment

## Code Changes

### File: `www/index.html`

**Update footer link (line 78):**

```diff
        <div class="footer-links">
            <a href="#terms">Terms of Service</a>
            <span class="separator">|</span>
-           <a href="#opt-in-out">Opt-in | Opt-Out</a>
+           <a href="/optout">Opt Out</a>
        </div>
```

## Deployment Commands

### 1. Upload optout.html as optout/index.html

```bash
# Upload optout page to S3 (creates /optout URL)
aws s3 cp www/optout.html s3://www.spartan.tech/optout/index.html \
  --content-type "text/html" \
  --region us-east-1
```

### 2. Upload updated index.html

```bash
# Upload updated homepage with optout link
aws s3 cp www/index.html s3://www.spartan.tech/index.html \
  --content-type "text/html" \
  --region us-east-1
```

### 3. Invalidate CloudFront Cache

```bash
# Invalidate homepage and optout page
aws cloudfront create-invalidation \
  --distribution-id E19M7RWJYRAR7Q \
  --paths "/index.html" "/optout/*" "/optout/index.html"
```

## All-in-One Deployment Script

```bash
#!/bin/bash
set -e

echo "📤 Uploading optout page..."
aws s3 cp www/optout.html s3://www.spartan.tech/optout/index.html \
  --content-type "text/html" \
  --region us-east-1

echo "📤 Uploading updated homepage..."
aws s3 cp www/index.html s3://www.spartan.tech/index.html \
  --content-type "text/html" \
  --region us-east-1

echo "🔄 Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id E19M7RWJYRAR7Q \
  --paths "/index.html" "/optout/*" "/optout/index.html" \
  --query 'Invalidation.Id' \
  --output text)

echo "✅ Deployment complete!"
echo "📋 Invalidation ID: $INVALIDATION_ID"
echo "⏳ Cache invalidation in progress (usually takes 1-2 minutes)"
```

## Verification

After deployment, test:
- Homepage: `https://www.spartan.tech/` (footer should have "Opt Out" link)
- Opt-out page: `https://www.spartan.tech/optout` (should load optout.html)

## S3 Bucket Details

- **Bucket**: `www.spartan.tech`
- **Region**: `us-east-1`
- **CloudFront Distribution ID**: `E19M7RWJYRAR7Q`

