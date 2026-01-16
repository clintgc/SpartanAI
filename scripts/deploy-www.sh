#!/bin/bash
# Deployment script for www directory to S3 and CloudFront

set -e

# Use spartan-ai AWS profile
AWS_PROFILE="${AWS_PROFILE:-spartan-ai}"
BUCKET_NAME="www.spartan.tech"
CLOUDFRONT_DIST_ID="E19M7RWJYRAR7Q"

echo "🚀 Deploying www directory to S3 and CloudFront..."
echo "📦 Bucket: $BUCKET_NAME"
echo "🌐 CloudFront Distribution: $CLOUDFRONT_DIST_ID"
echo "🔑 Using AWS Profile: $AWS_PROFILE"
echo ""

# Upload www directory to S3
echo "📤 Uploading files to S3..."
aws s3 sync www/ s3://${BUCKET_NAME}/ \
  --profile ${AWS_PROFILE} \
  --delete \
  --exclude "*.md" \
  --exclude "DEMO_DASHBOARD_TEST_GUIDE.md" \
  --cache-control "public, max-age=3600" \
  --region us-east-1

# Set specific cache headers for HTML files
echo "📤 Setting cache headers for HTML files..."
aws s3 cp www/demo-dashboard.html s3://${BUCKET_NAME}/demo-dashboard.html \
  --profile ${AWS_PROFILE} \
  --content-type "text/html" \
  --cache-control "public, max-age=0, must-revalidate" \
  --region us-east-1

# Set cache headers for JS files (no cache for development)
echo "📤 Setting cache headers for JS files..."
aws s3 cp www/js/demo-dashboard.js s3://${BUCKET_NAME}/js/demo-dashboard.js \
  --profile ${AWS_PROFILE} \
  --content-type "application/javascript" \
  --cache-control "public, max-age=0, must-revalidate" \
  --region us-east-1

aws s3 cp www/js/image-loader.js s3://${BUCKET_NAME}/js/image-loader.js \
  --profile ${AWS_PROFILE} \
  --content-type "application/javascript" \
  --cache-control "public, max-age=0, must-revalidate" \
  --region us-east-1

# Invalidate CloudFront cache
echo ""
echo "🔄 Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --profile ${AWS_PROFILE} \
  --distribution-id ${CLOUDFRONT_DIST_ID} \
  --paths "/demo-dashboard.html" "/js/demo-dashboard.js" "/js/image-loader.js" "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo ""
echo "✅ Deployment complete!"
echo "📋 Invalidation ID: $INVALIDATION_ID"
echo "⏳ Cache invalidation in progress (usually takes 1-2 minutes)"
echo "🌐 URL: https://www.spartan.tech/demo-dashboard.html"
