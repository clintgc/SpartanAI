#!/bin/bash

# Upload all test images from www/img/test-images to S3
# Usage: ./upload-all-test-images.sh [bucket-name]

set -e

BUCKET_NAME="${1:-spartan-ai-test-images-1767651941}"
REGION="us-east-1"
IMAGE_DIR="/Users/clintgc/SpaceMonkeyII/www/img/test-images"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Uploading All Test Images to S3"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if bucket exists
if aws s3 ls "s3://${BUCKET_NAME}" 2>&1 | grep -q "NoSuchBucket"; then
    echo "📦 Creating S3 bucket: ${BUCKET_NAME}"
    aws s3 mb "s3://${BUCKET_NAME}" --region "${REGION}" 2>&1
    
    # Enable public read access for images
    echo "🔓 Configuring bucket for public read access..."
    aws s3api put-public-access-block \
        --bucket "${BUCKET_NAME}" \
        --public-access-block-configuration \
        "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" 2>&1 || true
    
    # Set bucket policy for public read
    cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
EOF
    
    aws s3api put-bucket-policy --bucket "${BUCKET_NAME}" --policy file:///tmp/bucket-policy.json 2>&1
    rm /tmp/bucket-policy.json
    
    echo "✅ Bucket created and configured"
else
    echo "✅ Bucket already exists: ${BUCKET_NAME}"
fi

echo ""
echo "📤 Uploading images from ${IMAGE_DIR}..."
echo ""

# Array to store URLs
declare -a IMAGE_URLS

# Upload each image (excluding .DS_Store)
for IMAGE_FILE in "${IMAGE_DIR}"/*; do
    # Skip if not a file or if it's .DS_Store
    if [ ! -f "$IMAGE_FILE" ] || [[ "$(basename "$IMAGE_FILE")" == .DS_Store ]]; then
        continue
    fi
    
    FILENAME=$(basename "$IMAGE_FILE")
    echo "  Uploading: $FILENAME"
    
    # Upload (bucket policy handles public access)
    aws s3 cp "$IMAGE_FILE" "s3://${BUCKET_NAME}/${FILENAME}" \
        --region "${REGION}" 2>&1
    
    # Generate URL
    IMAGE_URL="https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${FILENAME}"
    IMAGE_URLS+=("$IMAGE_URL")
    
    echo "    ✅ URL: $IMAGE_URL"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Image URLs for Testing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for i in "${!IMAGE_URLS[@]}"; do
    IMAGE_NUM=$((i + 1))
    echo "${IMAGE_NUM}. ${IMAGE_URLS[$i]}"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Bucket: ${BUCKET_NAME}"
echo "📍 Region: ${REGION}"
echo "📊 Total Images: ${#IMAGE_URLS[@]}"
echo ""
