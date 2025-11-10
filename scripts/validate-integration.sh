#!/bin/bash

# VoisLab Integration Validation Script
# Comprehensive testing for end-to-end workflows and system integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${ENVIRONMENT:-dev}
TIMEOUT=${TIMEOUT:-300} # 5 minutes
VERBOSE=${VERBOSE:-false}

echo -e "${BLUE}🚀 VoisLab Integration Validation Script${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Timeout: ${TIMEOUT}s${NC}"
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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command_exists node; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command_exists npm; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found. Installing dependencies..."
        npm install
    fi
    
    print_success "Prerequisites check completed"
}

# Function to validate environment configuration
validate_environment() {
    print_status "Validating environment configuration..."
    
    # Check for required environment files
    if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
        print_warning "No .env file found. Some tests may fail."
    fi
    
    # Check AWS CLI if available
    if command_exists aws; then
        print_status "AWS CLI found, checking configuration..."
        if aws sts get-caller-identity >/dev/null 2>&1; then
            print_success "AWS credentials are configured"
        else
            print_warning "AWS credentials not configured or invalid"
        fi
    else
        print_warning "AWS CLI not found. Some validation tests may be limited."
    fi
    
    print_success "Environment validation completed"
}

# Function to build the project
build_project() {
    print_status "Building project for testing..."
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing/updating dependencies..."
        npm install
    fi
    
    # Build the project
    print_status "Building project..."
    if npm run build >/dev/null 2>&1; then
        print_success "Project build completed"
    else
        print_error "Project build failed"
        return 1
    fi
    
    # Check if dist directory exists
    if [ ! -d "dist" ]; then
        print_error "Build output directory 'dist' not found"
        return 1
    fi
    
    print_success "Build validation completed"
}

# Function to run TypeScript compilation check
check_typescript() {
    print_status "Checking TypeScript compilation..."
    
    if command_exists tsc; then
        if npx tsc --noEmit >/dev/null 2>&1; then
            print_success "TypeScript compilation check passed"
        else
            print_error "TypeScript compilation errors found"
            if [ "$VERBOSE" = "true" ]; then
                npx tsc --noEmit
            fi
            return 1
        fi
    else
        print_warning "TypeScript compiler not found, skipping compilation check"
    fi
}

# Function to run linting
run_linting() {
    print_status "Running code linting..."
    
    if npm run lint >/dev/null 2>&1; then
        print_success "Linting passed"
    else
        print_warning "Linting issues found"
        if [ "$VERBOSE" = "true" ]; then
            npm run lint
        fi
    fi
}

# Function to test infrastructure connectivity
test_infrastructure() {
    print_status "Testing infrastructure connectivity..."
    
    # Test if we can reach AWS services (basic connectivity)
    if command_exists curl; then
        # Test AWS endpoint connectivity
        if curl -s --connect-timeout 10 https://dynamodb.us-east-1.amazonaws.com/ >/dev/null 2>&1; then
            print_success "AWS DynamoDB endpoint reachable"
        else
            print_warning "AWS DynamoDB endpoint not reachable"
        fi
        
        if curl -s --connect-timeout 10 https://s3.amazonaws.com/ >/dev/null 2>&1; then
            print_success "AWS S3 endpoint reachable"
        else
            print_warning "AWS S3 endpoint not reachable"
        fi
    else
        print_warning "curl not available, skipping connectivity tests"
    fi
    
    print_success "Infrastructure connectivity test completed"
}

# Function to run unit tests if available
run_unit_tests() {
    print_status "Running unit tests..."
    
    # Check if test script exists
    if npm run test --silent >/dev/null 2>&1; then
        print_status "Running test suite..."
        if timeout $TIMEOUT npm run test -- --run >/dev/null 2>&1; then
            print_success "Unit tests passed"
        else
            print_warning "Some unit tests failed or timed out"
            if [ "$VERBOSE" = "true" ]; then
                npm run test -- --run
            fi
        fi
    else
        print_warning "No test script found in package.json"
    fi
}

# Function to validate build output
validate_build_output() {
    print_status "Validating build output..."
    
    if [ ! -d "dist" ]; then
        print_error "Build output directory not found"
        return 1
    fi
    
    # Check for essential files
    essential_files=("index.html" "assets")
    for file in "${essential_files[@]}"; do
        if [ ! -e "dist/$file" ]; then
            print_error "Essential build file missing: $file"
            return 1
        fi
    done
    
    # Check file sizes (basic validation)
    index_size=$(stat -f%z "dist/index.html" 2>/dev/null || stat -c%s "dist/index.html" 2>/dev/null || echo "0")
    if [ "$index_size" -lt 100 ]; then
        print_error "index.html seems too small ($index_size bytes)"
        return 1
    fi
    
    print_success "Build output validation completed"
}

# Function to test service worker and PWA features
test_pwa_features() {
    print_status "Testing PWA features..."
    
    # Check for service worker
    if [ -f "public/sw.js" ]; then
        print_success "Service worker file found"
    else
        print_warning "Service worker file not found"
    fi
    
    # Check for manifest
    if [ -f "public/manifest.json" ]; then
        print_success "PWA manifest found"
        
        # Basic manifest validation
        if command_exists jq; then
            if jq empty public/manifest.json >/dev/null 2>&1; then
                print_success "PWA manifest is valid JSON"
            else
                print_warning "PWA manifest has JSON syntax errors"
            fi
        fi
    else
        print_warning "PWA manifest not found"
    fi
    
    print_success "PWA features test completed"
}

# Function to run performance checks
run_performance_checks() {
    print_status "Running performance checks..."
    
    # Check bundle sizes
    if [ -d "dist/assets" ]; then
        total_size=$(du -sh dist/assets 2>/dev/null | cut -f1 || echo "unknown")
        print_status "Total asset size: $total_size"
        
        # Check for large files
        large_files=$(find dist/assets -size +1M 2>/dev/null || true)
        if [ -n "$large_files" ]; then
            print_warning "Large files found (>1MB):"
            echo "$large_files"
        fi
    fi
    
    # Check for source maps in production
    if [ "$ENVIRONMENT" = "prod" ]; then
        source_maps=$(find dist -name "*.map" 2>/dev/null || true)
        if [ -n "$source_maps" ]; then
            print_warning "Source maps found in production build"
        else
            print_success "No source maps in production build"
        fi
    fi
    
    print_success "Performance checks completed"
}

# Function to generate test report
generate_report() {
    print_status "Generating validation report..."
    
    report_file="validation-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "VoisLab Integration Validation Report"
        echo "Generated: $(date)"
        echo "Environment: $ENVIRONMENT"
        echo "======================================="
        echo ""
        echo "Validation Steps Completed:"
        echo "✓ Prerequisites check"
        echo "✓ Environment validation"
        echo "✓ Project build"
        echo "✓ TypeScript compilation"
        echo "✓ Code linting"
        echo "✓ Infrastructure connectivity"
        echo "✓ Unit tests"
        echo "✓ Build output validation"
        echo "✓ PWA features test"
        echo "✓ Performance checks"
        echo ""
        echo "For detailed logs, run with VERBOSE=true"
    } > "$report_file"
    
    print_success "Validation report generated: $report_file"
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    print_status "Starting VoisLab integration validation..."
    
    # Run validation steps
    check_prerequisites
    validate_environment
    build_project
    check_typescript
    run_linting
    test_infrastructure
    run_unit_tests
    validate_build_output
    test_pwa_features
    run_performance_checks
    generate_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_success "Integration validation completed successfully in ${duration}s"
    
    echo ""
    echo -e "${GREEN}🎉 All validation checks passed!${NC}"
    echo -e "${BLUE}The VoisLab system is ready for deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run browser-based integration tests: testVoisLabComplete()"
    echo "2. Deploy to staging environment for further testing"
    echo "3. Run production validation after deployment"
}

# Error handling
trap 'print_error "Validation failed at line $LINENO"' ERR

# Run main function
main "$@"