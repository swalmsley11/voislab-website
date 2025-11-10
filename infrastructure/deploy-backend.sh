#!/bin/bash

# VoisLab Backend Infrastructure Deployment Script
# Deploys only the backend services (no frontend hosting)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-dev}
AWS_REGION=${AWS_REGION:-us-west-2}

echo -e "${BLUE}🚀 VoisLab Backend Infrastructure Deployment${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo ""

# Function to print status messages
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command_exists aws; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    
    if ! command_exists cdk; then
        print_error "AWS CDK is not installed. Run: npm install -g aws-cdk"
        exit 1
    fi
    
    if ! command_exists node; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS credentials not configured. Run: aws configure"
        exit 1
    fi
    
    print_success "Prerequisites check completed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing CDK dependencies..."
    
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        npm install
        print_success "Dependencies installed"
    else
        print_status "Dependencies already up to date"
    fi
}

# Bootstrap CDK (if needed)
bootstrap_cdk() {
    print_status "Checking CDK bootstrap status..."
    
    # Check if bootstrap stack exists
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $AWS_REGION >/dev/null 2>&1; then
        print_status "CDK already bootstrapped"
    else
        print_status "Bootstrapping CDK..."
        cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/$AWS_REGION
        print_success "CDK bootstrap completed"
    fi
}

# Deploy infrastructure
deploy_infrastructure() {
    print_status "Deploying VoisLab backend infrastructure for $ENVIRONMENT..."
    
    local stack_name="VoislabWebsite-$ENVIRONMENT"
    
    # Deploy the stack
    cdk deploy $stack_name \
        --context environment=$ENVIRONMENT \
        --require-approval never \
        --outputs-file "outputs-$ENVIRONMENT.json"
    
    if [ $? -eq 0 ]; then
        print_success "Infrastructure deployment completed successfully"
    else
        print_error "Infrastructure deployment failed"
        exit 1
    fi
}

# Extract outputs for Amplify
extract_outputs() {
    print_status "Extracting outputs for Amplify configuration..."
    
    local outputs_file="outputs-$ENVIRONMENT.json"
    
    if [ -f "$outputs_file" ]; then
        # Extract key values for Amplify environment variables
        local table_name=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".AudioMetadataTableName // empty" "$outputs_file")
        local media_bucket=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".MediaBucketName // empty" "$outputs_file")
        local media_domain=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".MediaDistributionDomainName // empty" "$outputs_file")
        local dashboard_url=$(jq -r ".\"VoislabWebsite-$ENVIRONMENT\".MonitoringDashboardUrl // empty" "$outputs_file")
        
        echo ""
        echo -e "${GREEN}📋 Amplify Environment Variables for $ENVIRONMENT:${NC}"
        echo -e "${YELLOW}Copy these to your Amplify app configuration:${NC}"
        echo ""
        echo "VITE_AWS_REGION=$AWS_REGION"
        echo "VITE_ENVIRONMENT=$ENVIRONMENT"
        
        if [ -n "$table_name" ]; then
            echo "VITE_DYNAMODB_TABLE_NAME=$table_name"
        fi
        
        if [ -n "$media_bucket" ]; then
            echo "VITE_S3_MEDIA_BUCKET=$media_bucket"
        fi
        
        if [ -n "$media_domain" ]; then
            echo "VITE_CLOUDFRONT_DOMAIN=$media_domain"
        fi
        
        echo "VITE_ERROR_REPORTING_ENABLED=true"
        echo "VITE_PERFORMANCE_MONITORING_ENABLED=true"
        
        if [ "$ENVIRONMENT" = "prod" ]; then
            echo "VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Replace with your GA ID"
        fi
        
        echo ""
        
        if [ -n "$dashboard_url" ]; then
            echo -e "${GREEN}📊 CloudWatch Dashboard:${NC} $dashboard_url"
        fi
        
        print_success "Outputs extracted successfully"
    else
        print_warning "Outputs file not found: $outputs_file"
    fi
}

# Validate deployment
validate_deployment() {
    print_status "Validating deployment..."
    
    local stack_name="VoislabWebsite-$ENVIRONMENT"
    
    # Check stack status
    local stack_status=$(aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --query 'Stacks[0].StackStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$stack_status" = "CREATE_COMPLETE" ] || [ "$stack_status" = "UPDATE_COMPLETE" ]; then
        print_success "Stack deployment validated: $stack_status"
    else
        print_error "Stack deployment validation failed: $stack_status"
        exit 1
    fi
    
    # Test basic AWS service connectivity
    print_status "Testing AWS service connectivity..."
    
    # Test DynamoDB
    if aws dynamodb list-tables --region $AWS_REGION >/dev/null 2>&1; then
        print_success "DynamoDB connectivity verified"
    else
        print_warning "DynamoDB connectivity test failed"
    fi
    
    # Test S3
    if aws s3 ls >/dev/null 2>&1; then
        print_success "S3 connectivity verified"
    else
        print_warning "S3 connectivity test failed"
    fi
}

# Generate deployment summary
generate_summary() {
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo -e "${GREEN}🎉 VoisLab Backend Deployment Summary${NC}"
    echo -e "${GREEN}$(printf '=%.0s' {1..50})${NC}"
    echo -e "${BLUE}Environment: $ENVIRONMENT${NC}"
    echo -e "${BLUE}Region: $AWS_REGION${NC}"
    echo -e "${BLUE}Duration: ${duration}s${NC}"
    echo -e "${BLUE}Stack: VoislabWebsite-$ENVIRONMENT${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Set up AWS Amplify app for frontend hosting"
    echo "2. Configure environment variables in Amplify (see above)"
    echo "3. Connect your GitHub repository to Amplify"
    echo "4. Deploy frontend by pushing to main/develop branch"
    echo ""
    echo -e "${YELLOW}Documentation:${NC}"
    echo "- Amplify setup: ../docs/AMPLIFY_DEPLOYMENT.md"
    echo "- Integration testing: ../docs/INTEGRATION_TESTING.md"
}

# Main execution
main() {
    start_time=$(date +%s)
    
    print_status "Starting VoisLab backend deployment for $ENVIRONMENT environment..."
    
    check_prerequisites
    install_dependencies
    bootstrap_cdk
    deploy_infrastructure
    extract_outputs
    validate_deployment
    generate_summary
    
    print_success "Backend deployment completed successfully!"
}

# Show usage if no environment specified
if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev"
    echo "Example: $0 prod"
    exit 1
fi

# Validate environment parameter
if [ "$ENVIRONMENT" != "dev" ] && [ "$ENVIRONMENT" != "prod" ]; then
    print_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Error handling
trap 'print_error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"