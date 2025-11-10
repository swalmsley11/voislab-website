#!/bin/bash

# Get Backend Configuration Script
# Extracts environment variables from CDK outputs for local development

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUTS_FILE="$PROJECT_ROOT/infrastructure/outputs-$ENVIRONMENT.json"

echo "🔍 Backend Configuration for $ENVIRONMENT environment"
echo ""

if [ ! -f "$OUTPUTS_FILE" ]; then
    echo "❌ Error: $OUTPUTS_FILE not found"
    echo ""
    echo "Deploy the backend first:"
    echo "  cd infrastructure"
    echo "  ./deploy-backend.sh $ENVIRONMENT"
    exit 1
fi

echo "📋 Environment Variables for .env.local:"
echo ""
echo "# Copy these to your .env.local file"
echo "VITE_AWS_REGION=us-west-2"
echo "VITE_ENVIRONMENT=$ENVIRONMENT"

# Extract values using jq
if command -v jq >/dev/null 2>&1; then
    TABLE_NAME=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".AudioMetadataTableName // empty" "$OUTPUTS_FILE")
    BUCKET_NAME=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".MediaBucketName // empty" "$OUTPUTS_FILE")
    CF_DOMAIN=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".MediaDistributionDomainName // empty" "$OUTPUTS_FILE")
    
    [ -n "$TABLE_NAME" ] && echo "VITE_DYNAMODB_TABLE_NAME=$TABLE_NAME"
    [ -n "$BUCKET_NAME" ] && echo "VITE_S3_MEDIA_BUCKET=$BUCKET_NAME"
    [ -n "$CF_DOMAIN" ] && echo "VITE_CLOUDFRONT_DOMAIN=$CF_DOMAIN"
else
    echo "⚠️  jq not installed. Showing raw output:"
    echo ""
    cat "$OUTPUTS_FILE"
fi

echo ""
echo "✅ Configuration retrieved successfully"
echo ""
echo "Next steps:"
echo "1. Copy the values above to .env.local"
echo "2. Run: npm run dev"
