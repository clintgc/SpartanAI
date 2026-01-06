#!/bin/bash

# Upload test images to S3 and generate public URLs
# Usage: ./upload-test-images-to-s3.sh [bucket-name]

set -e

BUCKET_NAME="${1:-spartan-ai-test-images-$(date +%s)}"
REGION="us-east-1"
IMAGE_DIR="/Users/clintgc/SpaceMonkeyII/tests/test_images"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📤 Uploading Test Images to S3"
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
echo "📤 Uploading images..."
echo ""

# Array to store URLs
declare -a IMAGE_URLS

# Upload each image
for IMAGE_FILE in "Anthony-FL.jpeg" "ArmedRobbery-MI.webp" "ASSAULT-NC2.webp" "Burglary-OR.webp"; do
    IMAGE_PATH="${IMAGE_DIR}/${IMAGE_FILE}"
    
    if [ ! -f "$IMAGE_PATH" ]; then
        echo "⚠️  Warning: Image not found: $IMAGE_PATH"
        continue
    fi
    
    echo "  Uploading: $IMAGE_FILE"
    
    # Upload (bucket policy handles public access)
    aws s3 cp "$IMAGE_PATH" "s3://${BUCKET_NAME}/${IMAGE_FILE}" \
        --region "${REGION}" 2>&1
    
    # Generate URL
    IMAGE_URL="https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${IMAGE_FILE}"
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
echo "🧪 Test Command"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test with first image:"
echo "  ./test-scan.sh \"${IMAGE_URLS[0]}\""
echo ""
echo "Or test all images:"
echo "  for url in \"${IMAGE_URLS[@]}\"; do"
echo "    ./test-scan.sh \"\$url\""
echo "    sleep 5"
echo "  done"
echo ""
echo "📦 Bucket: ${BUCKET_NAME}"
echo "📍 Region: ${REGION}"
echo ""

