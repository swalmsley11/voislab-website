#!/bin/bash

# VoisLab Website Domain Setup Script
# This script helps configure custom domain for the VoisLab website

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}VoisLab Website Domain Setup${NC}"
echo "=================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    echo "Please install AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if user is logged in to AWS
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with AWS${NC}"
    echo "Please run: aws configure"
    exit 1
fi

# Get current AWS account and region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

echo -e "${GREEN}Current AWS Account:${NC} $ACCOUNT_ID"
echo -e "${GREEN}Current AWS Region:${NC} $REGION"
echo ""

# Function to check if hosted zone exists
check_hosted_zone() {
    local domain=$1
    local zone_id=$(aws route53 list-hosted-zones --query "HostedZones[?Name=='${domain}.'].Id" --output text 2>/dev/null | sed 's|/hostedzone/||')
    echo $zone_id
}

# Function to create hosted zone
create_hosted_zone() {
    local domain=$1
    echo -e "${YELLOW}Creating hosted zone for $domain...${NC}"
    
    local caller_reference="voislab-$(date +%s)"
    local zone_id=$(aws route53 create-hosted-zone \
        --name $domain \
        --caller-reference $caller_reference \
        --hosted-zone-config Comment="VoisLab website hosted zone" \
        --query 'HostedZone.Id' --output text | sed 's|/hostedzone/||')
    
    echo -e "${GREEN}Created hosted zone: $zone_id${NC}"
    echo $zone_id
}

# Get domain name from user
read -p "Enter your domain name (e.g., voislab.com): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}Error: Domain name is required${NC}"
    exit 1
fi

# Check if hosted zone exists
echo -e "${YELLOW}Checking for existing hosted zone...${NC}"
HOSTED_ZONE_ID=$(check_hosted_zone $DOMAIN_NAME)

if [ -z "$HOSTED_ZONE_ID" ]; then
    echo -e "${YELLOW}Hosted zone not found for $DOMAIN_NAME${NC}"
    read -p "Would you like to create a new hosted zone? (y/n): " CREATE_ZONE
    
    if [ "$CREATE_ZONE" = "y" ] || [ "$CREATE_ZONE" = "Y" ]; then
        HOSTED_ZONE_ID=$(create_hosted_zone $DOMAIN_NAME)
        
        # Get name servers
        echo -e "${YELLOW}Getting name servers for the hosted zone...${NC}"
        aws route53 get-hosted-zone --id $HOSTED_ZONE_ID --query 'DelegationSet.NameServers' --output table
        
        echo -e "${YELLOW}IMPORTANT: Update your domain registrar with these name servers${NC}"
        echo -e "${YELLOW}This may take 24-48 hours to propagate${NC}"
    else
        echo -e "${RED}Cannot proceed without a hosted zone${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Found existing hosted zone: $HOSTED_ZONE_ID${NC}"
fi

# Update CDK context
echo -e "${YELLOW}Updating CDK configuration...${NC}"

# Update cdk.json with the domain configuration
cd infrastructure
npm run build

# Create a temporary context file
cat > cdk.context.json << EOF
{
  "domainName": "$DOMAIN_NAME",
  "hostedZoneId": "$HOSTED_ZONE_ID",
  "githubRepository": "voislab/voislab-website"
}
EOF

echo -e "${GREEN}Domain configuration completed!${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Set the GITHUB_ACCESS_TOKEN environment variable"
echo "2. Deploy the infrastructure:"
echo "   ${YELLOW}npm run deploy:prod:amplify${NC}"
echo ""
echo -e "${GREEN}Domain Details:${NC}"
echo "Domain: $DOMAIN_NAME"
echo "Hosted Zone ID: $HOSTED_ZONE_ID"
echo "Account: $ACCOUNT_ID"
echo "Region: $REGION"