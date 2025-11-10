#!/bin/bash

# VoisLab Deployment Audit Script
# Checks what VoisLab resources are currently deployed in AWS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}

echo -e "${CYAN}🔍 VoisLab Deployment Audit${NC}"
echo -e "${BLUE}Region: ${AWS_REGION}${NC}"
echo -e "${BLUE}Account: $(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo 'Not configured')${NC}"
echo ""

# Function to print section headers
print_section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_found() {
    echo -e "${GREEN}✓${NC} $1"
}

print_not_found() {
    echo -e "${YELLOW}○${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check CloudFormation Stacks
check_cloudformation_stacks() {
    print_section "CloudFormation Stacks"
    
    local stacks=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query 'StackSummaries[?contains(StackName, `voislab`) || contains(StackName, `Voislab`)].{Name:StackName,Status:StackStatus,Created:CreationTime}' \
        --output json 2>/dev/null)
    
    if [ "$stacks" != "[]" ] && [ -n "$stacks" ]; then
        echo "$stacks" | jq -r '.[] | "  \(.Name) - \(.Status) (Created: \(.Created[:10]))"'
        
        # Get detailed info for each stack
        echo ""
        echo -e "${BLUE}Stack Details:${NC}"
        echo "$stacks" | jq -r '.[].Name' | while read stack_name; do
            echo ""
            echo -e "${YELLOW}Stack: $stack_name${NC}"
            aws cloudformation describe-stacks \
                --stack-name "$stack_name" \
                --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
                --output table 2>/dev/null || echo "  No outputs available"
        done
    else
        print_not_found "No VoisLab CloudFormation stacks found"
    fi
}

# Check S3 Buckets
check_s3_buckets() {
    print_section "S3 Buckets"
    
    local buckets=$(aws s3api list-buckets \
        --query 'Buckets[?contains(Name, `voislab`)].{Name:Name,Created:CreationDate}' \
        --output json 2>/dev/null)
    
    if [ "$buckets" != "[]" ] && [ -n "$buckets" ]; then
        echo "$buckets" | jq -r '.[] | "  \(.Name) (Created: \(.Created[:10]))"'
        
        # Check bucket sizes
        echo ""
        echo -e "${BLUE}Bucket Sizes:${NC}"
        echo "$buckets" | jq -r '.[].Name' | while read bucket_name; do
            local size=$(aws s3 ls s3://$bucket_name --recursive --summarize 2>/dev/null | grep "Total Size" | awk '{print $3}')
            local count=$(aws s3 ls s3://$bucket_name --recursive --summarize 2>/dev/null | grep "Total Objects" | awk '{print $3}')
            if [ -n "$size" ]; then
                local size_mb=$((size / 1024 / 1024))
                echo "  $bucket_name: ${size_mb}MB ($count objects)"
            else
                echo "  $bucket_name: Empty or inaccessible"
            fi
        done
    else
        print_not_found "No VoisLab S3 buckets found"
    fi
}

# Check DynamoDB Tables
check_dynamodb_tables() {
    print_section "DynamoDB Tables"
    
    local tables=$(aws dynamodb list-tables \
        --query 'TableNames[?contains(@, `voislab`)]' \
        --output json 2>/dev/null)
    
    if [ "$tables" != "[]" ] && [ -n "$tables" ]; then
        echo "$tables" | jq -r '.[]' | while read table_name; do
            local info=$(aws dynamodb describe-table \
                --table-name "$table_name" \
                --query 'Table.{Status:TableStatus,Items:ItemCount,Size:TableSizeBytes,Created:CreationDateTime}' \
                --output json 2>/dev/null)
            
            if [ -n "$info" ]; then
                local status=$(echo "$info" | jq -r '.Status')
                local items=$(echo "$info" | jq -r '.Items')
                local size=$(echo "$info" | jq -r '.Size')
                local size_mb=$((size / 1024 / 1024))
                echo "  $table_name"
                echo "    Status: $status"
                echo "    Items: $items"
                echo "    Size: ${size_mb}MB"
            fi
        done
    else
        print_not_found "No VoisLab DynamoDB tables found"
    fi
}

# Check Lambda Functions
check_lambda_functions() {
    print_section "Lambda Functions"
    
    local functions=$(aws lambda list-functions \
        --query 'Functions[?contains(FunctionName, `voislab`)].{Name:FunctionName,Runtime:Runtime,Size:CodeSize,Modified:LastModified}' \
        --output json 2>/dev/null)
    
    if [ "$functions" != "[]" ] && [ -n "$functions" ]; then
        echo "$functions" | jq -r '.[] | "  \(.Name) (\(.Runtime), \(.Size) bytes)"'
    else
        print_not_found "No VoisLab Lambda functions found"
    fi
}

# Check CloudFront Distributions
check_cloudfront_distributions() {
    print_section "CloudFront Distributions"
    
    local distributions=$(aws cloudfront list-distributions \
        --query 'DistributionList.Items[?contains(Comment, `voislab`) || contains(Comment, `VoisLab`)].{Id:Id,Domain:DomainName,Status:Status,Comment:Comment}' \
        --output json 2>/dev/null)
    
    if [ "$distributions" != "[]" ] && [ -n "$distributions" ]; then
        echo "$distributions" | jq -r '.[] | "  \(.Id) - \(.Domain)\n    Status: \(.Status)\n    Comment: \(.Comment)"'
    else
        print_not_found "No VoisLab CloudFront distributions found"
    fi
}

# Check Amplify Apps
check_amplify_apps() {
    print_section "AWS Amplify Apps"
    
    local apps=$(aws amplify list-apps \
        --query 'apps[?contains(name, `voislab`)].{Name:name,Id:appId,Domain:defaultDomain,Created:createTime}' \
        --output json 2>/dev/null)
    
    if [ "$apps" != "[]" ] && [ -n "$apps" ]; then
        echo "$apps" | jq -r '.[] | "  \(.Name) (ID: \(.Id))\n    Domain: \(.Domain)\n    Created: \(.Created[:10])"'
        
        # Check branches for each app
        echo ""
        echo -e "${BLUE}Amplify Branches:${NC}"
        echo "$apps" | jq -r '.[].Id' | while read app_id; do
            local branches=$(aws amplify list-branches \
                --app-id "$app_id" \
                --query 'branches[].{Name:branchName,Stage:stage,Status:activeJobId}' \
                --output json 2>/dev/null)
            
            if [ "$branches" != "[]" ] && [ -n "$branches" ]; then
                echo "  App: $app_id"
                echo "$branches" | jq -r '.[] | "    - \(.Name) (\(.Stage))"'
            fi
        done
    else
        print_not_found "No VoisLab Amplify apps found"
    fi
}

# Check CloudWatch Alarms
check_cloudwatch_alarms() {
    print_section "CloudWatch Alarms"
    
    local alarms=$(aws cloudwatch describe-alarms \
        --query 'MetricAlarms[?contains(AlarmName, `voislab`)].{Name:AlarmName,State:StateValue,Metric:MetricName}' \
        --output json 2>/dev/null)
    
    if [ "$alarms" != "[]" ] && [ -n "$alarms" ]; then
        echo "$alarms" | jq -r '.[] | "  \(.Name) - \(.State) (\(.Metric))"'
    else
        print_not_found "No VoisLab CloudWatch alarms found"
    fi
}

# Check SNS Topics
check_sns_topics() {
    print_section "SNS Topics"
    
    local topics=$(aws sns list-topics \
        --query 'Topics[?contains(TopicArn, `voislab`)].TopicArn' \
        --output json 2>/dev/null)
    
    if [ "$topics" != "[]" ] && [ -n "$topics" ]; then
        echo "$topics" | jq -r '.[]' | while read topic_arn; do
            local topic_name=$(echo "$topic_arn" | awk -F: '{print $NF}')
            echo "  $topic_name"
            echo "    ARN: $topic_arn"
        done
    else
        print_not_found "No VoisLab SNS topics found"
    fi
}

# Check Route 53 Hosted Zones
check_route53_zones() {
    print_section "Route 53 Hosted Zones"
    
    local zones=$(aws route53 list-hosted-zones \
        --query 'HostedZones[?contains(Name, `voislab`)].{Name:Name,Id:Id,Records:ResourceRecordSetCount}' \
        --output json 2>/dev/null)
    
    if [ "$zones" != "[]" ] && [ -n "$zones" ]; then
        echo "$zones" | jq -r '.[] | "  \(.Name) (ID: \(.Id))\n    Records: \(.Records)"'
    else
        print_not_found "No VoisLab Route 53 hosted zones found"
    fi
}

# Generate Summary
generate_summary() {
    print_section "Deployment Summary"
    
    echo -e "${BLUE}Resource Counts:${NC}"
    
    local stack_count=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query 'StackSummaries[?contains(StackName, `voislab`)].StackName' \
        --output json 2>/dev/null | jq '. | length')
    
    local bucket_count=$(aws s3api list-buckets \
        --query 'Buckets[?contains(Name, `voislab`)].Name' \
        --output json 2>/dev/null | jq '. | length')
    
    local table_count=$(aws dynamodb list-tables \
        --query 'TableNames[?contains(@, `voislab`)]' \
        --output json 2>/dev/null | jq '. | length')
    
    local function_count=$(aws lambda list-functions \
        --query 'Functions[?contains(FunctionName, `voislab`)].FunctionName' \
        --output json 2>/dev/null | jq '. | length')
    
    local amplify_count=$(aws amplify list-apps \
        --query 'apps[?contains(name, `voislab`)].appId' \
        --output json 2>/dev/null | jq '. | length')
    
    echo "  CloudFormation Stacks: $stack_count"
    echo "  S3 Buckets: $bucket_count"
    echo "  DynamoDB Tables: $table_count"
    echo "  Lambda Functions: $function_count"
    echo "  Amplify Apps: $amplify_count"
    
    echo ""
    if [ "$stack_count" -gt 0 ] || [ "$bucket_count" -gt 0 ] || [ "$table_count" -gt 0 ]; then
        echo -e "${GREEN}✓ VoisLab resources are deployed${NC}"
        echo ""
        echo -e "${YELLOW}Next Steps:${NC}"
        echo "  1. Review the resources above"
        echo "  2. If you want to keep them: Set up Amplify separately"
        echo "  3. If you want to start fresh: Run './scripts/teardown-resources.sh'"
    else
        echo -e "${YELLOW}○ No VoisLab resources found${NC}"
        echo ""
        echo -e "${YELLOW}Next Steps:${NC}"
        echo "  1. Deploy backend: './infrastructure/deploy-backend.sh dev'"
        echo "  2. Set up Amplify in AWS Console"
        echo "  3. Configure environment variables and deploy"
    fi
}

# Main execution
main() {
    # Check AWS CLI is configured
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        print_error "AWS CLI not configured. Run: aws configure"
        exit 1
    fi
    
    # Run all checks
    check_cloudformation_stacks
    check_s3_buckets
    check_dynamodb_tables
    check_lambda_functions
    check_cloudfront_distributions
    check_amplify_apps
    check_cloudwatch_alarms
    check_sns_topics
    check_route53_zones
    generate_summary
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Audit complete!${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Run main function
main "$@"