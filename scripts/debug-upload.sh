#!/bin/bash

###############################################################################
# VoisLab Upload Debugging Script
#
# Helps debug upload and processing issues
#
# Usage:
#   ./scripts/debug-upload.sh <filename> [environment]
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          VoisLab Upload Debugging Tool                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

get_bucket_name() {
    local env=$1
    local type=$2
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    echo "voislab-${type}-${env}-${account_id}"
}

main() {
    print_header
    
    if [ $# -lt 1 ]; then
        echo "Usage: $0 <filename> [environment]"
        echo ""
        echo "Example: $0 'Silicon Horizon.wav' dev"
        exit 1
    fi
    
    local filename=$1
    local environment=${2:-dev}
    
    print_info "Debugging: $filename"
    print_info "Environment: $environment"
    
    # Get resource names
    local upload_bucket=$(get_bucket_name "$environment" "upload")
    local media_bucket=$(get_bucket_name "$environment" "media")
    local table_name="voislab-audio-metadata-${environment}"
    local lambda_name="voislab-audio-processor-${environment}"
    
    # Check 1: Upload bucket
    print_section "1. Checking Upload Bucket"
    if aws s3 ls "s3://$upload_bucket/audio/$filename" &> /dev/null; then
        print_success "File exists in upload bucket"
        aws s3 ls "s3://$upload_bucket/audio/$filename" --human-readable
    else
        print_error "File NOT found in upload bucket"
        print_info "Listing all files in audio/ folder:"
        aws s3 ls "s3://$upload_bucket/audio/" --human-readable
    fi
    
    # Check 2: Media bucket
    print_section "2. Checking Media Bucket"
    print_info "Searching for files matching: $filename"
    local media_files=$(aws s3 ls "s3://$media_bucket/audio/" --recursive | grep "$filename" || echo "")
    if [ -n "$media_files" ]; then
        print_success "File(s) found in media bucket:"
        echo "$media_files"
    else
        print_error "File NOT found in media bucket"
        print_info "This means Lambda processing may have failed"
    fi
    
    # Check 3: DynamoDB
    print_section "3. Checking DynamoDB"
    print_info "Searching for track with filename: $filename"
    
    local db_result=$(aws dynamodb scan \
        --table-name "$table_name" \
        --filter-expression "filename = :fn" \
        --expression-attribute-values "{\":fn\":{\"S\":\"$filename\"}}" \
        --output json 2>/dev/null || echo '{"Items":[]}')
    
    local count=$(echo "$db_result" | jq '.Items | length')
    
    if [ "$count" -gt 0 ]; then
        print_success "Found $count record(s) in DynamoDB"
        echo ""
        echo "$db_result" | jq -r '.Items[] | 
            "Track ID: \(.id.S)\n" +
            "Title: \(.title.S)\n" +
            "Status: \(.status.S)\n" +
            "Created: \(.createdDate.S)\n" +
            "Duration: \(.duration.N)s\n" +
            "File Size: \(.fileSize.N) bytes\n" +
            if .errorMessage then "Error: \(.errorMessage.S)\n" else "" end'
    else
        print_error "NO records found in DynamoDB"
        print_info "Lambda may have failed to write to DynamoDB"
    fi
    
    # Check 4: Lambda logs
    print_section "4. Checking Lambda Logs (last 10 minutes)"
    print_info "Lambda function: $lambda_name"
    
    local log_group="/aws/lambda/$lambda_name"
    
    # Check if log group exists
    if ! aws logs describe-log-groups --log-group-name-prefix "$log_group" &> /dev/null; then
        print_error "Log group not found - Lambda may not have been invoked"
    else
        print_success "Log group exists"
        
        # Get recent logs mentioning the filename
        print_info "Searching for logs mentioning: $filename"
        echo ""
        
        local logs=$(aws logs filter-log-events \
            --log-group-name "$log_group" \
            --start-time $(($(date +%s) * 1000 - 600000)) \
            --filter-pattern "$filename" \
            --output json 2>/dev/null || echo '{"events":[]}')
        
        local event_count=$(echo "$logs" | jq '.events | length')
        
        if [ "$event_count" -gt 0 ]; then
            print_success "Found $event_count log event(s)"
            echo ""
            echo "$logs" | jq -r '.events[] | "[\(.timestamp | todate)] \(.message)"' | tail -20
        else
            print_error "No log events found for this filename"
            print_info "Showing last 10 log events from Lambda:"
            echo ""
            aws logs tail "$log_group" --since 10m --format short | tail -20
        fi
    fi
    
    # Check 5: Lambda permissions
    print_section "5. Checking Lambda Permissions"
    
    # Check if Lambda has DynamoDB permissions
    local lambda_role=$(aws lambda get-function --function-name "$lambda_name" --query 'Configuration.Role' --output text 2>/dev/null || echo "")
    
    if [ -n "$lambda_role" ]; then
        print_success "Lambda role: $lambda_role"
        
        local role_name=$(echo "$lambda_role" | awk -F'/' '{print $NF}')
        print_info "Checking attached policies..."
        
        aws iam list-attached-role-policies --role-name "$role_name" --output table 2>/dev/null || print_error "Could not list policies"
    else
        print_error "Could not retrieve Lambda role"
    fi
    
    # Summary
    print_section "Summary & Recommendations"
    
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}✓ SUCCESS: Track is in DynamoDB${NC}"
        echo ""
        echo "Your track was processed successfully!"
    elif [ -n "$media_files" ]; then
        echo -e "${YELLOW}⚠ PARTIAL: File in media bucket but not in DynamoDB${NC}"
        echo ""
        echo "Possible issues:"
        echo "  1. Lambda doesn't have DynamoDB write permissions"
        echo "  2. DynamoDB table name is incorrect"
        echo "  3. Lambda encountered an error after copying to S3"
        echo ""
        echo "Check Lambda logs above for error messages"
    else
        echo -e "${RED}✗ FAILED: File not processed${NC}"
        echo ""
        echo "Possible issues:"
        echo "  1. Lambda was not triggered by S3 event"
        echo "  2. Lambda failed during processing"
        echo "  3. File validation failed"
        echo ""
        echo "Next steps:"
        echo "  1. Check Lambda logs above for errors"
        echo "  2. Verify S3 event notification is configured"
        echo "  3. Check Lambda has permissions to read from upload bucket"
    fi
    
    echo ""
}

main "$@"
