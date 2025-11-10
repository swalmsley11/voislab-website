#!/bin/bash

# Documentation Consistency Validation Script
# Validates that deployment documentation is consistent across all files

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BLUE}🔍 VoisLab Documentation Consistency Validator${NC}"
echo ""

# Function to check for pattern in files
check_pattern() {
    local pattern=$1
    local files=$2
    local description=$3
    local should_exist=$4
    
    echo -e "${BLUE}Checking: ${description}${NC}"
    
    for file in $files; do
        if [ ! -f "$file" ]; then
            echo -e "${YELLOW}  ⚠ File not found: $file${NC}"
            ((WARNINGS++))
            continue
        fi
        
        if grep -q "$pattern" "$file"; then
            if [ "$should_exist" = "false" ]; then
                echo -e "${RED}  ✗ Found in $file (should not exist)${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}  ✓ Found in $file${NC}"
            fi
        else
            if [ "$should_exist" = "true" ]; then
                echo -e "${RED}  ✗ Not found in $file (should exist)${NC}"
                ((ERRORS++))
            else
                echo -e "${GREEN}  ✓ Not found in $file (correct)${NC}"
            fi
        fi
    done
    echo ""
}

# Navigate to project root
cd "$(dirname "$0")/.."

echo -e "${BLUE}=== Region Consistency ===${NC}"
echo ""

# Check for correct region (us-west-2)
check_pattern "us-west-2" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md infrastructure/deploy-backend.sh infrastructure/teardown-stack.sh" \
    "Region should be us-west-2" \
    "true"

# Check for incorrect region (us-east-1)
check_pattern "us-east-1" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md" \
    "Region should NOT be us-east-1" \
    "false"

echo -e "${BLUE}=== Stack Naming Consistency ===${NC}"
echo ""

# Check for correct stack names (without "Stack" suffix)
# In docs, check for literal names
check_pattern "VoislabWebsite-dev" \
    "docs/AMPLIFY_DEPLOYMENT.md infrastructure/TEARDOWN_GUIDE.md" \
    "Stack name should be VoislabWebsite-dev (in docs)" \
    "true"

check_pattern "VoislabWebsite-prod" \
    "docs/AMPLIFY_DEPLOYMENT.md" \
    "Stack name should be VoislabWebsite-prod (in docs)" \
    "true"

# In scripts, check for variable-based construction
check_pattern 'VoislabWebsite-\$' \
    "infrastructure/deploy-backend.sh infrastructure/teardown-stack.sh" \
    "Stack name pattern VoislabWebsite-\$... (in scripts)" \
    "true"

# Check for incorrect stack names (with "Stack" suffix)
check_pattern "VoislabWebsiteStack-" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md infrastructure/TEARDOWN_GUIDE.md" \
    "Stack name should NOT have 'Stack' suffix" \
    "false"

echo -e "${BLUE}=== CDK Command Consistency ===${NC}"
echo ""

# Check for correct CDK approach (--context)
check_pattern "\-\-context environment=" \
    "docs/AMPLIFY_DEPLOYMENT.md infrastructure/deploy-backend.sh" \
    "CDK commands should use --context" \
    "true"

# Check for incorrect CDK approach (--parameters)
check_pattern "\-\-parameters environment=" \
    "docs/AMPLIFY_DEPLOYMENT.md" \
    "CDK commands should NOT use --parameters" \
    "false"

echo -e "${BLUE}=== Environment Variables Consistency ===${NC}"
echo ""

# Check for all required environment variables
check_pattern "VITE_ERROR_REPORTING_ENABLED" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md infrastructure/deploy-backend.sh" \
    "Should include VITE_ERROR_REPORTING_ENABLED" \
    "true"

check_pattern "VITE_PERFORMANCE_MONITORING_ENABLED" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md infrastructure/deploy-backend.sh" \
    "Should include VITE_PERFORMANCE_MONITORING_ENABLED" \
    "true"

echo -e "${BLUE}=== Cross-References ===${NC}"
echo ""

# Check for cross-references
check_pattern "deploy-backend.sh" \
    "docs/AMPLIFY_DEPLOYMENT.md README.md" \
    "Should reference deploy-backend.sh script" \
    "true"

check_pattern "TEARDOWN_GUIDE" \
    "README.md docs/AMPLIFY_DEPLOYMENT.md" \
    "Should reference TEARDOWN_GUIDE.md" \
    "true"

check_pattern "AMPLIFY_DEPLOYMENT" \
    "README.md infrastructure/TEARDOWN_GUIDE.md" \
    "Should reference AMPLIFY_DEPLOYMENT.md" \
    "true"

echo -e "${BLUE}=== Output Files ===${NC}"
echo ""

# Check for environment-specific output files
# In docs, check for literal names
check_pattern "outputs-dev.json" \
    "docs/AMPLIFY_DEPLOYMENT.md" \
    "Should reference outputs-dev.json (in docs)" \
    "true"

check_pattern "outputs-prod.json" \
    "docs/AMPLIFY_DEPLOYMENT.md" \
    "Should reference outputs-prod.json (in docs)" \
    "true"

# In scripts, check for variable-based construction
check_pattern "outputs-\$ENVIRONMENT.json" \
    "infrastructure/deploy-backend.sh" \
    "Should use outputs-\$ENVIRONMENT.json pattern (in scripts)" \
    "true"

echo -e "${BLUE}=== Script Validation ===${NC}"
echo ""

# Check that scripts are executable
for script in infrastructure/deploy-backend.sh infrastructure/teardown-stack.sh; do
    if [ -x "$script" ]; then
        echo -e "${GREEN}  ✓ $script is executable${NC}"
    else
        echo -e "${RED}  ✗ $script is not executable${NC}"
        echo -e "${YELLOW}    Run: chmod +x $script${NC}"
        ((ERRORS++))
    fi
done
echo ""

# Check for bash shebang
for script in infrastructure/deploy-backend.sh infrastructure/teardown-stack.sh; do
    if head -n 1 "$script" | grep -q "^#!/bin/bash"; then
        echo -e "${GREEN}  ✓ $script has correct shebang${NC}"
    else
        echo -e "${RED}  ✗ $script missing #!/bin/bash shebang${NC}"
        ((ERRORS++))
    fi
done
echo ""

# Summary
echo -e "${BLUE}=== Validation Summary ===${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Documentation is consistent.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation completed with $WARNINGS warning(s)${NC}"
    exit 0
else
    echo -e "${RED}❌ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo -e "${YELLOW}Please review the errors above and update the documentation.${NC}"
    exit 1
fi
