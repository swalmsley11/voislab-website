#!/bin/bash

# VoisLab Website UAT Runner Script
# This script helps run UAT tests locally before triggering CI/CD

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
SCOPE="frontend-only"
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -e|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -s|--scope)
      SCOPE="$2"
      shift 2
      ;;
    -v|--verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  -e, --environment    Environment (dev|prod) [default: dev]"
      echo "  -s, --scope         Test scope (frontend-only|infrastructure-only|full) [default: frontend-only]"
      echo "  -v, --verbose       Verbose output"
      echo "  -h, --help         Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 -e dev -s frontend-only    # Test frontend build only"
      echo "  $0 -e dev -s full            # Run full UAT suite"
      exit 0
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}VoisLab UAT Runner${NC}"
echo "=================="
echo "Environment: $ENVIRONMENT"
echo "Scope: $SCOPE"
echo ""

# Function to log messages
log() {
  if [ "$VERBOSE" = true ]; then
    echo -e "${YELLOW}[INFO]${NC} $1"
  fi
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js not found${NC}"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
log "Node.js version: $NODE_VERSION"

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Frontend tests
if [[ "$SCOPE" == "frontend-only" || "$SCOPE" == "full" ]]; then
  echo -e "${YELLOW}Running frontend UAT tests...${NC}"
  
  # Test 1: Dependencies installation
  echo "Testing npm ci..."
  START_TIME=$(date +%s)
  npm ci > /dev/null 2>&1
  END_TIME=$(date +%s)
  INSTALL_TIME=$((END_TIME - START_TIME))
  echo "✅ Dependencies installed in ${INSTALL_TIME}s"
  
  # Test 2: Linting
  echo "Testing ESLint..."
  if npm run lint > /dev/null 2>&1; then
    echo "✅ Linting passed"
  else
    echo -e "${RED}❌ Linting failed${NC}"
    if [ "$VERBOSE" = true ]; then
      npm run lint
    fi
    exit 1
  fi
  
  # Test 3: Type checking
  echo "Testing TypeScript compilation..."
  if npm run type-check > /dev/null 2>&1; then
    echo "✅ Type checking passed"
  else
    echo -e "${RED}❌ Type checking failed${NC}"
    if [ "$VERBOSE" = true ]; then
      npm run type-check
    fi
    exit 1
  fi
  
  # Test 4: Build process
  echo "Testing build process..."
  START_TIME=$(date +%s)
  if npm run build > /dev/null 2>&1; then
    END_TIME=$(date +%s)
    BUILD_TIME=$((END_TIME - START_TIME))
    echo "✅ Build completed in ${BUILD_TIME}s"
  else
    echo -e "${RED}❌ Build failed${NC}"
    if [ "$VERBOSE" = true ]; then
      npm run build
    fi
    exit 1
  fi
  
  # Test 5: Build artifacts validation
  echo "Validating build artifacts..."
  if [ ! -d "dist" ]; then
    echo -e "${RED}❌ dist directory not created${NC}"
    exit 1
  fi
  
  if [ ! -f "dist/index.html" ]; then
    echo -e "${RED}❌ index.html not found in dist${NC}"
    exit 1
  fi
  
  # Check for essential files
  ESSENTIAL_FILES=("assets" "index.html")
  for file in "${ESSENTIAL_FILES[@]}"; do
    if [ ! -e "dist/$file" ]; then
      echo -e "${RED}❌ Essential file/directory missing: $file${NC}"
      exit 1
    fi
  done
  
  echo "✅ Build artifacts validation passed"
  
  # Build size analysis
  DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "unknown")
  echo "Build size: $DIST_SIZE"
  
  echo -e "${GREEN}✅ Frontend UAT tests completed${NC}"
  echo ""
fi

# Infrastructure tests
if [[ "$SCOPE" == "infrastructure-only" || "$SCOPE" == "full" ]]; then
  echo -e "${YELLOW}Running infrastructure UAT tests...${NC}"
  
  if [ ! -d "infrastructure" ]; then
    echo -e "${RED}❌ Infrastructure directory not found${NC}"
    exit 1
  fi
  
  cd infrastructure
  
  # Test 1: Infrastructure dependencies
  echo "Installing infrastructure dependencies..."
  if npm ci > /dev/null 2>&1; then
    echo "✅ Infrastructure dependencies installed"
  else
    echo -e "${RED}❌ Infrastructure dependencies installation failed${NC}"
    exit 1
  fi
  
  # Test 2: Infrastructure tests
  echo "Running infrastructure unit tests..."
  if npm test > /dev/null 2>&1; then
    echo "✅ Infrastructure tests passed"
  else
    echo -e "${RED}❌ Infrastructure tests failed${NC}"
    if [ "$VERBOSE" = true ]; then
      npm test
    fi
    exit 1
  fi
  
  # Test 3: CDK synthesis
  echo "Testing CDK synthesis..."
  START_TIME=$(date +%s)
  if npm run synth -- --context environment=$ENVIRONMENT > /dev/null 2>&1; then
    END_TIME=$(date +%s)
    SYNTH_TIME=$((END_TIME - START_TIME))
    echo "✅ CDK synthesis completed in ${SYNTH_TIME}s"
  else
    echo -e "${RED}❌ CDK synthesis failed${NC}"
    if [ "$VERBOSE" = true ]; then
      npm run synth -- --context environment=$ENVIRONMENT
    fi
    exit 1
  fi
  
  cd ..
  
  echo -e "${GREEN}✅ Infrastructure UAT tests completed${NC}"
  echo ""
fi

# AWS connectivity test (if full scope)
if [[ "$SCOPE" == "full" ]]; then
  echo -e "${YELLOW}Testing AWS connectivity...${NC}"
  
  if command -v aws &> /dev/null; then
    if aws sts get-caller-identity > /dev/null 2>&1; then
      ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
      REGION=$(aws configure get region)
      echo "✅ AWS connectivity verified"
      log "Account: $ACCOUNT_ID"
      log "Region: $REGION"
    else
      echo -e "${YELLOW}⚠️ AWS credentials not configured${NC}"
      echo "Note: Some tests may be limited without AWS access"
    fi
  else
    echo -e "${YELLOW}⚠️ AWS CLI not installed${NC}"
    echo "Note: Infrastructure deployment tests will be limited"
  fi
  
  echo ""
fi

# Summary
echo -e "${GREEN}🎉 Local UAT tests completed successfully!${NC}"
echo ""
echo "Summary:"
if [[ "$SCOPE" == "frontend-only" || "$SCOPE" == "full" ]]; then
  echo "- Frontend build: ✅ Passed"
  echo "- Build time: ${BUILD_TIME}s"
  echo "- Build size: $DIST_SIZE"
fi

if [[ "$SCOPE" == "infrastructure-only" || "$SCOPE" == "full" ]]; then
  echo "- Infrastructure tests: ✅ Passed"
  echo "- CDK synthesis: ✅ Passed (${SYNTH_TIME}s)"
fi

echo ""
echo -e "${GREEN}Ready for CI/CD pipeline!${NC}"
echo ""
echo "Next steps:"
echo "1. Commit your changes: git add . && git commit -m 'Your message'"
echo "2. Push to trigger CI/CD: git push origin your-branch"
echo "3. Or run full UAT in GitHub Actions manually"