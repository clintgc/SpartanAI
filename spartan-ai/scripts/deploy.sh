#!/bin/bash
# Deployment script for Spartan AI

set -e

ENVIRONMENT=${1:-dev}

echo "Deploying Spartan AI to ${ENVIRONMENT} environment..."

cd infrastructure

# Install dependencies
echo "Installing dependencies..."
npm install

# Build
echo "Building..."
npm run build

# Deploy
echo "Deploying CDK stack..."
if [ "$ENVIRONMENT" == "prod" ]; then
  npm run cdk deploy -- --require-approval never
else
  npm run cdk deploy -- --require-approval never --context environment=$ENVIRONMENT
fi

echo "Deployment complete!"

