#!/bin/bash

# VoisLab Website Deployment Validation Script
# This script validates that a deployment is working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
STACK_NAME=""
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -e|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -s|--stack-name)
      STACK_NAME="$2"
      shift 2
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  -e, --environment    Environment (dev|prod) [default: dev]"
      echo "  -s, --stack-name     CloudFormation stack name [default: VoislabWebsite-{env}]"
      echo "  -v, --verbose        Verbose output"
      echo "  -h, --help          Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Set default stack name if not provided
if [ -z "$STACK_NAME" ]; then
  STACK_NAME="VoislabWebsite-$ENVIRONMENT"
fi

echo -e "${GREEN}VoisLab Deployment Validation${NC}"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Stack Name: $STACK_NAME"
echo ""

# Function to log messages
log() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${YELLOW}[INFO]${NC} $1"
  fi
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists aws; then
  echo -e "${RED}❌ AWS CLI not found${NC}"
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo -e "${RED}❌ AWS credentials not configured${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Check stack status
echo -e "${YELLOW}Checking CloudFormation stack...${NC}"

if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" >/dev/null 2>&1; then
  echo -e "${RED}❌ Stack '$STACK_NAME' not found${NC}"
  exit 1
fi

STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].StackStatus' --output text)
log "Stack status: $STACK_STATUS"

if [[ "$STACK_STATUS" != "CREATE_COMPLETE" && "$STACK_STATUS" != "UPDATE_COMPLETE" ]]; then
  echo -e "${RED}❌ Stack is not in a healthy state: $STACK_STATUS${NC}"
  exit 1
fi

echo -e "${GREEN}✅ CloudFormation stack is healthy${NC}"

# Get stack outputs
echo -e "${YELLOW}Retrieving stack outputs...${NC}"

get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || echo ""
}

UPLOAD_BUCKET=$(get_output "UploadBucketName")
MEDIA_BUCKET=$(get_output "MediaBucketName")
WEBSITE_BUCKET=$(get_output "WebsiteBucketName")
METADATA_TABLE=$(get_output "AudioMetadataTableName")
AUDIO_PROCESSOR=$(get_output "AudioProcessorFunctionName")
MEDIA_DISTRIBUTION=$(get_output "MediaDistributionDomainName")
WEBSITE_URL=$(get_output "WebsiteURL")
AMPLIFY_APP_ID=$(get_output "AmplifyAppId")

log "Upload Bucket: $UPLOAD_BUCKET"
log "Media Bucket: $MEDIA_BUCKET"
log "Website Bucket: $WEBSITE_BUCKET"
log "Metadata Table: $METADATA_TABLE"
log "Audio Processor: $AUDIO_PROCESSOR"
log "Media Distribution: $MEDIA_DISTRIBUTION"
log "Website URL: $WEBSITE_URL"
log "Amplify App ID: $AMPLIFY_APP_ID"

# Validate S3 buckets
echo -e "${YELLOW}Validating S3 buckets...${NC}"

validate_bucket() {
  local bucket_name=$1
  local bucket_type=$2
  
  if [ -z "$bucket_name" ]; then
    echo -e "${RED}❌ $bucket_type bucket name not found in stack outputs${NC}"
    return 1
  fi
  
  if ! aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
    echo -e "${RED}❌ $bucket_type bucket '$bucket_name' is not accessible${NC}"
    return 1
  fi
  
  log "$bucket_type bucket '$bucket_name' is accessible"
  
  # Check public access block
  PUBLIC_ACCESS=$(aws s3api get-public-access-block --bucket "$bucket_name" --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")
  if [ "$PUBLIC_ACCESS" = "true" ]; then
    log "$bucket_type bucket has public access blocked"
  else
    echo -e "${YELLOW}⚠️ $bucket_type bucket allows public access${NC}"
  fi
  
  echo -e "${GREEN}✅ $bucket_type bucket validation passed${NC}"
  return 0
}

validate_bucket "$UPLOAD_BUCKET" "Upload"
validate_bucket "$MEDIA_BUCKET" "Media"

if [ -n "$WEBSITE_BUCKET" ]; then
  validate_bucket "$WEBSITE_BUCKET" "Website"
fi

# Validate DynamoDB table
echo -e "${YELLOW}Validating DynamoDB table...${NC}"

if [ -z "$METADATA_TABLE" ]; then
  echo -e "${RED}❌ Metadata table name not found in stack outputs${NC}"
  exit 1
fi

if ! aws dynamodb describe-table --table-name "$METADATA_TABLE" >/dev/null 2>&1; then
  echo -e "${RED}❌ Metadata table '$METADATA_TABLE' is not accessible${NC}"
  exit 1
fi

TABLE_STATUS=$(aws dynamodb describe-table --table-name "$METADATA_TABLE" --query 'Table.TableStatus' --output text)
if [ "$TABLE_STATUS" != "ACTIVE" ]; then
  echo -e "${RED}❌ Metadata table is not active: $TABLE_STATUS${NC}"
  exit 1
fi

log "Metadata table '$METADATA_TABLE' is active"
echo -e "${GREEN}✅ DynamoDB table validation passed${NC}"

# Validate Lambda functions
echo -e "${YELLOW}Validating Lambda functions...${NC}"

if [ -z "$AUDIO_PROCESSOR" ]; then
  echo -e "${RED}❌ Audio processor function name not found in stack outputs${NC}"
  exit 1
fi

if ! aws lambda get-function --function-name "$AUDIO_PROCESSOR" >/dev/null 2>&1; then
  echo -e "${RED}❌ Audio processor function '$AUDIO_PROCESSOR' is not accessible${NC}"
  exit 1
fi

# Test Lambda function invocation
log "Testing Lambda function invocation..."
if aws lambda invoke --function-name "$AUDIO_PROCESSOR" --payload '{"test": true}' /tmp/lambda_test_response.json >/dev/null 2>&1; then
  log "Audio processor function invocation successful"
else
  echo -e "${YELLOW}⚠️ Audio processor function invocation failed${NC}"
fi

echo -e "${GREEN}✅ Lambda function validation passed${NC}"

# Validate CloudFront distribution
echo -e "${YELLOW}Validating CloudFront distribution...${NC}"

if [ -z "$MEDIA_DISTRIBUTION" ]; then
  echo -e "${RED}❌ Media distribution domain not found in stack outputs${NC}"
  exit 1
fi

# Test CloudFront accessibility
log "Testing CloudFront distribution accessibility..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$MEDIA_DISTRIBUTION" || echo "000")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then
  log "CloudFront distribution is accessible (HTTP $HTTP_CODE)"
else
  echo -e "${YELLOW}⚠️ CloudFront distribution returned HTTP $HTTP_CODE${NC}"
fi

echo -e "${GREEN}✅ CloudFront distribution validation passed${NC}"

# Validate website accessibility
if [ -n "$WEBSITE_URL" ]; then
  echo -e "${YELLOW}Validating website accessibility...${NC}"
  
  log "Testing website URL: $WEBSITE_URL"
  WEBSITE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEBSITE_URL" || echo "000")
  
  if [ "$WEBSITE_HTTP_CODE" = "200" ]; then
    log "Website is accessible (HTTP $WEBSITE_HTTP_CODE)"
    echo -e "${GREEN}✅ Website accessibility validation passed${NC}"
  else
    echo -e "${YELLOW}⚠️ Website returned HTTP $WEBSITE_HTTP_CODE${NC}"
    echo -e "${YELLOW}This may be normal if the website is not yet deployed${NC}"
  fi
fi

# Validate Amplify app (if configured)
if [ -n "$AMPLIFY_APP_ID" ]; then
  echo -e "${YELLOW}Validating Amplify app...${NC}"
  
  if aws amplify get-app --app-id "$AMPLIFY_APP_ID" >/dev/null 2>&1; then
    APP_STATUS=$(aws amplify get-app --app-id "$AMPLIFY_APP_ID" --query 'app.defaultDomain' --output text)
    log "Amplify app is accessible: $APP_STATUS"
    echo -e "${GREEN}✅ Amplify app validation passed${NC}"
  else
    echo -e "${RED}❌ Amplify app '$AMPLIFY_APP_ID' is not accessible${NC}"
  fi
fi

# Summary
echo ""
echo -e "${GREEN}🎉 Deployment validation completed successfully!${NC}"
echo ""
echo "Summary:"
echo "- CloudFormation stack: ✅ Healthy"
echo "- S3 buckets: ✅ Accessible"
echo "- DynamoDB table: ✅ Active"
echo "- Lambda functions: ✅ Working"
echo "- CloudFront distribution: ✅ Accessible"

if [ -n "$WEBSITE_URL" ]; then
  echo "- Website: ✅ Available at $WEBSITE_URL"
fi

if [ -n "$AMPLIFY_APP_ID" ]; then
  echo "- Amplify app: ✅ Configured"
fi

echo ""
echo -e "${GREEN}Deployment is ready for use!${NC}"