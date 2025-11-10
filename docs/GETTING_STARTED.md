# Getting Started with VoisLab

**Complete setup guide from zero to production deployment.**

This guide walks you through setting up VoisLab from scratch, whether you're starting with a brand new AWS account and laptop, or joining an existing project.

---

## Table of Contents

1. [Prerequisites Setup](#1-prerequisites-setup)
2. [AWS Account Setup](#2-aws-account-setup)
3. [Local Development Setup](#3-local-development-setup)
4. [Backend Deployment](#4-backend-deployment)
5. [Frontend Deployment](#5-frontend-deployment)
6. [Verification & Testing](#6-verification--testing)
7. [Next Steps](#7-next-steps)

---

## 1. Prerequisites Setup

### Install Required Software

#### macOS

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 18+
brew install node

# Install AWS CLI
brew install awscli

# Install Git (if not installed)
brew install git

# Install jq (for JSON parsing)
brew install jq
```

#### Windows

```powershell
# Install Node.js from https://nodejs.org/
# Download and install AWS CLI from https://aws.amazon.com/cli/
# Install Git from https://git-scm.com/
```

#### Linux (Ubuntu/Debian)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Install Git
sudo apt-get install git

# Install jq
sudo apt-get install jq
```

### Verify Installation

```bash
# Check versions
node --version    # Should be v18.x or higher
npm --version     # Should be 9.x or higher
aws --version     # Should be aws-cli/2.x
git --version     # Any recent version
jq --version      # Any recent version
```

### Install AWS CDK

```bash
# Install AWS CDK globally
npm install -g aws-cdk

# Verify installation
cdk --version     # Should be 2.x
```

**📖 Estimated Time:** 15-30 minutes

---

## 2. AWS Account Setup

### Create AWS Account (if needed)

1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the registration process
4. Add payment method (required, but free tier available)

### Create IAM User for Development

**Important:** Don't use root account credentials for development!

1. **Sign in to AWS Console** as root user
2. **Go to IAM** → Users → Create User
3. **User details:**
   - Username: `voislab-dev` (or your name)
   - Access type: ✅ Programmatic access
4. **Set permissions:**
   - Attach existing policies directly
   - Select: `AdministratorAccess` (for initial setup)
   - Note: Reduce permissions after setup (see [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md))
5. **Review and create**
6. **Save credentials:**
   - Access Key ID
   - Secret Access Key
   - ⚠️ You won't see the secret key again!

### Configure AWS CLI

```bash
# Configure AWS credentials
aws configure

# Enter when prompted:
# AWS Access Key ID: [your-access-key-id]
# AWS Secret Access Key: [your-secret-access-key]
# Default region name: us-west-2
# Default output format: json

# Verify configuration
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/voislab-dev"
}
```

**📖 Estimated Time:** 10-15 minutes

**📚 Reference:** [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md)

---

## 3. Local Development Setup

### Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-username/voislab-website.git
cd voislab-website

# Or if you're starting fresh, initialize:
# git init
# git remote add origin https://github.com/your-username/voislab-website.git
```

### Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install
cd ..
```

### Create Local Environment File

```bash
# Copy template
cp .env.example .env.local

# Don't edit yet - we'll get values after deploying backend
```

### Validate Setup

```bash
# Run validation script
./scripts/validate-local-setup.sh
```

Expected output:
```
✓ Node.js installed
✓ npm installed
✓ Dependencies installed
✓ AWS credentials configured
⚠ .env.local needs configuration (expected at this stage)
```

**📖 Estimated Time:** 5-10 minutes

**📚 Reference:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

---

## 4. Backend Deployment

### Deploy Development Backend

```bash
# Navigate to infrastructure directory
cd infrastructure

# Deploy development environment
./deploy-backend.sh dev
```

This script will:
- ✅ Check prerequisites
- ✅ Install dependencies
- ✅ Bootstrap CDK (first time only)
- ✅ Deploy CloudFormation stack
- ✅ Create DynamoDB tables
- ✅ Create S3 buckets
- ✅ Set up CloudFront distribution
- ✅ Configure Lambda functions
- ✅ Output configuration values

**⏱️ Deployment Time:** 5-10 minutes

### Save Backend Configuration

The deployment script outputs environment variables. Copy them:

```bash
# Get configuration for .env.local
./scripts/get-backend-config.sh dev
```

Output example:
```bash
VITE_AWS_REGION=us-west-2
VITE_ENVIRONMENT=dev
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-dev
VITE_S3_MEDIA_BUCKET=voislab-media-dev-123456789012
VITE_CLOUDFRONT_DOMAIN=d1234567890abc.cloudfront.net
```

### Update Local Environment

```bash
# Edit .env.local (from project root)
cd ..
nano .env.local

# Paste the configuration from above
# Save and exit (Ctrl+X, Y, Enter)
```

### Deploy Production Backend (Optional)

```bash
cd infrastructure
./deploy-backend.sh prod
cd ..
```

**📖 Estimated Time:** 10-15 minutes

**📚 Reference:** [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md)

---

## 5. Frontend Deployment

You have two options for frontend deployment:

### Option A: AWS Amplify (Recommended for Production)

#### Step 1: Set Up Amplify App

1. **Go to AWS Amplify Console**
   - https://console.aws.amazon.com/amplify/

2. **Create New App**
   - Click "New app" → "Host web app"
   - Choose "GitHub" as source
   - Authorize AWS Amplify to access your repository
   - Select your VoisLab repository

3. **Configure Build Settings**
   - App name: `voislab-website`
   - Branch: `main` (for production)
   - Build spec: Use `amplify.yml` from repository
   - Click "Next"

4. **Set Environment Variables**
   - Add the variables from your backend deployment:
     ```
     VITE_AWS_REGION=us-west-2
     VITE_ENVIRONMENT=prod
     VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-prod
     VITE_S3_MEDIA_BUCKET=voislab-media-prod-[account-id]
     VITE_CLOUDFRONT_DOMAIN=[cloudfront-domain]
     VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
     VITE_ERROR_REPORTING_ENABLED=true
     VITE_PERFORMANCE_MONITORING_ENABLED=true
     ```

5. **Deploy**
   - Click "Save and deploy"
   - Wait for build to complete (~5 minutes)

6. **Set Up Custom Domain (Optional)**
   - Go to App Settings → Domain management
   - Add your domain
   - Follow DNS configuration instructions

#### Step 2: Set Up Development Branch

1. **Add develop branch**
   - In Amplify Console, click "Connect branch"
   - Select `develop` branch
   - Use same build settings
   - Set environment variables for dev environment

2. **Configure Branch Settings**
   - `main` → Production environment
   - `develop` → Development environment

**📖 Estimated Time:** 15-20 minutes

**📚 Reference:** [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md)

### Option B: Local Development (For Testing)

```bash
# Ensure .env.local is configured (from step 4)
./scripts/validate-local-setup.sh

# Start development server
npm run dev

# Open browser to http://localhost:5173
```

**📖 Estimated Time:** 2 minutes

**📚 Reference:** [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)

---

## 6. Verification & Testing

### Test Local Development

```bash
# Start dev server
npm run dev

# Open http://localhost:5173 in browser
# Open browser console (F12)
# Run integration tests:
testVoisLabComplete()
```

Expected output:
```
✓ AWS Configuration loaded
✓ DynamoDB connection successful
✓ S3 connection successful
✓ Audio playback working
```

### Test Backend Deployment

```bash
# Check DynamoDB table
aws dynamodb describe-table --table-name voislab-audio-metadata-dev

# Check S3 bucket
aws s3 ls s3://voislab-media-dev-[your-account-id]/

# Check CloudFormation stack
aws cloudformation describe-stacks --stack-name VoislabWebsite-dev
```

### Test Amplify Deployment

1. **Check Build Status**
   - Go to Amplify Console
   - Verify build succeeded
   - Check build logs for errors

2. **Test Production URL**
   ```bash
   # Test production site
   curl -I https://main.[app-id].amplifyapp.com
   
   # Test development site
   curl -I https://develop.[app-id].amplifyapp.com
   ```

3. **Run Integration Tests**
   - Open production URL in browser
   - Open browser console
   - Run: `testVoisLabComplete()`

**📖 Estimated Time:** 10-15 minutes

**📚 Reference:** [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md)

---

## 7. Next Steps

### Development Workflow

```bash
# Daily development
git checkout develop
git pull origin develop
npm run dev

# Make changes, test locally
# Commit and push
git add .
git commit -m "Add new feature"
git push origin develop

# Amplify automatically deploys to dev environment
```

### Production Deployment

```bash
# Merge to main for production
git checkout main
git merge develop
git push origin main

# Amplify automatically deploys to production
```

### Monitoring & Maintenance

1. **CloudWatch Dashboards**
   - Monitor backend metrics
   - Set up alarms for errors

2. **Amplify Console**
   - Monitor build status
   - Check deployment logs

3. **Regular Updates**
   - Update dependencies monthly
   - Rotate AWS credentials quarterly
   - Review CloudTrail logs weekly

**📚 References:**
- [CI/CD Setup](CICD_SETUP.md) - Automated deployments
- [Integration Testing](INTEGRATION_TESTING.md) - Testing guide
- [Security Best Practices](SECURITY_BEST_PRACTICES.md) - Security guidelines

---

## Complete Setup Checklist

### Prerequisites ✓
- [ ] Node.js 18+ installed
- [ ] AWS CLI installed
- [ ] Git installed
- [ ] AWS CDK installed
- [ ] jq installed (optional but helpful)

### AWS Account ✓
- [ ] AWS account created
- [ ] IAM user created for development
- [ ] AWS CLI configured with credentials
- [ ] Verified with `aws sts get-caller-identity`

### Local Setup ✓
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env.example` copied to `.env.local`
- [ ] Validation script passes

### Backend Deployment ✓
- [ ] Development backend deployed
- [ ] Production backend deployed (optional)
- [ ] Configuration values saved
- [ ] `.env.local` updated with backend values
- [ ] Backend connectivity tested

### Frontend Deployment ✓
- [ ] Amplify app created
- [ ] GitHub repository connected
- [ ] Environment variables configured
- [ ] Main branch deployed
- [ ] Develop branch deployed (optional)
- [ ] Custom domain configured (optional)

### Verification ✓
- [ ] Local development working (`npm run dev`)
- [ ] Integration tests passing
- [ ] Production site accessible
- [ ] Backend services responding
- [ ] Monitoring dashboards accessible

---

## Troubleshooting

### Common Issues

**"AWS credentials not configured"**
```bash
aws configure
# Enter your access key, secret key, and region
```

**"CDK bootstrap required"**
```bash
cd infrastructure
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-west-2
```

**"Table already exists"**
```bash
# Stack already deployed, just get the outputs
cd infrastructure
cat outputs-dev.json
```

**"Amplify build failed"**
- Check environment variables are set correctly
- Review build logs in Amplify Console
- Verify `amplify.yml` is in repository root

**"Cannot connect to backend from local"**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check .env.local configuration
cat .env.local

# Restart dev server
npm run dev
```

### Getting Help

1. **Check documentation:**
   - [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)
   - [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md)
   - [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md)

2. **Run validation scripts:**
   ```bash
   ./scripts/validate-local-setup.sh
   ./scripts/validate-docs-consistency.sh
   ```

3. **Check AWS resources:**
   ```bash
   aws cloudformation describe-stacks --stack-name VoislabWebsite-dev
   aws dynamodb list-tables
   aws s3 ls
   ```

---

## Estimated Total Time

- **Minimum (existing AWS account, local dev only):** 30-45 minutes
- **Full setup (new AWS account, Amplify deployment):** 1.5-2 hours
- **With custom domain and production:** 2-3 hours

---

## Documentation Index

### Setup & Deployment
1. **[GETTING_STARTED.md](GETTING_STARTED.md)** ← You are here
2. [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) - Local development setup
3. [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md) - AWS Amplify deployment
4. [LOCAL_DEV_QUICKSTART.md](LOCAL_DEV_QUICKSTART.md) - Quick reference

### Operations
5. [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md) - Testing guide
6. [CI/CD_SETUP.md](CICD_SETUP.md) - Automated deployments
7. [TEARDOWN_GUIDE.md](../infrastructure/TEARDOWN_GUIDE.md) - Remove infrastructure

### Security & Best Practices
8. [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md) - Security guidelines
9. [VALIDATION_RESULTS.md](VALIDATION_RESULTS.md) - Documentation validation

### Reference
10. [README.md](../README.md) - Project overview

---

**🎉 Congratulations!** You're now ready to develop and deploy VoisLab.

**Questions?** Review the documentation above or check the troubleshooting section.
