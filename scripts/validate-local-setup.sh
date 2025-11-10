#!/bin/bash

# Validate Local Development Setup
# Checks that everything is configured correctly for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BLUE}🔍 VoisLab Local Development Setup Validator${NC}"
echo ""

# Check Node.js
echo -e "${BLUE}Checking Node.js...${NC}"
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js not installed${NC}"
    ((ERRORS++))
fi
echo ""

# Check npm
echo -e "${BLUE}Checking npm...${NC}"
if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm not installed${NC}"
    ((ERRORS++))
fi
echo ""

# Check node_modules
echo -e "${BLUE}Checking dependencies...${NC}"
if [ -d "$PROJECT_ROOT/node_modules" ]; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}✗ Dependencies not installed${NC}"
    echo -e "${YELLOW}  Run: npm install${NC}"
    ((ERRORS++))
fi
echo ""

# Check .env.local
echo -e "${BLUE}Checking environment configuration...${NC}"
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    echo -e "${GREEN}✓ .env.local exists${NC}"
    
    # Check for required variables
    REQUIRED_VARS=(
        "VITE_AWS_REGION"
        "VITE_ENVIRONMENT"
        "VITE_DYNAMODB_TABLE_NAME"
        "VITE_S3_MEDIA_BUCKET"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^$var=" "$PROJECT_ROOT/.env.local"; then
            VALUE=$(grep "^$var=" "$PROJECT_ROOT/.env.local" | cut -d'=' -f2)
            if [[ "$VALUE" == *"YOUR_"* ]] || [[ "$VALUE" == *"XXXXXXXXXX"* ]]; then
                echo -e "${YELLOW}  ⚠ $var needs to be updated${NC}"
                ((WARNINGS++))
            else
                echo -e "${GREEN}  ✓ $var configured${NC}"
            fi
        else
            echo -e "${RED}  ✗ $var missing${NC}"
            ((ERRORS++))
        fi
    done
else
    echo -e "${RED}✗ .env.local not found${NC}"
    echo -e "${YELLOW}  Create it from .env.example:${NC}"
    echo -e "${YELLOW}  cp .env.example .env.local${NC}"
    ((ERRORS++))
fi
echo ""

# Check AWS CLI
echo -e "${BLUE}Checking AWS CLI...${NC}"
if command -v aws >/dev/null 2>&1; then
    AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1)
    echo -e "${GREEN}✓ AWS CLI installed: $AWS_VERSION${NC}"
    
    # Check AWS credentials
    if aws sts get-caller-identity >/dev/null 2>&1; then
        ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
        echo -e "${GREEN}✓ AWS credentials configured${NC}"
        echo -e "${GREEN}  Account: $ACCOUNT_ID${NC}"
        echo -e "${GREEN}  Identity: $USER_ARN${NC}"
    else
        echo -e "${RED}✗ AWS credentials not configured${NC}"
        echo -e "${YELLOW}  Run: aws configure${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${RED}✗ AWS CLI not installed${NC}"
    echo -e "${YELLOW}  Install from: https://aws.amazon.com/cli/${NC}"
    ((ERRORS++))
fi
echo ""

# Check .gitignore
echo -e "${BLUE}Checking .gitignore...${NC}"
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
    if grep -q ".env.local" "$PROJECT_ROOT/.gitignore"; then
        echo -e "${GREEN}✓ .env.local is git-ignored${NC}"
    else
        echo -e "${RED}✗ .env.local not in .gitignore${NC}"
        echo -e "${YELLOW}  Add it to prevent committing secrets${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}⚠ .gitignore not found${NC}"
    ((WARNINGS++))
fi
echo ""

# Check backend deployment
echo -e "${BLUE}Checking backend deployment...${NC}"
if [ -f "$PROJECT_ROOT/.env.local" ]; then
    ENV=$(grep "^VITE_ENVIRONMENT=" "$PROJECT_ROOT/.env.local" | cut -d'=' -f2)
    TABLE=$(grep "^VITE_DYNAMODB_TABLE_NAME=" "$PROJECT_ROOT/.env.local" | cut -d'=' -f2)
    
    if [ -n "$TABLE" ] && [ "$TABLE" != "YOUR_TABLE_NAME" ]; then
        if aws dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend deployed and accessible${NC}"
            echo -e "${GREEN}  Table: $TABLE${NC}"
        else
            echo -e "${YELLOW}⚠ Cannot access DynamoDB table: $TABLE${NC}"
            echo -e "${YELLOW}  Check IAM permissions or deploy backend${NC}"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠ Backend configuration not set in .env.local${NC}"
        ((WARNINGS++))
    fi
fi
echo ""

# Summary
echo -e "${BLUE}=== Validation Summary ===${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! You're ready to develop.${NC}"
    echo ""
    echo -e "${BLUE}Start development server:${NC}"
    echo -e "  npm run dev"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Setup complete with $WARNINGS warning(s)${NC}"
    echo ""
    echo -e "${BLUE}You can start developing, but review warnings above.${NC}"
    echo -e "  npm run dev"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Setup incomplete: $ERRORS error(s), $WARNINGS warning(s)${NC}"
    echo ""
    echo -e "${YELLOW}Fix the errors above before starting development.${NC}"
    echo ""
    exit 1
fi
