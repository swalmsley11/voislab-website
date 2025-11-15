#!/usr/bin/env bash

###############################################################################
# VoisLab Metadata Verification and Troubleshooting Script
#
# Compares audio file metadata against DynamoDB entries to detect discrepancies
# and optionally correct them automatically.
#
# Usage:
#   ./scripts/verify-metadata.sh [environment] [options]
#   ./scripts/verify-metadata.sh dev                    # Report mode (default)
#   ./scripts/verify-metadata.sh prod --auto-correct    # Auto-correct mode
#   ./scripts/verify-metadata.sh dev --verbose          # Detailed output
#
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
TEMP_DIR="/tmp/voislab-metadata-verify-$$"
REPORT_FILE=""
BACKUP_FILE=""
AUTO_CORRECT=false
VERBOSE=false
PARALLEL_JOBS=4
SKIP_CONFIRMATION=false
FAST_MODE=false

# Statistics
TOTAL_FILES=0
VERIFIED_FILES=0
ERROR_COUNT=0
CORRECTED_COUNT=0
SKIPPED_COUNT=0
BACKUP_COUNT=0
START_TIME=0

# Error types (compatible with bash 3.2)
get_error_type_name() {
    case "$1" in
        "title_mismatch") echo "Title Mismatch" ;;
        "duration_mismatch") echo "Duration Mismatch" ;;
        "genre_mismatch") echo "Genre Mismatch" ;;
        "hash_mismatch") echo "File Hash Mismatch" ;;
        "missing_db_entry") echo "Missing Database Entry" ;;
        "missing_file") echo "Missing Audio File" ;;
        "metadata_incomplete") echo "Incomplete Metadata" ;;
        *) echo "Unknown Error" ;;
    esac
}

# Functions
print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     VoisLab Metadata Verification & Troubleshooting       ║${NC}"
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

print_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

print_progress() {
    echo -ne "${MAGENTA}⟳${NC} $1\r"
}

show_progress_bar() {
    local current=$1
    local total=$2
    local width=50
    
    # Calculate percentage
    local percent=$((current * 100 / total))
    local filled=$((width * current / total))
    local empty=$((width - filled))
    
    # Build progress bar
    local bar=""
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    for ((i=0; i<empty; i++)); do bar="${bar}░"; done
    
    # Calculate ETA
    local elapsed=$(($(date +%s) - START_TIME))
    local rate=0
    if [ $current -gt 0 ]; then
        rate=$((elapsed / current))
    fi
    local remaining=$((rate * (total - current)))
    
    # Format time
    local eta_str=""
    if [ $remaining -gt 0 ]; then
        local eta_min=$((remaining / 60))
        local eta_sec=$((remaining % 60))
        eta_str=$(printf "ETA: %dm%02ds" $eta_min $eta_sec)
    fi
    
    # Print progress bar
    printf "\r${CYAN}[${bar}]${NC} %3d%% (%d/%d) %s" $percent $current $total "$eta_str"
}

check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    print_debug "AWS CLI installed"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi
    print_debug "AWS credentials configured"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_error "jq not found. Please install it first (brew install jq)."
        exit 1
    fi
    print_debug "jq installed"
    
    # Check ffprobe (optional but recommended)
    if ! command -v ffprobe &> /dev/null; then
        print_warning "ffprobe not installed. Duration verification will use estimates."
        print_info "Install ffmpeg for accurate duration checks: brew install ffmpeg"
    else
        print_debug "ffprobe installed"
    fi
    
    print_success "Prerequisites check passed"
    echo ""
}

get_bucket_name() {
    local env=$1
    local type=$2
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    echo "voislab-${type}-${env}-${account_id}"
}

create_temp_dir() {
    mkdir -p "$TEMP_DIR"
    print_debug "Created temp directory: $TEMP_DIR"
}

cleanup_temp_dir() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
        print_debug "Cleaned up temp directory"
    fi
}

# Trap to ensure cleanup on exit
trap cleanup_temp_dir EXIT

get_all_db_tracks() {
    local table=$1
    local output_file="$TEMP_DIR/db_tracks.json"
    
    print_progress "Fetching all tracks from DynamoDB..."
    
    # Scan entire table
    aws dynamodb scan \
        --table-name "$table" \
        --output json > "$output_file" 2>/dev/null || echo '{"Items":[]}' > "$output_file"
    
    local count=$(jq '.Items | length' "$output_file" 2>/dev/null || echo "0")
    print_debug "Found $count tracks in DynamoDB"
    
    echo "$output_file"
}

get_all_s3_files() {
    local bucket=$1
    local output_file="$TEMP_DIR/s3_files.json"
    
    print_progress "Fetching all audio files from S3..."
    
    # List all files in audio/ prefix
    aws s3api list-objects-v2 \
        --bucket "$bucket" \
        --prefix "audio/" \
        --output json > "$output_file" 2>/dev/null || echo '{"Contents":[]}' > "$output_file"
    
    local count=$(jq '.Contents | length' "$output_file")
    print_debug "Found $count files in S3"
    
    echo "$output_file"
}

calculate_file_hash() {
    local bucket=$1
    local key=$2
    
    # Download file and calculate SHA-256 hash
    local temp_file="$TEMP_DIR/$(basename "$key")"
    
    if aws s3 cp "s3://$bucket/$key" "$temp_file" &> /dev/null; then
        local hash=$(shasum -a 256 "$temp_file" | awk '{print $1}')
        rm -f "$temp_file"
        echo "$hash"
    else
        echo ""
    fi
}

extract_audio_duration() {
    local bucket=$1
    local key=$2
    
    # Check if ffprobe is available
    if ! command -v ffprobe &> /dev/null; then
        echo "0"
        return
    fi
    
    # Download file temporarily
    local temp_file="$TEMP_DIR/$(basename "$key")"
    
    if aws s3 cp "s3://$bucket/$key" "$temp_file" &> /dev/null; then
        # Extract duration using ffprobe
        local duration=$(ffprobe -v error -show_entries format=duration \
            -of default=noprint_wrappers=1:nokey=1 "$temp_file" 2>/dev/null || echo "0")
        
        # Round to nearest integer
        duration=$(printf "%.0f" "$duration")
        
        rm -f "$temp_file"
        echo "$duration"
    else
        echo "0"
    fi
}

extract_title_from_filename() {
    local filename=$1
    
    # Remove extension
    local name_without_ext="${filename%.*}"
    
    # Replace underscores and hyphens with spaces
    local title=$(echo "$name_without_ext" | tr '_-' ' ' | sed 's/  */ /g')
    
    # Title case
    title=$(echo "$title" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')
    
    echo "$title"
}

verify_single_track() {
    local track_json=$1
    local media_bucket=$2
    local environment=$3
    local skip_heavy_checks=${4:-false}
    
    # Extract track information from DynamoDB
    local track_id=$(echo "$track_json" | jq -r '.id.S')
    local db_title=$(echo "$track_json" | jq -r '.title.S // empty')
    local db_duration=$(echo "$track_json" | jq -r '.duration.N // "0"')
    local db_genre=$(echo "$track_json" | jq -r '.genre.S // "unknown"')
    local db_filename=$(echo "$track_json" | jq -r '.filename.S // empty')
    local db_hash=$(echo "$track_json" | jq -r '.fileHash.S // empty')
    local db_status=$(echo "$track_json" | jq -r '.status.S // "unknown"')
    
    print_debug "Verifying track: $track_id ($db_filename)"
    
    # Skip failed tracks
    if [ "$db_status" = "failed" ]; then
        print_debug "Skipping failed track: $track_id"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        return 0
    fi
    
    # Find corresponding S3 file
    local s3_key=""
    local s3_size=0
    
    # Search for file in S3 (could be in audio/<track_id>/ structure)
    if [ -n "$db_filename" ]; then
        # Try to find file by filename pattern (cached in temp file for performance)
        local cache_file="$TEMP_DIR/s3_keys_cache.txt"
        
        if [ ! -f "$cache_file" ]; then
            # Build cache of all S3 keys
            aws s3api list-objects-v2 \
                --bucket "$media_bucket" \
                --prefix "audio/" \
                --query "Contents[].Key" \
                --output text 2>/dev/null | tr '\t' '\n' > "$cache_file"
        fi
        
        # Search in cache
        s3_key=$(grep "$db_filename" "$cache_file" | head -1 || echo "")
        
        if [ -z "$s3_key" ]; then
            # File not found in S3
            log_error "$track_id" "missing_file" "Audio file not found in S3: $db_filename"
            return 1
        fi
        
        # Get file size (only if needed)
        if [ "$skip_heavy_checks" = false ]; then
            s3_size=$(aws s3api head-object \
                --bucket "$media_bucket" \
                --key "$s3_key" \
                --query 'ContentLength' \
                --output text 2>/dev/null || echo "0")
        fi
    else
        log_error "$track_id" "metadata_incomplete" "Missing filename in database"
        return 1
    fi
    
    # Verify metadata fields
    local has_errors=false
    
    # 1. Verify title (lightweight check)
    if [ -n "$db_filename" ]; then
        local expected_title=$(extract_title_from_filename "$db_filename")
        
        if [ "$db_title" != "$expected_title" ]; then
            log_error "$track_id" "title_mismatch" \
                "Title mismatch: DB='$db_title' Expected='$expected_title' File='$db_filename'"
            has_errors=true
            
            # Auto-correct if enabled
            if [ "$AUTO_CORRECT" = true ]; then
                correct_metadata "$track_id" "title" "$expected_title" "$environment"
            fi
        fi
    fi
    
    # 2. Verify duration (skip if heavy checks disabled or ffprobe not available)
    if [ "$skip_heavy_checks" = false ] && command -v ffprobe &> /dev/null && [ -n "$s3_key" ]; then
        local actual_duration=$(extract_audio_duration "$media_bucket" "$s3_key")
        
        if [ "$actual_duration" != "0" ]; then
            # Allow 2 second tolerance
            local diff=$((db_duration - actual_duration))
            diff=${diff#-}  # Absolute value
            
            if [ "$diff" -gt 2 ]; then
                log_error "$track_id" "duration_mismatch" \
                    "Duration mismatch: DB=${db_duration}s Actual=${actual_duration}s File='$db_filename'"
                has_errors=true
                
                # Auto-correct if enabled
                if [ "$AUTO_CORRECT" = true ]; then
                    correct_metadata "$track_id" "duration" "$actual_duration" "$environment"
                fi
            fi
        fi
    fi
    
    # 3. Verify file hash (skip if heavy checks disabled)
    if [ "$skip_heavy_checks" = false ] && [ -n "$db_hash" ] && [ "$db_hash" != "null" ] && [ -n "$s3_key" ]; then
        print_debug "Calculating file hash for $db_filename..."
        local actual_hash=$(calculate_file_hash "$media_bucket" "$s3_key")
        
        if [ -n "$actual_hash" ] && [ "$actual_hash" != "$db_hash" ]; then
            log_error "$track_id" "hash_mismatch" \
                "File hash mismatch: DB='$db_hash' Actual='$actual_hash' File='$db_filename'"
            has_errors=true
            
            # Auto-correct if enabled
            if [ "$AUTO_CORRECT" = true ]; then
                correct_metadata "$track_id" "fileHash" "$actual_hash" "$environment"
            fi
        fi
    fi
    
    # 4. Verify genre is set (lightweight check)
    if [ "$db_genre" = "unknown" ] || [ -z "$db_genre" ]; then
        log_error "$track_id" "metadata_incomplete" \
            "Genre not set for track: $db_filename"
        has_errors=true
    fi
    
    if [ "$has_errors" = false ]; then
        VERIFIED_FILES=$((VERIFIED_FILES + 1))
        print_debug "Track verified successfully: $track_id"
    fi
    
    return 0
}

log_error() {
    local track_id=$1
    local error_type=$2
    local message=$3
    
    ERROR_COUNT=$((ERROR_COUNT + 1))
    
    # Write to report file
    echo "[$error_type] Track: $track_id - $message" >> "$REPORT_FILE"
    
    if [ "$VERBOSE" = true ]; then
        print_error "$message"
    fi
}

backup_track_metadata() {
    local track_id=$1
    local environment=$2
    
    local table_name="voislab-audio-metadata-${environment}"
    
    # Get current track data
    local track_data=$(aws dynamodb get-item \
        --table-name "$table_name" \
        --key "{\"id\":{\"S\":\"$track_id\"}}" \
        --output json 2>/dev/null)
    
    if [ -n "$track_data" ] && [ "$track_data" != "null" ]; then
        # Append to backup file
        echo "$track_data" >> "$BACKUP_FILE"
        BACKUP_COUNT=$((BACKUP_COUNT + 1))
        print_debug "Backed up metadata for track $track_id"
        return 0
    else
        print_warning "Could not backup track $track_id"
        return 1
    fi
}

restore_from_backup() {
    local backup_file=$1
    local environment=$2
    
    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        return 1
    fi
    
    local table_name="voislab-audio-metadata-${environment}"
    local restored=0
    local failed=0
    
    print_info "Restoring metadata from backup..."
    
    # Read each line (each is a complete track JSON)
    while IFS= read -r track_data; do
        if [ -n "$track_data" ]; then
            # Extract the Item from the GetItem response
            local item=$(echo "$track_data" | jq -c '.Item')
            
            if [ -n "$item" ] && [ "$item" != "null" ]; then
                # Put item back into DynamoDB
                if aws dynamodb put-item \
                    --table-name "$table_name" \
                    --item "$item" \
                    &> /dev/null; then
                    restored=$((restored + 1))
                else
                    failed=$((failed + 1))
                fi
            fi
        fi
    done < "$backup_file"
    
    print_success "Restored $restored tracks from backup"
    
    if [ $failed -gt 0 ]; then
        print_warning "Failed to restore $failed tracks"
        return 1
    fi
    
    return 0
}

correct_metadata() {
    local track_id=$1
    local field=$2
    local new_value=$3
    local environment=$4
    
    local table_name="voislab-audio-metadata-${environment}"
    
    print_info "Auto-correcting $field for track $track_id..."
    
    # Backup before correction
    backup_track_metadata "$track_id" "$environment"
    
    # Get the createdDate (sort key) for the track
    local created_date=$(aws dynamodb get-item \
        --table-name "$table_name" \
        --key "{\"id\":{\"S\":\"$track_id\"}}" \
        --query 'Item.createdDate.S' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$created_date" ] || [ "$created_date" = "None" ]; then
        print_error "Could not find createdDate for track $track_id"
        return 1
    fi
    
    # Determine attribute type based on field
    local attr_type="S"
    if [ "$field" = "duration" ]; then
        attr_type="N"
    fi
    
    # Update DynamoDB
    if aws dynamodb update-item \
        --table-name "$table_name" \
        --key "{\"id\":{\"S\":\"$track_id\"},\"createdDate\":{\"S\":\"$created_date\"}}" \
        --update-expression "SET #field = :value" \
        --expression-attribute-names "{\"#field\":\"$field\"}" \
        --expression-attribute-values "{\":value\":{\"$attr_type\":\"$new_value\"}}" \
        &> /dev/null; then
        
        print_success "Corrected $field to '$new_value'"
        CORRECTED_COUNT=$((CORRECTED_COUNT + 1))
        return 0
    else
        print_error "Failed to correct $field for track $track_id"
        return 1
    fi
}

confirm_corrections() {
    local error_count=$1
    
    if [ "$SKIP_CONFIRMATION" = true ]; then
        return 0
    fi
    
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}WARNING: Auto-Correction Mode${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "This will automatically correct $error_count detected metadata error(s)."
    echo ""
    echo "A backup will be created before making any changes."
    echo "Backup location: $BACKUP_FILE"
    echo ""
    echo -e "${YELLOW}Do you want to proceed with automatic corrections?${NC}"
    echo ""
    read -p "Type 'yes' to continue, or anything else to cancel: " response
    echo ""
    
    if [ "$response" = "yes" ] || [ "$response" = "YES" ]; then
        print_success "Proceeding with automatic corrections..."
        return 0
    else
        print_info "Cancelled by user"
        return 1
    fi
}

verify_all_tracks() {
    local environment=$1
    local media_bucket=$2
    local table_name=$3
    
    print_info "Starting metadata verification..."
    echo ""
    
    # Get all tracks from DynamoDB
    local db_file=$(get_all_db_tracks "$table_name")
    
    # Extract tracks array
    local tracks=$(jq -c '.Items[]' "$db_file")
    
    # Count total tracks
    TOTAL_FILES=$(echo "$tracks" | wc -l | tr -d ' ')
    
    if [ "$TOTAL_FILES" -eq 0 ]; then
        print_warning "No tracks found in database"
        return 0
    fi
    
    print_info "Verifying $TOTAL_FILES tracks..."
    echo ""
    
    # If auto-correct mode, do a dry run first to count errors
    if [ "$AUTO_CORRECT" = true ]; then
        print_info "Running pre-check to identify errors (fast mode)..."
        
        local temp_auto_correct=$AUTO_CORRECT
        AUTO_CORRECT=false
        
        # Process tracks in report-only mode with lightweight checks
        local current=0
        START_TIME=$(date +%s)
        
        while IFS= read -r track; do
            current=$((current + 1))
            show_progress_bar $current $TOTAL_FILES
            
            # Skip heavy checks (duration, hash) in pre-check for speed
            verify_single_track "$track" "$media_bucket" "$environment" true
        done <<< "$tracks"
        
        echo ""  # Clear progress line
        
        # Restore auto-correct mode
        AUTO_CORRECT=$temp_auto_correct
        
        # Ask for confirmation if errors found
        if [ "$ERROR_COUNT" -gt 0 ]; then
            if ! confirm_corrections "$ERROR_COUNT"; then
                print_info "Exiting without making corrections"
                exit 0
            fi
            
            # Reset counters for actual correction run
            ERROR_COUNT=0
            VERIFIED_FILES=0
            CORRECTED_COUNT=0
            
            # Clear report file
            > "$REPORT_FILE"
        else
            print_success "No errors found, nothing to correct"
            return 0
        fi
    fi
    
    # Process tracks (either report-only or with corrections)
    local current=0
    START_TIME=$(date +%s)
    
    # Determine if we should skip heavy checks
    local skip_heavy=$FAST_MODE
    
    while IFS= read -r track; do
        current=$((current + 1))
        
        # Show progress bar
        show_progress_bar $current $TOTAL_FILES
        
        verify_single_track "$track" "$media_bucket" "$environment" "$skip_heavy"
    done <<< "$tracks"
    
    echo ""  # Clear progress line
}

generate_report() {
    local environment=$1
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}           Metadata Verification Report${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Environment:        $environment"
    echo "Timestamp:          $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Mode:               $([ "$AUTO_CORRECT" = true ] && echo "Auto-Correct" || echo "Report Only")"
    
    if [ "$FAST_MODE" = true ]; then
        echo "Fast mode:          Enabled"
    fi
    
    echo ""
    echo "─────────────────────────────────────────────────────────────"
    echo "Statistics:"
    echo "─────────────────────────────────────────────────────────────"
    echo "Total tracks:       $TOTAL_FILES"
    echo "Verified OK:        $VERIFIED_FILES"
    echo "Errors detected:    $ERROR_COUNT"
    echo "Skipped:            $SKIPPED_COUNT"
    
    if [ "$AUTO_CORRECT" = true ]; then
        echo "Corrections made:   $CORRECTED_COUNT"
        echo "Backups created:    $BACKUP_COUNT"
    fi
    
    echo ""
    
    # Calculate success rate
    if [ "$TOTAL_FILES" -gt 0 ]; then
        local success_rate=$(( (VERIFIED_FILES * 100) / TOTAL_FILES ))
        echo "Success rate:       ${success_rate}%"
    fi
    
    echo ""
    
    # Show backup information
    if [ "$AUTO_CORRECT" = true ] && [ "$BACKUP_COUNT" -gt 0 ]; then
        echo "─────────────────────────────────────────────────────────────"
        echo "Backup Information:"
        echo "─────────────────────────────────────────────────────────────"
        echo "Backup file:        $BACKUP_FILE"
        echo "Backed up tracks:   $BACKUP_COUNT"
        echo ""
        echo "To restore from backup:"
        echo "  Use the restore_from_backup function in this script"
        echo "  Or manually restore using AWS CLI"
        echo ""
    fi
    
    # Show error breakdown
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "─────────────────────────────────────────────────────────────"
        echo "Error Breakdown:"
        echo "─────────────────────────────────────────────────────────────"
        
        # Count errors by type
        local error_types="title_mismatch duration_mismatch genre_mismatch hash_mismatch missing_db_entry missing_file metadata_incomplete"
        for error_type in $error_types; do
            local count=$(grep -c "\[$error_type\]" "$REPORT_FILE" 2>/dev/null || echo "0")
            if [ "$count" -gt 0 ]; then
                local error_name=$(get_error_type_name "$error_type")
                echo "  $error_name: $count"
            fi
        done
        
        echo ""
        echo "Detailed errors saved to: $REPORT_FILE"
        echo ""
        
        if [ "$AUTO_CORRECT" = false ]; then
            echo -e "${YELLOW}Tip: Run with --auto-correct to fix detected issues${NC}"
        fi
    else
        echo -e "${GREEN}✓ All tracks verified successfully!${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

show_usage() {
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Arguments:"
    echo "  environment          Environment to verify (dev or prod, default: dev)"
    echo ""
    echo "Options:"
    echo "  --auto-correct       Automatically correct detected metadata errors"
    echo "  --yes                Skip confirmation prompt (use with --auto-correct)"
    echo "  --fast               Skip heavy checks (duration, hash) for faster execution"
    echo "  --verbose            Show detailed output during verification"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Verify dev environment (report only)"
    echo "  $0 prod                               # Verify prod environment"
    echo "  $0 dev --fast                         # Fast verification (lightweight checks)"
    echo "  $0 dev --auto-correct                 # Verify and auto-correct dev (with prompt)"
    echo "  $0 dev --auto-correct --yes           # Auto-correct without confirmation"
    echo "  $0 prod --verbose                     # Verify prod with detailed output"
    echo "  $0 dev --auto-correct --fast --yes    # Fast auto-correction"
    echo ""
    echo "Performance:"
    echo "  - Fast mode: ~30 seconds for 100 tracks (title, genre checks only)"
    echo "  - Full mode: ~5 minutes for 100 tracks (includes duration, hash verification)"
    echo "  - Progress bar with ETA displayed during execution"
    echo ""
    echo "Safety Features:"
    echo "  - Automatic backup before corrections"
    echo "  - Confirmation prompt for batch corrections (unless --yes)"
    echo "  - Detailed error reporting"
    echo "  - Rollback capability via backup file"
    echo ""
}

# Main script
main() {
    # Parse arguments
    local environment="dev"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            dev|prod)
                environment=$1
                shift
                ;;
            --auto-correct)
                AUTO_CORRECT=true
                shift
                ;;
            --yes|-y)
                SKIP_CONFIRMATION=true
                shift
                ;;
            --fast)
                FAST_MODE=true
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    print_header
    
    # Validate environment
    if [ "$environment" != "dev" ] && [ "$environment" != "prod" ]; then
        print_error "Invalid environment: $environment (must be 'dev' or 'prod')"
        exit 1
    fi
    
    print_info "Environment: $environment"
    print_info "Mode: $([ "$AUTO_CORRECT" = true ] && echo "Auto-Correct" || echo "Report Only")"
    
    if [ "$FAST_MODE" = true ]; then
        print_info "Fast mode: Enabled (skipping duration and hash checks)"
    fi
    
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Create temp directory
    create_temp_dir
    
    # Create report file
    REPORT_FILE="$TEMP_DIR/metadata-errors-$(date +%Y%m%d-%H%M%S).txt"
    touch "$REPORT_FILE"
    
    # Create backup file if auto-correct mode
    if [ "$AUTO_CORRECT" = true ]; then
        BACKUP_FILE="$TEMP_DIR/metadata-backup-$(date +%Y%m%d-%H%M%S).json"
        touch "$BACKUP_FILE"
        print_debug "Backup file created: $BACKUP_FILE"
    fi
    
    # Get AWS resource names
    local media_bucket=$(get_bucket_name "$environment" "media")
    local table_name="voislab-audio-metadata-${environment}"
    
    print_info "Media bucket: $media_bucket"
    print_info "DynamoDB table: $table_name"
    echo ""
    
    # Verify bucket exists
    if ! aws s3 ls "s3://$media_bucket" &> /dev/null; then
        print_error "Media bucket not found: $media_bucket"
        print_info "Make sure backend infrastructure is deployed."
        exit 1
    fi
    
    # Verify table exists
    if ! aws dynamodb describe-table --table-name "$table_name" &> /dev/null; then
        print_error "DynamoDB table not found: $table_name"
        print_info "Make sure backend infrastructure is deployed."
        exit 1
    fi
    
    # Record start time
    local start_time=$(date +%s)
    
    # Run verification
    verify_all_tracks "$environment" "$media_bucket" "$table_name"
    
    # Calculate elapsed time
    local end_time=$(date +%s)
    local elapsed=$((end_time - start_time))
    
    # Generate report
    generate_report "$environment"
    
    print_info "Verification completed in ${elapsed} seconds"
    
    # Copy report to permanent location if errors found
    if [ "$ERROR_COUNT" -gt 0 ]; then
        local perm_report="./metadata-verification-report-$(date +%Y%m%d-%H%M%S).txt"
        cp "$REPORT_FILE" "$perm_report"
        print_info "Detailed report saved to: $perm_report"
    fi
    
    # Copy backup to permanent location if corrections were made
    if [ "$AUTO_CORRECT" = true ] && [ "$BACKUP_COUNT" -gt 0 ]; then
        local perm_backup="./metadata-backup-$(date +%Y%m%d-%H%M%S).json"
        cp "$BACKUP_FILE" "$perm_backup"
        print_info "Backup saved to: $perm_backup"
        echo ""
        print_warning "IMPORTANT: Keep this backup file to restore if needed"
        print_info "To restore: Manually use AWS CLI or contact support"
    fi
    
    # Exit with error code if errors found and not auto-corrected
    if [ "$ERROR_COUNT" -gt 0 ] && [ "$AUTO_CORRECT" = false ]; then
        exit 1
    fi
    
    exit 0
}

# Run main function
main "$@"
