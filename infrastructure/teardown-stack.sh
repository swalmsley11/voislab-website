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

# Ensure script is run from infrastructure directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${RED}🗑️  VoisLab Stack Teardown${NC}"
echo -e "${YELLOW}Environment: ${ENVIRONMENT}${NC}"
echo -e "${YELLOW}Region: ${AWS_REGION}${NC}"
echo -e "${YELLOW}Working Directory: $(pwd)${NC}"
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
            
            # Delete all current objects
            aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
            
            # Delete all versions if versioning is enabled
            local versions=$(aws s3api list-object-versions \
                --bucket "$bucket" \
                --query 'Versions[].{Key:Key,VersionId:VersionId}' \
                --output json 2>/dev/null)
            
            if [ "$versions" != "null" ] && [ "$versions" != "[]" ] && [ -n "$versions" ]; then
                echo "$versions" | jq -c '.[] | {Key: .Key, VersionId: .VersionId}' | while read -r obj; do
                    aws s3api delete-object \
                        --bucket "$bucket" \
                        --key "$(echo "$obj" | jq -r '.Key')" \
                        --version-id "$(echo "$obj" | jq -r '.VersionId')" \
                        2>/dev/null || true
                done
            fi
            
            # Delete all delete markers
            local markers=$(aws s3api list-object-versions \
                --bucket "$bucket" \
                --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' \
                --output json 2>/dev/null)
            
            if [ "$markers" != "null" ] && [ "$markers" != "[]" ] && [ -n "$markers" ]; then
                echo "$markers" | jq -c '.[] | {Key: .Key, VersionId: .VersionId}' | while read -r obj; do
                    aws s3api delete-object \
                        --bucket "$bucket" \
                        --key "$(echo "$obj" | jq -r '.Key')" \
                        --version-id "$(echo "$obj" | jq -r '.VersionId')" \
                        2>/dev/null || true
                done
            fi
            
            print_success "Bucket emptied: $bucket"
        else
            print_status "Bucket not found or already deleted: $bucket"
        fi
    done
}

# Destroy CDK stack
destroy_stack() {
    print_status "Destroying CDK stack: VoislabWebsite-${ENVIRONMENT}..."
    
    # Ensure we're in the infrastructure directory
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    if cdk destroy "VoislabWebsite-${ENVIRONMENT}" \
        --context environment="${ENVIRONMENT}" \
        --force \
        --app "npx ts-node ${script_dir}/bin/infrastructure.ts"; then
        print_success "Stack destroyed successfully"
        return 0
    else
        print_error "Stack destruction failed"
        print_warning "Attempting direct CloudFormation deletion..."
        
        # Fallback to direct CloudFormation deletion
        if aws cloudformation delete-stack \
            --stack-name "VoislabWebsite-${ENVIRONMENT}" \
            --region "$AWS_REGION"; then
            print_status "CloudFormation deletion initiated"
            print_status "Waiting for stack deletion to complete..."
            
            aws cloudformation wait stack-delete-complete \
                --stack-name "VoislabWebsite-${ENVIRONMENT}" \
                --region "$AWS_REGION" 2>/dev/null || true
            
            print_success "Stack deleted via CloudFormation"
            return 0
        else
            print_error "CloudFormation deletion also failed"
            return 1
        fi
    fi
}

# Verify cleanup
verify_cleanup() {
    print_status "Verifying cleanup..."
    
    # Check if stack still exists
    local stack_status=$(aws cloudformation describe-stacks \
        --stack-name "VoislabWebsite-${ENVIRONMENT}" \
        --region "$AWS_REGION" \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$stack_status" = "NOT_FOUND" ]; then
        print_success "Stack successfully removed"
    elif [ "$stack_status" = "DELETE_IN_PROGRESS" ]; then
        print_warning "Stack deletion in progress: $stack_status"
        print_status "You can monitor progress with: aws cloudformation describe-stacks --stack-name VoislabWebsite-${ENVIRONMENT}"
    else
        print_warning "Stack still exists with status: $stack_status"
    fi
    
    # Check buckets
    local remaining_buckets=$(aws s3api list-buckets \
        --query "Buckets[?contains(Name, 'voislab') && contains(Name, '${ENVIRONMENT}')].Name" \
        --output json 2>/dev/null | jq -r '.[]' 2>/dev/null)
    
    if [ -n "$remaining_buckets" ]; then
        print_warning "Some VoisLab buckets still exist:"
        echo "$remaining_buckets" | while read -r bucket; do
            echo "  - $bucket"
        done
        echo ""
        print_status "These may be retained due to RemovalPolicy settings or deletion protection"
    else
        print_success "All VoisLab buckets removed"
    fi
    
    # Check DynamoDB tables
    local remaining_tables=$(aws dynamodb list-tables \
        --query "TableNames[?contains(@, 'voislab') && contains(@, '${ENVIRONMENT}')]" \
        --output json 2>/dev/null | jq -r '.[]' 2>/dev/null)
    
    if [ -n "$remaining_tables" ]; then
        print_warning "Some VoisLab DynamoDB tables still exist:"
        echo "$remaining_tables" | while read -r table; do
            echo "  - $table"
        done
    else
        print_success "All VoisLab DynamoDB tables removed"
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