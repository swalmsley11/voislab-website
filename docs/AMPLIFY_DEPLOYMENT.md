# VoisLab AWS Amplify + CDK Deployment Guide

## Architecture Overview

**Frontend:** AWS Amplify (React/Vite app)
- `main` branch → Production site
- `develop` branch → Development site
- Automatic CI/CD on git push

**Backend:** AWS CDK (Standalone infrastructure)
- DynamoDB, S3, Lambda functions
- CloudWatch monitoring
- Deployed separately from frontend

## 🚀 Deployment Steps

### **Step 1: Deploy Backend Infrastructure**

#### **Option A: Using Deployment Script (Recommended)**

```bash
# Navigate to infrastructure directory
cd voislab-website/infrastructure

# Deploy development backend
./deploy-backend.sh dev

# Deploy production backend  
./deploy-backend.sh prod
```

The script handles dependency installation, CDK bootstrapping, deployment, and outputs the environment variables you'll need for Amplify.

#### **Option B: Manual CDK Commands**

```bash
# Navigate to infrastructure directory
cd voislab-website/infrastructure

# Install dependencies
npm install

# Bootstrap CDK (one-time setup per account/region)
cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-west-2

# Deploy development backend
cdk deploy VoislabWebsite-dev --context environment=dev --outputs-file outputs-dev.json

# Deploy production backend  
cdk deploy VoislabWebsite-prod --context environment=prod --outputs-file outputs-prod.json
```

### **Step 2: Set Up AWS Amplify App**

#### **Option A: AWS Console (Recommended)**

1. **Go to AWS Amplify Console**
   - Navigate to https://console.aws.amazon.com/amplify/
   - Click "New app" → "Host web app"

2. **Connect Repository**
   - Choose "GitHub" as source
   - Authorize AWS Amplify to access your repository
   - Select your VoisLab repository

3. **Configure Build Settings**
   - **App name:** `voislab-website`
   - **Environment:** `prod` (for main branch)
   - **Build spec:** Use the `amplify.yml` file in your repo
   - **Advanced settings:**
     ```
     VITE_AWS_REGION=us-west-2
     VITE_ENVIRONMENT=prod
     VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-prod
     VITE_S3_MEDIA_BUCKET=voislab-media-prod-[account-id]
     VITE_CLOUDFRONT_DOMAIN=[cloudfront-domain-from-cdk-output]
     VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
     VITE_ERROR_REPORTING_ENABLED=true
     VITE_PERFORMANCE_MONITORING_ENABLED=true
     ```

4. **Set Up Branches**
   - **Production:** `main` branch → `prod` environment
   - **Development:** `develop` branch → `dev` environment

5. **Configure Custom Domain**
   - Add your domain (e.g., `voislab.com`)
   - Amplify will automatically handle SSL certificates
   - Set up subdomains:
     - `voislab.com` → `main` branch
     - `dev.voislab.com` → `develop` branch

#### **Option B: AWS CLI**

```bash
# Create Amplify app
aws amplify create-app \
  --name voislab-website \
  --repository https://github.com/your-username/your-repo \
  --access-token your-github-token \
  --build-spec file://amplify.yml

# Create production branch
aws amplify create-branch \
  --app-id [app-id-from-previous-command] \
  --branch-name main \
  --stage PRODUCTION \
  --enable-auto-build

# Create development branch  
aws amplify create-branch \
  --app-id [app-id] \
  --branch-name develop \
  --stage DEVELOPMENT \
  --enable-auto-build
```

### **Step 3: Configure Environment Variables**

Set these in Amplify Console → App Settings → Environment variables:

#### **Production Environment (main branch):**
```bash
VITE_AWS_REGION=us-west-2
VITE_ENVIRONMENT=prod
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-prod
VITE_S3_MEDIA_BUCKET=voislab-media-prod-[account-id]
VITE_CLOUDFRONT_DOMAIN=[from-cdk-output]
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_ERROR_REPORTING_ENABLED=true
VITE_PERFORMANCE_MONITORING_ENABLED=true
```

#### **Development Environment (develop branch):**
```bash
VITE_AWS_REGION=us-west-2
VITE_ENVIRONMENT=dev
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-dev
VITE_S3_MEDIA_BUCKET=voislab-media-dev-[account-id]
VITE_CLOUDFRONT_DOMAIN=[from-cdk-output]
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_ERROR_REPORTING_ENABLED=true
VITE_PERFORMANCE_MONITORING_ENABLED=true
```

### **Step 4: Set Up Custom Domain**

1. **In Amplify Console:**
   - Go to App Settings → Domain management
   - Click "Add domain"
   - Enter your domain (e.g., `voislab.com`)
   - Amplify will create SSL certificate automatically

2. **Configure Subdomains:**
   - `voislab.com` → `main` branch (production)
   - `www.voislab.com` → `main` branch (production)
   - `dev.voislab.com` → `develop` branch (development)

3. **Update Route 53 (if needed):**
   - Amplify will provide DNS records
   - Add them to your Route 53 hosted zone

### **Step 5: Deploy and Test**

```bash
# Push to trigger deployments
git checkout develop
git push origin develop  # Triggers dev deployment

git checkout main  
git push origin main     # Triggers prod deployment
```

## 🔧 **Backend Infrastructure Details**

### **What CDK Deploys:**
- ✅ DynamoDB table for audio metadata
- ✅ S3 buckets (upload, media storage)
- ✅ Lambda functions (audio processing, format conversion)
- ✅ CloudFront distribution for media delivery
- ✅ CloudWatch monitoring and alarms
- ✅ SNS topics for notifications
- ✅ IAM roles and policies

### **CDK Outputs (for Amplify env vars):**
After CDK deployment, get these values:
```bash
# Get CDK outputs (automatically created by deploy-backend.sh)
cd infrastructure
cat outputs-dev.json   # For development
cat outputs-prod.json  # For production

# Or deploy manually with outputs
cdk deploy VoislabWebsite-dev --context environment=dev --outputs-file outputs-dev.json

# Key outputs for Amplify:
# - MediaDistributionDomainName
# - AudioMetadataTableName  
# - MediaBucketName
```

## 📋 **Deployment Checklist**

### **Backend (CDK):**
- [ ] AWS CLI configured
- [ ] CDK installed and bootstrapped
- [ ] Development stack deployed
- [ ] Production stack deployed
- [ ] CloudWatch dashboards accessible
- [ ] S3 buckets created and accessible

### **Frontend (Amplify):**
- [ ] Amplify app created
- [ ] GitHub repository connected
- [ ] Build settings configured (`amplify.yml`)
- [ ] Environment variables set for both branches
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Both branches deploying successfully

### **Integration:**
- [ ] Frontend can connect to backend services
- [ ] Audio streaming working
- [ ] Analytics tracking functional
- [ ] Monitoring dashboards showing data

## 🚦 **CI/CD Workflow**

### **Development Workflow:**
```bash
# Work on features
git checkout develop
# Make changes
git add .
git commit -m "Add new feature"
git push origin develop
# → Automatically deploys to dev.voislab.com
```

### **Production Deployment:**
```bash
# Merge to main for production
git checkout main
git merge develop
git push origin main
# → Automatically deploys to voislab.com
```

### **Rollback Process:**
```bash
# In Amplify Console:
# 1. Go to App → Deployments
# 2. Find previous successful deployment
# 3. Click "Redeploy this version"
```

## 🔍 **Monitoring and Validation**

### **Post-Deployment Checks:**
```bash
# Test development site
curl -I https://dev.voislab.com

# Test production site  
curl -I https://voislab.com

# Run UAT against production
ENVIRONMENT=prod ./scripts/run-uat.sh
```

### **Monitoring Dashboards:**
- **Amplify:** Build logs and deployment status
- **CloudWatch:** Backend service metrics
- **Google Analytics:** User behavior and performance

## 🆘 **Troubleshooting**

### **Common Issues:**

**Build Failures:**
- Check Amplify build logs in console
- Verify environment variables are set
- Ensure `amplify.yml` is in repository root

**Backend Connection Issues:**
- Verify CDK stack deployed successfully
- Check environment variables match CDK outputs
- Ensure IAM permissions are correct

**Domain Issues:**
- Verify DNS records in Route 53
- Check SSL certificate status in Amplify
- Allow time for DNS propagation (up to 48 hours)

### **Useful Commands:**
```bash
# Check Amplify app status
aws amplify get-app --app-id [your-app-id]

# List deployments
aws amplify list-jobs --app-id [your-app-id] --branch-name main

# Get CDK stack outputs
aws cloudformation describe-stacks --stack-name VoislabWebsite-prod

# Teardown infrastructure (see infrastructure/TEARDOWN_GUIDE.md)
cd infrastructure
./teardown-stack.sh dev   # Remove development stack
./teardown-stack.sh prod  # Remove production stack
```

---

## 🎯 **Quick Start Summary**

1. **Deploy backend:** `cd infrastructure && ./deploy-backend.sh dev && ./deploy-backend.sh prod`
2. **Create Amplify app** in AWS Console
3. **Connect GitHub repository**
4. **Set environment variables** from CDK outputs (displayed by deploy script)
5. **Configure custom domain**
6. **Push to main/develop** to trigger deployments

Your VoisLab website will be live with automatic CI/CD! 🚀

## 📚 **Related Documentation**

- [Main README](../README.md) - Project overview and quick start
- [Teardown Guide](../infrastructure/TEARDOWN_GUIDE.md) - How to safely remove infrastructure
- [Integration Testing](INTEGRATION_TESTING.md) - Testing deployment and integration
- [CI/CD Setup](CICD_SETUP.md) - Automated deployment pipelines