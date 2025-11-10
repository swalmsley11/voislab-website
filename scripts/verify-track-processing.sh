#!/bin/bash

###############################################################################
# VoisLab Track Processing Verification Script
#
# Verifies that uploaded audio files were successfully processed
#
# Usage:
#   ./scripts/verify-track-processing.sh <filename> [environment]
#   ./scripts/verify-track-processing.sh track.mp3 dev
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       VoisLab Track Processing Verification               ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_prerequisites() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured"
        exit 1
    fi
}

get_bucket_name() {
    local env=$1
    local type=$2
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    echo "voislab-${type}-${env}-${account_id}"
}

check_upload_bucket() {
    local filename=$1
    local bucket=$2
    
    print_info "Checking upload bucket..."
    
    if aws s3 ls "s3://$bucket/audio/$filename" &> /dev/null; then
        print_success "File found in upload bucket"
        
        # Get file details
        local size=$(aws s3 ls "s3://$bucket/audio/$filename" | awk '{print $3}')
        local size_mb=$((size / 1024 / 1024))
        print_info "File size: ${size_mb}MB"
        
        return 0
    else
        print_error "File not found in upload bucket"
        return 1
    fi
}

check_media_bucket() {
    local filename=$1
    local bucket=$2
    
    print_info "Checking media bucket..."
    
    # List all files in media bucket matching filename
    local files=$(aws s3 ls "s3://$bucket/audio/" --recursive | grep "$filename" || true)
    
    if [ -n "$files" ]; then
        print_success "File found in media bucket"
        
        # Show all matching files
        echo "$files" | while read -r line; do
            local key=$(echo "$line" | awk '{print $4}')
            print_info "  $key"
        done
        
        return 0
    else
        print_error "File not found in media bucket"
        print_info "Processing may still be in progress"
        return 1
    fi
}

check_dynamodb() {
    local filename=$1
    local table=$2
    
    print_info "Checking DynamoDB table..."
    
    # Query DynamoDB for track
    local result=$(aws dynamodb scan \
        --table-name "$table" \
        --filter-expression "filename = :fn" \
        --expression-attribute-values "{\":fn\":{\"S\":\"$filename\"}}" \
        --output json 2>/dev/null || echo '{"Items":[]}')
    
    local count=$(echo "$result" | jq '.Items | length')
    
    if [ "$count" -gt 0 ]; then
        print_success "Track found in database ($count record(s))"
        
        # Extract and display track details
        echo "$result" | jq -r '.Items[] | 
            "  Track ID: \(.id.S)\n" +
            "  Title: \(.title.S)\n" +
            "  Status: \(.status.S)\n" +
            "  Created: \(.createdDate.S)\n" +
            if .duration then "  Duration: \(.duration.N)s\n" else "" end +
            if .genre then "  Genre: \(.genre.S)\n" else "" end'
        
        # Check status
        local status=$(echo "$result" | jq -r '.Items[0].status.S')
        
        if [ "$status" = "processed" ] || [ "$status" = "enhanced" ]; then
            print_success "Processing status: $status"
        elif [ "$status" = "failed" ]; then
            print_error "Processing status: $status"
            
            # Try to get error message
            local error=$(echo "$result" | jq -r '.Items[0].errorMessage.S // empty')
            if [ -n "$error" ]; then
                print_error "Error: $error"
            fi
            return 1
        else
            print_warning "Processing status: $status"
        fi
        
        return 0
    else
        print_error "Track not found in database"
        print_info "Processing may still be in progress"
        return 1
    fi
}

check_lambda_logs() {
    local filename=$1
    local env=$2
    
    print_info "Checking Lambda processing logs..."
    
    local log_group="/aws/lambda/voislab-audio-processor-${env}"
    
    # Check if log group exists
    if ! aws logs describe-log-groups --log-group-name-prefix "$log_group" &> /dev/null; then
        print_warning "Log group not found (Lambda may not have been invoked yet)"
        return 1
    fi
    
    # Get recent log events mentioning the filename
    local logs=$(aws logs filter-log-events \
        --log-group-name "$log_group" \
        --start-time $(($(date +%s) * 1000 - 3600000)) \
        --filter-pattern "$filename" \
        --max-items 10 \
        --output json 2>/dev/null || echo '{"events":[]}')
    
    local event_count=$(echo "$logs" | jq '.events | length')
    
    if [ "$event_count" -gt 0 ]; then
        print_success "Found $event_count log event(s)"
        
        # Show recent log messages
        echo "$logs" | jq -r '.events[] | "  [\(.timestamp | todate)] \(.message)"' | head -5
        
        # Check for errors
        if echo "$logs" | jq -r '.events[].message' | grep -qi "error\|failed"; then
            print_warning "Errors detected in logs"
        fi
        
        return 0
    else
        print_warning "No log events found for this file"
        print_info "Lambda may not have processed this file yet"
        return 1
    fi
}

show_summary() {
    local upload_ok=$1
    local media_ok=$2
    local db_ok=$3
    local logs_ok=$4
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "Verification Summary"
    echo "═══════════════════════════════════════════════════════════"
    
    if [ $upload_ok -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Upload bucket: OK"
    else
        echo -e "${RED}✗${NC} Upload bucket: NOT FOUND"
    fi
    
    if [ $media_ok -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Media bucket: OK"
    else
        echo -e "${RED}✗${NC} Media bucket: NOT FOUND"
    fi
    
    if [ $db_ok -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Database: OK"
    else
        echo -e "${RED}✗${NC} Database: NOT FOUND"
    fi
    
    if [ $logs_ok -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Processing logs: OK"
    else
        echo -e "${YELLOW}⚠${NC} Processing logs: NO EVENTS"
    fi
    
    echo "═══════════════════════════════════════════════════════════"
    
    if [ $upload_ok -eq 0 ] && [ $media_ok -eq 0 ] && [ $db_ok -eq 0 ]; then
        echo -e "${GREEN}✓ Track successfully processed!${NC}"
        echo ""
        echo "Your track is live and ready to stream."
    elif [ $upload_ok -eq 0 ]; then
        echo -e "${YELLOW}⚠ Track uploaded but not yet processed${NC}"
        echo ""
        echo "Processing typically takes 5-30 seconds."
        echo "Wait a moment and run this script again."
        echo ""
        echo "To monitor processing:"
        echo "  aws logs tail /aws/lambda/voislab-audio-processor-${2} --follow"
    else
        echo -e "${RED}✗ Track not found${NC}"
        echo ""
        echo "Possible issues:"
        echo "  - File was not uploaded successfully"
        echo "  - Wrong filename or environment specified"
        echo "  - Backend infrastructure not deployed"
    fi
    echo ""
}

# Main script
main() {
    print_header
    
    # Parse arguments
    if [ $# -lt 1 ]; then
        echo "Usage: $0 <filename> [environment]"
        echo ""
        echo "Examples:"
        echo "  $0 track.mp3                    # Check in dev"
        echo "  $0 track.mp3 prod               # Check in prod"
        echo ""
        exit 1
    fi
    
    local filename=$1
    local environment=${2:-dev}
    
    # Validate environment
    if [ "$environment" != "dev" ] && [ "$environment" != "prod" ]; then
        print_error "Invalid environment: $environment (must be 'dev' or 'prod')"
        exit 1
    fi
    
    print_info "Verifying: $filename"
    print_info "Environment: $environment"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Get bucket names
    local upload_bucket=$(get_bucket_name "$environment" "upload")
    local media_bucket=$(get_bucket_name "$environment" "media")
    local table_name="voislab-audio-metadata-${environment}"
    
    # Run checks
    echo "Running verification checks..."
    echo "─────────────────────────────────────────────────────────────"
    echo ""
    
    check_upload_bucket "$filename" "$upload_bucket"
    local upload_result=$?
    echo ""
    
    check_media_bucket "$filename" "$media_bucket"
    local media_result=$?
    echo ""
    
    check_dynamodb "$filename" "$table_name"
    local db_result=$?
    echo ""
    
    check_lambda_logs "$filename" "$environment"
    local logs_result=$?
    echo ""
    
    # Show summary
    show_summary $upload_result $media_result $db_result $logs_result "$environment"
}

# Run main function
main "$@"
