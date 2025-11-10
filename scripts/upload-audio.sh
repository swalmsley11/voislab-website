#!/bin/bash

###############################################################################
# VoisLab Audio Upload Script
#
# Uploads audio files to S3 with validation and progress tracking
#
# Usage:
#   ./scripts/upload-audio.sh <file> [environment]
#   ./scripts/upload-audio.sh track.mp3 dev
#   ./scripts/upload-audio.sh ./tracks/ prod --batch
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SUPPORTED_FORMATS=("mp3" "wav" "flac" "m4a" "aac" "ogg")
MAX_FILE_SIZE=$((100 * 1024 * 1024))  # 100MB
MIN_FILE_SIZE=1024  # 1KB

# Functions
print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          VoisLab Audio Upload Tool                        ║${NC}"
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
    print_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    print_success "AWS CLI installed"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi
    print_success "AWS credentials configured"
    
    # Check jq (optional but helpful)
    if ! command -v jq &> /dev/null; then
        print_warning "jq not installed (optional). Install for better JSON parsing."
    fi
    
    echo ""
}

get_bucket_name() {
    local env=$1
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    echo "voislab-upload-${env}-${account_id}"
}

validate_file() {
    local file=$1
    
    # Check if file exists
    if [ ! -f "$file" ]; then
        print_error "File not found: $file"
        return 1
    fi
    
    # Get file extension
    local extension="${file##*.}"
    extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
    
    # Check if format is supported
    if [[ ! " ${SUPPORTED_FORMATS[@]} " =~ " ${extension} " ]]; then
        print_error "Unsupported format: .$extension"
        print_info "Supported formats: ${SUPPORTED_FORMATS[*]}"
        return 1
    fi
    
    # Check file size
    local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    
    if [ "$file_size" -lt "$MIN_FILE_SIZE" ]; then
        print_error "File too small: $file_size bytes (minimum: $MIN_FILE_SIZE bytes)"
        return 1
    fi
    
    if [ "$file_size" -gt "$MAX_FILE_SIZE" ]; then
        local size_mb=$((file_size / 1024 / 1024))
        print_error "File too large: ${size_mb}MB (maximum: 100MB)"
        return 1
    fi
    
    # Calculate and display file size
    local size_mb=$((file_size / 1024 / 1024))
    if [ "$size_mb" -gt 0 ]; then
        print_success "File size: ${size_mb}MB"
    else
        local size_kb=$((file_size / 1024))
        print_success "File size: ${size_kb}KB"
    fi
    
    return 0
}

upload_file() {
    local file=$1
    local bucket=$2
    local filename=$(basename "$file")
    
    print_info "Uploading: $filename"
    print_info "Destination: s3://$bucket/audio/$filename"
    
    # Upload with progress
    if aws s3 cp "$file" "s3://$bucket/audio/$filename" \
        --no-progress 2>&1 | grep -q "upload:"; then
        print_success "Upload completed: $filename"
        return 0
    else
        print_error "Upload failed: $filename"
        return 1
    fi
}

verify_upload() {
    local filename=$1
    local bucket=$2
    
    print_info "Verifying upload..."
    
    if aws s3 ls "s3://$bucket/audio/$filename" &> /dev/null; then
        print_success "File verified in S3"
        return 0
    else
        print_error "File not found in S3 after upload"
        return 1
    fi
}

wait_for_processing() {
    local filename=$1
    local env=$2
    local max_wait=30  # seconds
    local waited=0
    
    print_info "Waiting for Lambda processing (max ${max_wait}s)..."
    
    while [ $waited -lt $max_wait ]; do
        sleep 2
        waited=$((waited + 2))
        
        # Check if track appears in DynamoDB
        local table_name="voislab-audio-metadata-${env}"
        local result=$(aws dynamodb scan \
            --table-name "$table_name" \
            --filter-expression "filename = :fn" \
            --expression-attribute-values "{\":fn\":{\"S\":\"$filename\"}}" \
            --limit 1 \
            --query 'Count' \
            --output text 2>/dev/null || echo "0")
        
        if [ "$result" != "0" ]; then
            print_success "Track processed and added to database"
            return 0
        fi
        
        echo -n "."
    done
    
    echo ""
    print_warning "Processing taking longer than expected. Check CloudWatch logs."
    print_info "Track may still be processing in the background."
    return 1
}

show_next_steps() {
    local env=$1
    local filename=$2
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Upload Successful!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Check processing logs:"
    echo "   aws logs tail /aws/lambda/voislab-audio-processor-${env} --follow"
    echo ""
    echo "2. Verify in DynamoDB:"
    echo "   aws dynamodb scan --table-name voislab-audio-metadata-${env} --limit 5"
    echo ""
    echo "3. Check website:"
    if [ "$env" = "prod" ]; then
        echo "   https://voislab.com"
    else
        echo "   https://dev.voislab.com"
    fi
    echo ""
    echo "4. Run integration tests:"
    echo "   Open browser console and run: testVoisLabComplete()"
    echo ""
}

batch_upload() {
    local directory=$1
    local bucket=$2
    local env=$3
    
    print_info "Batch upload from: $directory"
    
    local total=0
    local successful=0
    local failed=0
    
    # Find all audio files
    for ext in "${SUPPORTED_FORMATS[@]}"; do
        while IFS= read -r -d '' file; do
            total=$((total + 1))
            echo ""
            echo "─────────────────────────────────────────────────────────────"
            echo "Processing file $total: $(basename "$file")"
            echo "─────────────────────────────────────────────────────────────"
            
            if validate_file "$file"; then
                if upload_file "$file" "$bucket"; then
                    successful=$((successful + 1))
                else
                    failed=$((failed + 1))
                fi
            else
                failed=$((failed + 1))
            fi
        done < <(find "$directory" -type f -iname "*.${ext}" -print0)
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "Batch Upload Summary"
    echo "═══════════════════════════════════════════════════════════"
    echo "Total files:      $total"
    echo "Successful:       $successful"
    echo "Failed:           $failed"
    echo "═══════════════════════════════════════════════════════════"
    
    if [ $failed -gt 0 ]; then
        return 1
    fi
    return 0
}

# Main script
main() {
    print_header
    
    # Parse arguments
    if [ $# -lt 1 ]; then
        echo "Usage: $0 <file|directory> [environment] [--batch]"
        echo ""
        echo "Examples:"
        echo "  $0 track.mp3                    # Upload to dev"
        echo "  $0 track.mp3 prod               # Upload to prod"
        echo "  $0 ./tracks/ dev --batch        # Batch upload to dev"
        echo ""
        exit 1
    fi
    
    local input=$1
    local environment=${2:-dev}
    local batch_mode=false
    
    # Check for batch flag
    if [ "$3" = "--batch" ] || [ "$2" = "--batch" ]; then
        batch_mode=true
        if [ "$2" = "--batch" ]; then
            environment="dev"
        fi
    fi
    
    # Validate environment
    if [ "$environment" != "dev" ] && [ "$environment" != "prod" ]; then
        print_error "Invalid environment: $environment (must be 'dev' or 'prod')"
        exit 1
    fi
    
    print_info "Environment: $environment"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Get bucket name
    local bucket=$(get_bucket_name "$environment")
    print_info "Target bucket: $bucket"
    echo ""
    
    # Verify bucket exists
    if ! aws s3 ls "s3://$bucket" &> /dev/null; then
        print_error "Bucket not found: $bucket"
        print_info "Make sure backend infrastructure is deployed."
        exit 1
    fi
    print_success "Bucket verified"
    echo ""
    
    # Process upload
    if [ -d "$input" ]; then
        # Directory upload
        if [ "$batch_mode" = true ]; then
            batch_upload "$input" "$bucket" "$environment"
        else
            print_error "Directory specified but --batch flag not provided"
            print_info "Use --batch flag for directory uploads"
            exit 1
        fi
    elif [ -f "$input" ]; then
        # Single file upload
        if validate_file "$input"; then
            if upload_file "$input" "$bucket"; then
                local filename=$(basename "$input")
                if verify_upload "$filename" "$bucket"; then
                    wait_for_processing "$filename" "$environment"
                    show_next_steps "$environment" "$filename"
                fi
            else
                exit 1
            fi
        else
            exit 1
        fi
    else
        print_error "Input not found: $input"
        exit 1
    fi
}

# Run main function
main "$@"
