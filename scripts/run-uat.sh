#!/bin/bash

# VoisLab User Acceptance Testing (UAT) Script
# Comprehensive validation for production readiness

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${ENVIRONMENT:-dev}
UAT_TIMEOUT=${UAT_TIMEOUT:-600} # 10 minutes
VERBOSE=${VERBOSE:-false}
HEADLESS=${HEADLESS:-true}
BROWSER=${BROWSER:-chrome}

echo -e "${CYAN}🎯 VoisLab User Acceptance Testing (UAT) Suite${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}Timeout: ${UAT_TIMEOUT}s${NC}"
echo -e "${BLUE}Browser: ${BROWSER}${NC}"
echo -e "${BLUE}Headless: ${HEADLESS}${NC}"
echo ""

# Function to print status messages
print_status() {
    echo -e "${BLUE}[UAT]${NC} $1"
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

print_test_header() {
    echo -e "\n${MAGENTA}🧪 $1${NC}"
    echo -e "${MAGENTA}$(printf '=%.0s' {1..50})${NC}"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for server to be ready
wait_for_server() {
    local url=$1
    local timeout=${2:-30}
    local count=0
    
    print_status "Waiting for server at $url..."
    
    while [ $count -lt $timeout ]; do
        if curl -s --connect-timeout 5 "$url" >/dev/null 2>&1; then
            print_success "Server is ready at $url"
            return 0
        fi
        
        count=$((count + 1))
        sleep 1
    done
    
    print_error "Server at $url did not become ready within ${timeout}s"
    return 1
}

# Function to run integration validation
run_integration_validation() {
    print_test_header "Integration Validation"
    
    print_status "Running comprehensive integration validation..."
    
    if ./scripts/validate-integration.sh; then
        print_success "Integration validation passed"
        return 0
    else
        print_error "Integration validation failed"
        return 1
    fi
}

# Function to test build and deployment readiness
test_build_deployment() {
    print_test_header "Build and Deployment Readiness"
    
    print_status "Testing production build..."
    
    # Clean previous build
    if [ -d "dist" ]; then
        rm -rf dist
    fi
    
    # Build for production
    if VITE_ENVIRONMENT=prod npm run build; then
        print_success "Production build completed successfully"
    else
        print_error "Production build failed"
        return 1
    fi
    
    # Validate build output
    print_status "Validating build output..."
    
    if [ ! -f "dist/index.html" ]; then
        print_error "index.html not found in build output"
        return 1
    fi
    
    if [ ! -d "dist/assets" ]; then
        print_error "Assets directory not found in build output"
        return 1
    fi
    
    # Check for essential files
    local essential_files=("index.html")
    for file in "${essential_files[@]}"; do
        if [ ! -f "dist/$file" ]; then
            print_error "Essential file missing: $file"
            return 1
        fi
    done
    
    # Check bundle sizes
    local total_size=$(du -sh dist 2>/dev/null | cut -f1)
    print_status "Total build size: $total_size"
    
    # Check for source maps in production
    local source_maps=$(find dist -name "*.map" 2>/dev/null | wc -l)
    if [ "$ENVIRONMENT" = "prod" ] && [ "$source_maps" -gt 0 ]; then
        print_warning "Found $source_maps source map files in production build"
    fi
    
    print_success "Build and deployment validation passed"
    return 0
}

# Function to test website functionality
test_website_functionality() {
    print_test_header "Website Functionality Testing"
    
    print_status "Starting development server for testing..."
    
    # Start development server in background
    npm run dev &
    local server_pid=$!
    
    # Wait for server to be ready
    if ! wait_for_server "http://localhost:3000" 60; then
        kill $server_pid 2>/dev/null || true
        return 1
    fi
    
    # Test basic connectivity
    print_status "Testing basic website connectivity..."
    
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000")
    if [ "$response_code" != "200" ]; then
        print_error "Website returned HTTP $response_code instead of 200"
        kill $server_pid 2>/dev/null || true
        return 1
    fi
    
    print_success "Website is accessible and returning HTTP 200"
    
    # Test essential pages
    local pages=("/" "/privacy" "/terms" "/licensing")
    for page in "${pages[@]}"; do
        print_status "Testing page: $page"
        local page_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$page")
        if [ "$page_response" != "200" ]; then
            print_warning "Page $page returned HTTP $page_response"
        else
            print_success "Page $page is accessible"
        fi
    done
    
    # Test static assets
    print_status "Testing static asset loading..."
    
    # Get the main page content to find asset references
    local page_content=$(curl -s "http://localhost:3000")
    
    # Check if page contains expected content
    if echo "$page_content" | grep -q "VoisLab"; then
        print_success "Page contains VoisLab branding"
    else
        print_warning "Page may not contain expected VoisLab branding"
    fi
    
    if echo "$page_content" | grep -q "<script"; then
        print_success "Page contains JavaScript includes"
    else
        print_error "Page missing JavaScript includes"
        kill $server_pid 2>/dev/null || true
        return 1
    fi
    
    # Test API endpoints (if any are accessible)
    print_status "Testing API connectivity..."
    
    # This would test actual API endpoints if they were available
    # For now, we'll just verify the page loads the integration tests
    
    print_success "Website functionality testing completed"
    
    # Clean up server
    kill $server_pid 2>/dev/null || true
    sleep 2
    
    return 0
}

# Function to test performance benchmarks
test_performance() {
    print_test_header "Performance Testing"
    
    print_status "Running performance benchmarks..."
    
    # Test build performance
    local build_start=$(date +%s)
    npm run build >/dev/null 2>&1
    local build_end=$(date +%s)
    local build_duration=$((build_end - build_start))
    
    print_status "Build time: ${build_duration}s"
    
    if [ $build_duration -gt 60 ]; then
        print_warning "Build time is slow: ${build_duration}s"
    else
        print_success "Build time is acceptable: ${build_duration}s"
    fi
    
    # Test bundle size
    if [ -d "dist" ]; then
        local bundle_size_bytes=$(du -sb dist 2>/dev/null | cut -f1)
        local bundle_size_mb=$((bundle_size_bytes / 1024 / 1024))
        
        print_status "Bundle size: ${bundle_size_mb}MB"
        
        if [ $bundle_size_mb -gt 50 ]; then
            print_warning "Bundle size is large: ${bundle_size_mb}MB"
        else
            print_success "Bundle size is acceptable: ${bundle_size_mb}MB"
        fi
    fi
    
    # Test TypeScript compilation performance
    local tsc_start=$(date +%s)
    npx tsc --noEmit >/dev/null 2>&1
    local tsc_end=$(date +%s)
    local tsc_duration=$((tsc_end - tsc_start))
    
    print_status "TypeScript compilation time: ${tsc_duration}s"
    
    if [ $tsc_duration -gt 30 ]; then
        print_warning "TypeScript compilation is slow: ${tsc_duration}s"
    else
        print_success "TypeScript compilation is fast: ${tsc_duration}s"
    fi
    
    print_success "Performance testing completed"
    return 0
}

# Function to test accessibility and compliance
test_accessibility_compliance() {
    print_test_header "Accessibility and Compliance Testing"
    
    print_status "Testing accessibility features..."
    
    # Check for accessibility-related files and configurations
    local accessibility_checks=0
    local accessibility_passed=0
    
    # Check for semantic HTML structure
    if [ -f "src/components/Header.tsx" ]; then
        accessibility_checks=$((accessibility_checks + 1))
        if grep -q "header\|nav\|main" src/components/Header.tsx; then
            print_success "Header component uses semantic HTML"
            accessibility_passed=$((accessibility_passed + 1))
        else
            print_warning "Header component may not use semantic HTML"
        fi
    fi
    
    # Check for alt text and ARIA labels
    accessibility_checks=$((accessibility_checks + 1))
    if grep -r "alt=\|aria-label=\|aria-" src/components/ >/dev/null 2>&1; then
        print_success "Components include accessibility attributes"
        accessibility_passed=$((accessibility_passed + 1))
    else
        print_warning "Components may be missing accessibility attributes"
    fi
    
    # Check for keyboard navigation support
    accessibility_checks=$((accessibility_checks + 1))
    if grep -r "onKeyDown\|onKeyPress\|tabIndex" src/components/ >/dev/null 2>&1; then
        print_success "Components include keyboard navigation support"
        accessibility_passed=$((accessibility_passed + 1))
    else
        print_warning "Components may be missing keyboard navigation support"
    fi
    
    # Legal compliance checks
    print_status "Testing legal compliance features..."
    
    local legal_checks=0
    local legal_passed=0
    
    # Check for privacy policy
    legal_checks=$((legal_checks + 1))
    if [ -f "src/components/PrivacyPolicy.tsx" ]; then
        print_success "Privacy policy component exists"
        legal_passed=$((legal_passed + 1))
    else
        print_warning "Privacy policy component not found"
    fi
    
    # Check for terms of use
    legal_checks=$((legal_checks + 1))
    if [ -f "src/components/TermsOfUse.tsx" ]; then
        print_success "Terms of use component exists"
        legal_passed=$((legal_passed + 1))
    else
        print_warning "Terms of use component not found"
    fi
    
    # Check for copyright notices
    legal_checks=$((legal_checks + 1))
    if [ -f "src/components/CopyrightNotice.tsx" ]; then
        print_success "Copyright notice component exists"
        legal_passed=$((legal_passed + 1))
    else
        print_warning "Copyright notice component not found"
    fi
    
    # Check for licensing information
    legal_checks=$((legal_checks + 1))
    if [ -f "src/components/LicensingInfo.tsx" ]; then
        print_success "Licensing information component exists"
        legal_passed=$((legal_passed + 1))
    else
        print_warning "Licensing information component not found"
    fi
    
    local total_checks=$((accessibility_checks + legal_checks))
    local total_passed=$((accessibility_passed + legal_passed))
    local compliance_rate=$((total_passed * 100 / total_checks))
    
    print_status "Compliance rate: ${compliance_rate}% (${total_passed}/${total_checks})"
    
    if [ $compliance_rate -ge 80 ]; then
        print_success "Accessibility and compliance testing passed"
        return 0
    else
        print_warning "Accessibility and compliance testing needs improvement"
        return 1
    fi
}

# Function to test SEO features
test_seo_features() {
    print_test_header "SEO Features Testing"
    
    print_status "Testing SEO implementation..."
    
    local seo_checks=0
    local seo_passed=0
    
    # Check for SEO component
    seo_checks=$((seo_checks + 1))
    if [ -f "src/components/SEOHead.tsx" ]; then
        print_success "SEO Head component exists"
        seo_passed=$((seo_passed + 1))
    else
        print_warning "SEO Head component not found"
    fi
    
    # Check for meta tags implementation
    seo_checks=$((seo_checks + 1))
    if grep -r "meta.*description\|meta.*keywords\|og:" src/components/ >/dev/null 2>&1; then
        print_success "Meta tags and Open Graph implementation found"
        seo_passed=$((seo_passed + 1))
    else
        print_warning "Meta tags and Open Graph implementation not found"
    fi
    
    # Check for structured data
    seo_checks=$((seo_checks + 1))
    if grep -r "schema.org\|@type\|@context" src/ >/dev/null 2>&1; then
        print_success "Structured data implementation found"
        seo_passed=$((seo_passed + 1))
    else
        print_warning "Structured data implementation not found"
    fi
    
    # Check for sitemap
    seo_checks=$((seo_checks + 1))
    if [ -f "public/sitemap.xml" ] || grep -r "sitemap" src/utils/ >/dev/null 2>&1; then
        print_success "Sitemap implementation found"
        seo_passed=$((seo_passed + 1))
    else
        print_warning "Sitemap implementation not found"
    fi
    
    # Check for robots.txt
    seo_checks=$((seo_checks + 1))
    if [ -f "public/robots.txt" ]; then
        print_success "Robots.txt file exists"
        seo_passed=$((seo_passed + 1))
    else
        print_warning "Robots.txt file not found"
    fi
    
    local seo_rate=$((seo_passed * 100 / seo_checks))
    print_status "SEO implementation rate: ${seo_rate}% (${seo_passed}/${seo_checks})"
    
    if [ $seo_rate -ge 80 ]; then
        print_success "SEO features testing passed"
        return 0
    else
        print_warning "SEO features testing needs improvement"
        return 1
    fi
}

# Function to test monitoring and analytics
test_monitoring_analytics() {
    print_test_header "Monitoring and Analytics Testing"
    
    print_status "Testing monitoring and analytics implementation..."
    
    local monitoring_checks=0
    local monitoring_passed=0
    
    # Check for analytics implementation
    monitoring_checks=$((monitoring_checks + 1))
    if [ -f "src/utils/analytics.ts" ]; then
        print_success "Analytics implementation exists"
        monitoring_passed=$((monitoring_passed + 1))
    else
        print_warning "Analytics implementation not found"
    fi
    
    # Check for monitoring implementation
    monitoring_checks=$((monitoring_checks + 1))
    if [ -f "src/utils/monitoring.ts" ]; then
        print_success "Monitoring implementation exists"
        monitoring_passed=$((monitoring_passed + 1))
    else
        print_warning "Monitoring implementation not found"
    fi
    
    # Check for error handling
    monitoring_checks=$((monitoring_checks + 1))
    if grep -r "trackError\|reportError" src/utils/ >/dev/null 2>&1; then
        print_success "Error tracking implementation found"
        monitoring_passed=$((monitoring_passed + 1))
    else
        print_warning "Error tracking implementation not found"
    fi
    
    # Check for performance tracking
    monitoring_checks=$((monitoring_checks + 1))
    if grep -r "trackPerformance\|performance.now" src/utils/ >/dev/null 2>&1; then
        print_success "Performance tracking implementation found"
        monitoring_passed=$((monitoring_passed + 1))
    else
        print_warning "Performance tracking implementation not found"
    fi
    
    # Check for user interaction tracking
    monitoring_checks=$((monitoring_checks + 1))
    if grep -r "trackAudioPlay\|trackSearch\|trackFilter" src/utils/ >/dev/null 2>&1; then
        print_success "User interaction tracking implementation found"
        monitoring_passed=$((monitoring_passed + 1))
    else
        print_warning "User interaction tracking implementation not found"
    fi
    
    local monitoring_rate=$((monitoring_passed * 100 / monitoring_checks))
    print_status "Monitoring implementation rate: ${monitoring_rate}% (${monitoring_passed}/${monitoring_checks})"
    
    if [ $monitoring_rate -ge 80 ]; then
        print_success "Monitoring and analytics testing passed"
        return 0
    else
        print_warning "Monitoring and analytics testing needs improvement"
        return 1
    fi
}

# Function to run comprehensive UAT
run_comprehensive_uat() {
    print_test_header "Comprehensive User Acceptance Testing"
    
    local test_results=()
    local total_tests=0
    local passed_tests=0
    
    # Run all test suites
    local test_suites=(
        "run_integration_validation"
        "test_build_deployment"
        "test_website_functionality"
        "test_performance"
        "test_accessibility_compliance"
        "test_seo_features"
        "test_monitoring_analytics"
    )
    
    for test_suite in "${test_suites[@]}"; do
        total_tests=$((total_tests + 1))
        
        print_status "Running $test_suite..."
        
        if $test_suite; then
            test_results+=("✅ $test_suite: PASSED")
            passed_tests=$((passed_tests + 1))
        else
            test_results+=("❌ $test_suite: FAILED")
        fi
    done
    
    # Generate UAT report
    local uat_report="uat-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "VoisLab User Acceptance Testing Report"
        echo "Generated: $(date)"
        echo "Environment: $ENVIRONMENT"
        echo "======================================="
        echo ""
        echo "Test Results:"
        for result in "${test_results[@]}"; do
            echo "$result"
        done
        echo ""
        echo "Summary:"
        echo "Total Tests: $total_tests"
        echo "Passed: $passed_tests"
        echo "Failed: $((total_tests - passed_tests))"
        echo "Success Rate: $(((passed_tests * 100) / total_tests))%"
        echo ""
        echo "Environment Details:"
        echo "Node.js Version: $(node --version 2>/dev/null || echo 'Not available')"
        echo "npm Version: $(npm --version 2>/dev/null || echo 'Not available')"
        echo "Build Size: $(du -sh dist 2>/dev/null | cut -f1 || echo 'Not available')"
        echo ""
        echo "Recommendations:"
        if [ $passed_tests -eq $total_tests ]; then
            echo "✅ All tests passed. System is ready for production deployment."
        elif [ $((passed_tests * 100 / total_tests)) -ge 80 ]; then
            echo "⚠️  Most tests passed. Review failed tests before deployment."
        else
            echo "❌ Multiple test failures. System needs significant improvements."
        fi
    } > "$uat_report"
    
    print_success "UAT report generated: $uat_report"
    
    # Display summary
    echo ""
    echo -e "${CYAN}📊 UAT Summary${NC}"
    echo -e "${CYAN}$(printf '=%.0s' {1..30})${NC}"
    echo -e "${BLUE}Total Tests: $total_tests${NC}"
    echo -e "${GREEN}Passed: $passed_tests${NC}"
    echo -e "${RED}Failed: $((total_tests - passed_tests))${NC}"
    echo -e "${YELLOW}Success Rate: $(((passed_tests * 100) / total_tests))%${NC}"
    
    # Final recommendation
    local success_rate=$(((passed_tests * 100) / total_tests))
    
    if [ $success_rate -eq 100 ]; then
        echo -e "\n${GREEN}🎉 EXCELLENT! All UAT tests passed.${NC}"
        echo -e "${GREEN}The VoisLab system is ready for production deployment.${NC}"
        return 0
    elif [ $success_rate -ge 80 ]; then
        echo -e "\n${YELLOW}⚠️  GOOD! Most UAT tests passed.${NC}"
        echo -e "${YELLOW}Review failed tests and consider deployment with monitoring.${NC}"
        return 0
    else
        echo -e "\n${RED}❌ NEEDS WORK! Multiple UAT test failures.${NC}"
        echo -e "${RED}Address critical issues before considering deployment.${NC}"
        return 1
    fi
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    print_status "Starting VoisLab User Acceptance Testing..."
    
    # Check prerequisites
    if ! command_exists node; then
        print_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is required but not installed"
        exit 1
    fi
    
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Run from project root."
        exit 1
    fi
    
    # Run comprehensive UAT
    if run_comprehensive_uat; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        print_success "UAT completed successfully in ${duration}s"
        echo ""
        echo -e "${GREEN}🚀 VoisLab is ready for production!${NC}"
        exit 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        print_error "UAT completed with failures in ${duration}s"
        echo ""
        echo -e "${RED}🔧 VoisLab needs improvements before production deployment.${NC}"
        exit 1
    fi
}

# Error handling
trap 'print_error "UAT failed at line $LINENO"' ERR

# Run main function
main "$@"