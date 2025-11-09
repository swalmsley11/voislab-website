#!/bin/bash

# VoisLab Stack Teardown Script
# Safely destroys VoisLab infrastructure including S3 buckets with content

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-west-2}

echo -e "${RED}🗑️  VoisLab Stack Teardown${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Region: ${AWS_REGION}${NC}"
echo ""

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

# Empty S3 buckets
empty_s3_buckets() {
    print_status "Emptying S3 buckets..."
    
    local buckets=(
        "voislab-upload-${ENVIRONMENT}-${ACCOUNT_ID}"
        "voislab-media-${ENVIRONMENT}-${ACCOUNT_ID}"
        "voislab-website-${ENVIRONMENT}-${ACCOUNT_ID}"
    )
    
    for bucket in "${buckets[@]}"; do
        if aws s3 ls "s3://$bucket" >/dev/null 2>&1; then
            print_status "Emptying bucket: $bucket"
            
            # Delete all objects and versions
            aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
            
            # Delete all versions if versioning is enabled
            aws s3api delete-objects \
                --bucket "$bucket" \
                --delete "$(aws s3api list-object-versions \
                    --bucket "$bucket" \
                    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
                    --output json 2>/dev/null || echo '{}')" \
                2>/dev/null || true
            
            # Delete all delete markers
            aws s3api delete-objects \
                --bucket "$bucket" \
                --delete "$(aws s3api list-object-versions \
                    --bucket "$bucket" \
                    --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
                    --output json 2>/dev/null || echo '{}')" \
                2>/dev/null || true
            
            print_success "Bucket emptied: $bucket"
        else
            print_status "Bucket not found or already deleted: $bucket"
        fi
    done
}

# Destroy CDK stack
destroy_stack() {
    print_status "Destroying CDK stack: VoislabWebsite-${ENVIRONMENT}..."
    
    if cdk destroy "VoislabWebsite-${ENVIRONMENT}" --force; then
        print_success "Stack destroyed successfully"
        return 0
    else
        print_error "Stack destruction failed"
        return 1
    fi
}

# Verify cleanup
verify_cleanup() {
    print_status "Verifying cleanup..."
    
    # Check if stack still exists
    if aws cloudformation describe-stacks \
        --stack-name "VoislabWebsite-${ENVIRONMENT}" \
        --region "$AWS_REGION" >/dev/null 2>&1; then
        print_warning "Stack still exists (may be in DELETE_IN_PROGRESS state)"
    else
        print_success "Stack successfully removed"
    fi
    
    # Check buckets
    local remaining_buckets=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name, 'voislab-${ENVIRONMENT}')].Name" \
        --output json 2>/dev/null | jq -r '.[]' | wc -l)
    
    if [ "$remaining_buckets" -gt 0 ]; then
        print_warning "$remaining_buckets VoisLab buckets still exist"
    else
        print_success "All VoisLab buckets removed"
    fi
}

# Main execution
main() {
    print_warning "This will destroy all VoisLab resources in the ${ENVIRONMENT} environment!"
    print_warning "This action cannot be undone."
    echo ""
    
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_status "Teardown cancelled"
        exit 0
    fi
    
    echo ""
    print_status "Starting teardown process..."
    
    empty_s3_buckets
    destroy_stack
    verify_cleanup
    
    print_success "Teardown completed!"
    echo ""
    echo -e "${GREEN}✓ VoisLab ${ENVIRONMENT} environment has been torn down${NC}"
}

# Show usage
if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev"
    echo "Example: $0 prod"
    exit 1
fi

# Validate environment
if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "prod" ]; then
    print_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Run main
main "$@"