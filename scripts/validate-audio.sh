#!/bin/bash

###############################################################################
# VoisLab Audio Validation Script
#
# Validates audio files before upload to ensure they meet requirements
#
# Usage:
#   ./scripts/validate-audio.sh <file>
#   ./scripts/validate-audio.sh track.mp3
#   ./scripts/validate-audio.sh ./tracks/ --batch
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
RECOMMENDED_BITRATE=320  # kbps for MP3
RECOMMENDED_SAMPLE_RATE=44100  # Hz

# Functions
print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          VoisLab Audio Validation Tool                    ║${NC}"
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

format_size() {
    local size=$1
    if [ $size -ge 1048576 ]; then
        echo "$((size / 1048576))MB"
    elif [ $size -ge 1024 ]; then
        echo "$((size / 1024))KB"
    else
        echo "${size}B"
    fi
}

format_duration() {
    local seconds=$1
    local minutes=$((seconds / 60))
    local remaining_seconds=$((seconds % 60))
    printf "%d:%02d" $minutes $remaining_seconds
}

validate_file_basic() {
    local file=$1
    local errors=0
    local warnings=0
    
    echo "Validating: $(basename "$file")"
    echo "─────────────────────────────────────────────────────────────"
    
    # Check if file exists
    if [ ! -f "$file" ]; then
        print_error "File not found"
        return 1
    fi
    print_success "File exists"
    
    # Check file extension
    local extension="${file##*.}"
    extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
    
    if [[ ! " ${SUPPORTED_FORMATS[@]} " =~ " ${extension} " ]]; then
        print_error "Unsupported format: .$extension"
        print_info "Supported formats: ${SUPPORTED_FORMATS[*]}"
        errors=$((errors + 1))
    else
        print_success "Format supported: .$extension"
    fi
    
    # Check file size
    local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    local size_formatted=$(format_size $file_size)
    
    if [ "$file_size" -lt "$MIN_FILE_SIZE" ]; then
        print_error "File too small: $size_formatted (minimum: 1KB)"
        errors=$((errors + 1))
    elif [ "$file_size" -gt "$MAX_FILE_SIZE" ]; then
        print_error "File too large: $size_formatted (maximum: 100MB)"
        errors=$((errors + 1))
    else
        print_success "File size OK: $size_formatted"
    fi
    
    # Check filename
    local filename=$(basename "$file")
    if [[ "$filename" =~ [^a-zA-Z0-9._\ -] ]]; then
        print_warning "Filename contains special characters"
        print_info "Recommended: Use only letters, numbers, spaces, hyphens, and underscores"
        print_info "Special characters may cause issues with S3 and Lambda processing"
        warnings=$((warnings + 1))
    else
        print_success "Filename format OK"
    fi
    
    # Warn about spaces in filename
    if [[ "$filename" =~ \  ]]; then
        print_warning "Filename contains spaces"
        print_info "Spaces will be URL-encoded. Consider using hyphens or underscores instead"
        print_info "Example: 'Silicon-Horizon.wav' instead of 'Silicon Horizon.wav'"
        warnings=$((warnings + 1))
    fi
    
    # Check for common naming issues
    if [[ "$filename" =~ ^[0-9]+\. ]]; then
        print_warning "Filename starts with numbers"
        print_info "Consider adding artist/title prefix"
        warnings=$((warnings + 1))
    fi
    
    if [[ "$filename" =~ (copy|final|v[0-9]+|FINAL) ]]; then
        print_warning "Filename suggests work-in-progress"
        print_info "Consider using clean final filename"
        warnings=$((warnings + 1))
    fi
    
    echo ""
    
    if [ $errors -gt 0 ]; then
        return 1
    fi
    return 0
}

validate_file_advanced() {
    local file=$1
    
    # Check if ffprobe is available
    if ! command -v ffprobe &> /dev/null; then
        print_info "ffprobe not available - skipping advanced validation"
        print_info "Install ffmpeg for detailed audio analysis"
        return 0
    fi
    
    echo "Advanced Analysis:"
    echo "─────────────────────────────────────────────────────────────"
    
    # Get audio metadata using ffprobe
    local metadata=$(ffprobe -v quiet -print_format json -show_format -show_streams "$file" 2>/dev/null)
    
    if [ -z "$metadata" ]; then
        print_warning "Could not read audio metadata"
        return 0
    fi
    
    # Extract duration
    local duration=$(echo "$metadata" | jq -r '.format.duration // empty' 2>/dev/null)
    if [ -n "$duration" ]; then
        local duration_int=${duration%.*}
        local duration_formatted=$(format_duration $duration_int)
        print_success "Duration: $duration_formatted"
        
        if [ "$duration_int" -lt 10 ]; then
            print_warning "Track is very short (< 10 seconds)"
        fi
    fi
    
    # Extract bitrate
    local bitrate=$(echo "$metadata" | jq -r '.format.bit_rate // empty' 2>/dev/null)
    if [ -n "$bitrate" ]; then
        local bitrate_kbps=$((bitrate / 1000))
        print_success "Bitrate: ${bitrate_kbps}kbps"
        
        if [ "$bitrate_kbps" -lt 128 ]; then
            print_warning "Low bitrate (< 128kbps) - quality may be poor"
        elif [ "$bitrate_kbps" -ge 320 ]; then
            print_success "High quality bitrate"
        fi
    fi
    
    # Extract sample rate
    local sample_rate=$(echo "$metadata" | jq -r '.streams[0].sample_rate // empty' 2>/dev/null)
    if [ -n "$sample_rate" ]; then
        print_success "Sample rate: ${sample_rate}Hz"
        
        if [ "$sample_rate" -lt 44100 ]; then
            print_warning "Low sample rate (< 44.1kHz)"
        fi
    fi
    
    # Extract channels
    local channels=$(echo "$metadata" | jq -r '.streams[0].channels // empty' 2>/dev/null)
    if [ -n "$channels" ]; then
        if [ "$channels" = "1" ]; then
            print_success "Channels: Mono"
        elif [ "$channels" = "2" ]; then
            print_success "Channels: Stereo"
        else
            print_success "Channels: $channels"
        fi
    fi
    
    # Check for ID3 tags (MP3 only)
    local extension="${file##*.}"
    extension=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
    
    if [ "$extension" = "mp3" ]; then
        local title=$(echo "$metadata" | jq -r '.format.tags.title // empty' 2>/dev/null)
        local artist=$(echo "$metadata" | jq -r '.format.tags.artist // empty' 2>/dev/null)
        local album=$(echo "$metadata" | jq -r '.format.tags.album // empty' 2>/dev/null)
        local genre=$(echo "$metadata" | jq -r '.format.tags.genre // empty' 2>/dev/null)
        
        if [ -n "$title" ]; then
            print_success "ID3 Title: $title"
        else
            print_warning "No ID3 title tag"
        fi
        
        if [ -n "$artist" ]; then
            print_success "ID3 Artist: $artist"
        else
            print_warning "No ID3 artist tag"
        fi
        
        if [ -n "$genre" ]; then
            print_success "ID3 Genre: $genre"
        else
            print_warning "No ID3 genre tag"
        fi
    fi
    
    echo ""
    return 0
}

check_security() {
    local file=$1
    
    echo "Security Checks:"
    echo "─────────────────────────────────────────────────────────────"
    
    # Check file type
    if command -v file &> /dev/null; then
        local file_type=$(file -b "$file")
        
        if [[ "$file_type" =~ "Audio" ]] || [[ "$file_type" =~ "MPEG" ]] || [[ "$file_type" =~ "WAVE" ]]; then
            print_success "File type verified: Audio file"
        else
            print_warning "Unexpected file type: $file_type"
        fi
    fi
    
    # Check for suspicious content in first 1KB
    local first_kb=$(head -c 1024 "$file" 2>/dev/null)
    
    if echo "$first_kb" | grep -qi "script\|javascript\|<?php\|#!/bin"; then
        print_error "Suspicious content detected in file"
        return 1
    else
        print_success "No suspicious patterns detected"
    fi
    
    echo ""
    return 0
}

generate_report() {
    local total=$1
    local passed=$2
    local failed=$3
    local warnings=$4
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "Validation Report"
    echo "═══════════════════════════════════════════════════════════"
    echo "Total files:      $total"
    echo "Passed:           $passed"
    echo "Failed:           $failed"
    echo "Warnings:         $warnings"
    echo "═══════════════════════════════════════════════════════════"
    
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}All files passed validation!${NC}"
        echo ""
        echo "Ready to upload with:"
        echo "  ./scripts/upload-audio.sh <file> [environment]"
    else
        echo -e "${RED}Some files failed validation${NC}"
        echo ""
        echo "Fix issues before uploading"
    fi
    echo ""
}

batch_validate() {
    local directory=$1
    
    print_info "Batch validation from: $directory"
    echo ""
    
    local total=0
    local passed=0
    local failed=0
    local total_warnings=0
    
    # Find all audio files
    for ext in "${SUPPORTED_FORMATS[@]}"; do
        while IFS= read -r -d '' file; do
            total=$((total + 1))
            
            if validate_file_basic "$file"; then
                validate_file_advanced "$file"
                check_security "$file"
                passed=$((passed + 1))
            else
                failed=$((failed + 1))
            fi
            
            echo ""
        done < <(find "$directory" -type f -iname "*.${ext}" -print0)
    done
    
    generate_report $total $passed $failed $total_warnings
}

# Main script
main() {
    print_header
    
    # Parse arguments
    if [ $# -lt 1 ]; then
        echo "Usage: $0 <file|directory> [--batch]"
        echo ""
        echo "Examples:"
        echo "  $0 track.mp3                    # Validate single file"
        echo "  $0 ./tracks/ --batch            # Validate all files in directory"
        echo ""
        exit 1
    fi
    
    local input=$1
    local batch_mode=false
    
    # Check for batch flag
    if [ "$2" = "--batch" ]; then
        batch_mode=true
    fi
    
    # Process validation
    if [ -d "$input" ]; then
        # Directory validation
        if [ "$batch_mode" = true ]; then
            batch_validate "$input"
        else
            print_error "Directory specified but --batch flag not provided"
            print_info "Use --batch flag for directory validation"
            exit 1
        fi
    elif [ -f "$input" ]; then
        # Single file validation
        if validate_file_basic "$input"; then
            validate_file_advanced "$input"
            check_security "$input"
            
            echo "═══════════════════════════════════════════════════════════"
            echo -e "${GREEN}✓ Validation passed!${NC}"
            echo "═══════════════════════════════════════════════════════════"
            echo ""
            echo "Ready to upload with:"
            echo "  ./scripts/upload-audio.sh \"$input\" [environment]"
            echo ""
        else
            echo "═══════════════════════════════════════════════════════════"
            echo -e "${RED}✗ Validation failed${NC}"
            echo "═══════════════════════════════════════════════════════════"
            echo ""
            echo "Fix issues before uploading"
            echo ""
            exit 1
        fi
    else
        print_error "Input not found: $input"
        exit 1
    fi
}

# Run main function
main "$@"
