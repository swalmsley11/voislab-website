# VoisLab Local Development Guide

This guide shows you how to run the VoisLab frontend locally while connecting to your AWS backend infrastructure.

## Prerequisites

- Node.js 18+ and npm installed
- AWS CLI configured with credentials
- Backend infrastructure deployed to AWS (see [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md))
- Git configured with `.gitignore` (environment files are excluded)

## Security First 🔒

**IMPORTANT:** Never commit sensitive credentials to git!

- ✅ `.env.local` is in `.gitignore` (already configured)
- ✅ Use AWS CLI credentials (stored in `~/.aws/credentials`)
- ✅ Never hardcode AWS credentials in code
- ✅ Use environment-specific configurations

## Quick Start

### 1. Install Dependencies

```bash
cd voislab-website
npm install
```

### 2. Configure AWS CLI

If you haven't already, configure your AWS credentials:

```bash
aws configure
```

This stores credentials securely in `~/.aws/credentials` (not in your project).

### 3. Get Backend Configuration

After deploying your backend, get the configuration values:

```bash
cd infrastructure
cat outputs-dev.json
```

You'll see output like:
```json
{
  "VoislabWebsite-dev": {
    "AudioMetadataTableName": "voislab-audio-metadata-dev",
    "MediaBucketName": "voislab-media-dev-123456789012",
    "MediaDistributionDomainName": "d1234567890abc.cloudfront.net"
  }
}
```

### 4. Create Local Environment File

Create `.env.local` in the project root (this file is git-ignored):

```bash
# Copy the template
cp .env.example .env.local

# Edit with your values
nano .env.local
```

### 5. Start Development Server

```bash
npm run dev
```

Your app will be available at `http://localhost:5173`

## Environment Configuration

### .env.local File Structure

Create `.env.local` with these variables (use values from `outputs-dev.json`):

```bash
# AWS Configuration
VITE_AWS_REGION=us-west-2
VITE_ENVIRONMENT=dev

# Backend Resources (from CDK outputs)
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-dev
VITE_S3_MEDIA_BUCKET=voislab-media-dev-[your-account-id]
VITE_CLOUDFRONT_DOMAIN=[your-cloudfront-domain]

# Optional: Analytics (use test ID for local dev)
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Optional: Feature Flags
VITE_ERROR_REPORTING_ENABLED=false
VITE_PERFORMANCE_MONITORING_ENABLED=false
```

**Note:** Replace `[your-account-id]` and `[your-cloudfront-domain]` with actual values from CDK outputs.

### Environment File Template

We'll create a template file that can be committed to git:

**`.env.example`** (safe to commit):
```bash
# AWS Configuration
VITE_AWS_REGION=us-west-2
VITE_ENVIRONMENT=dev

# Backend Resources - Get these from: infrastructure/outputs-dev.json
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-dev
VITE_S3_MEDIA_BUCKET=voislab-media-dev-YOUR_ACCOUNT_ID
VITE_CLOUDFRONT_DOMAIN=YOUR_CLOUDFRONT_DOMAIN.cloudfront.net

# Analytics - Replace with your Google Analytics ID
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Feature Flags
VITE_ERROR_REPORTING_ENABLED=false
VITE_PERFORMANCE_MONITORING_ENABLED=false
```

## AWS Authentication

### How It Works

Your local app authenticates to AWS using credentials from `~/.aws/credentials`:

1. AWS SDK automatically looks for credentials in standard locations
2. No need to set `VITE_AWS_ACCESS_KEY_ID` or `VITE_AWS_SECRET_ACCESS_KEY`
3. Credentials never appear in your code or environment files

### Required IAM Permissions

Your AWS user/role needs these permissions for local development:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:us-west-2:*:table/voislab-audio-metadata-dev"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::voislab-media-dev-*/*"
    }
  ]
}
```

### Testing AWS Connection

```bash
# Test AWS CLI access
aws sts get-caller-identity

# Test DynamoDB access
aws dynamodb describe-table --table-name voislab-audio-metadata-dev

# Test S3 access
aws s3 ls s3://voislab-media-dev-[your-account-id]/
```

## Development Workflow

### Typical Development Session

```bash
# 1. Pull latest code
git pull origin develop

# 2. Install/update dependencies
npm install

# 3. Ensure backend is deployed
cd infrastructure
./deploy-backend.sh dev
cd ..

# 4. Start dev server
npm run dev

# 5. Open browser to http://localhost:5173
```

### Before Committing

Always run these checks before pushing code (CI will fail if these don't pass):

```bash
# Format code with Prettier
npm run format

# Check formatting (what CI runs)
npm run format:check

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Type check
npm run type-check

# Build to ensure no errors
npm run build
```

**Pro tip:** Run all checks at once:
```bash
npm run format && npm run lint && npm run type-check && npm run build
```

### Hot Module Replacement (HMR)

Vite provides instant updates when you edit files:
- Edit React components → instant browser update
- Edit CSS → instant style update
- Edit TypeScript → instant recompile

### Testing Against Different Backends

**Connect to Dev Backend:**
```bash
# .env.local
VITE_ENVIRONMENT=dev
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-dev
VITE_S3_MEDIA_BUCKET=voislab-media-dev-[account-id]
```

**Connect to Prod Backend (read-only testing):**
```bash
# .env.local
VITE_ENVIRONMENT=prod
VITE_DYNAMODB_TABLE_NAME=voislab-audio-metadata-prod
VITE_S3_MEDIA_BUCKET=voislab-media-prod-[account-id]
```

**Important:** Restart dev server after changing `.env.local`

## Browser Developer Tools

### Testing Integration

Open browser console and run:

```javascript
// Test complete integration
testVoisLabComplete()

// Test basic integration
testVoisLabIntegration()

// Test end-to-end workflows
testVoisLabE2E()

// Test environment configuration
testVoisLabDevProd()
```

### Debugging AWS Calls

Enable verbose logging in browser console:

```javascript
// Check AWS configuration
console.log('AWS Config:', {
  region: import.meta.env.VITE_AWS_REGION,
  environment: import.meta.env.VITE_ENVIRONMENT,
  table: import.meta.env.VITE_DYNAMODB_TABLE_NAME,
  bucket: import.meta.env.VITE_S3_MEDIA_BUCKET
})
```

## Common Issues

### Issue: "Access Denied" Errors

**Cause:** AWS credentials don't have required permissions

**Solution:**
```bash
# Check your AWS identity
aws sts get-caller-identity

# Verify IAM permissions in AWS Console
# Add required DynamoDB and S3 permissions
```

### Issue: "Table Not Found" or "Bucket Not Found"

**Cause:** Backend not deployed or wrong environment variables

**Solution:**
```bash
# Deploy backend
cd infrastructure
./deploy-backend.sh dev

# Update .env.local with correct values from outputs-dev.json
```

### Issue: Environment Variables Not Loading

**Cause:** Vite caches environment variables

**Solution:**
```bash
# Stop dev server (Ctrl+C)
# Restart dev server
npm run dev
```

### Issue: CORS Errors

**Cause:** CloudFront or S3 CORS configuration

**Solution:**
- Check CloudFront distribution settings
- Verify S3 bucket CORS policy
- Ensure `Access-Control-Allow-Origin` headers are set

### Issue: Credentials Not Found

**Cause:** AWS CLI not configured

**Solution:**
```bash
# Configure AWS CLI
aws configure

# Or set AWS profile
export AWS_PROFILE=your-profile-name
```

## Security Best Practices

### ✅ DO:
- Use `.env.local` for local configuration (git-ignored)
- Store AWS credentials in `~/.aws/credentials`
- Use IAM roles with least privilege
- Rotate AWS credentials regularly
- Use different AWS accounts for dev/prod
- Review `.gitignore` before committing

### ❌ DON'T:
- Commit `.env.local` to git
- Hardcode AWS credentials in code
- Use production credentials for development
- Share AWS credentials via chat/email
- Commit `outputs-*.json` files with sensitive data
- Use root AWS account credentials

## Environment Files Reference

| File | Purpose | Git Status |
|------|---------|------------|
| `.env.example` | Template with placeholder values | ✅ Committed |
| `.env.local` | Your actual local configuration | ❌ Git-ignored |
| `.env` | Shared defaults (if needed) | ⚠️ Careful - no secrets |
| `outputs-dev.json` | CDK deployment outputs | ❌ Git-ignored |
| `outputs-prod.json` | CDK deployment outputs | ❌ Git-ignored |

## Helper Scripts

### Get Backend Configuration

```bash
#!/bin/bash
# scripts/get-backend-config.sh

ENVIRONMENT=${1:-dev}

echo "Backend Configuration for $ENVIRONMENT:"
echo ""

if [ -f "infrastructure/outputs-$ENVIRONMENT.json" ]; then
    cat "infrastructure/outputs-$ENVIRONMENT.json" | jq -r "
        .\"VoislabWebsite-$ENVIRONMENT\" | to_entries[] | 
        \"VITE_\(.key | ascii_upcase)=\(.value)\"
    "
else
    echo "Error: outputs-$ENVIRONMENT.json not found"
    echo "Run: cd infrastructure && ./deploy-backend.sh $ENVIRONMENT"
fi
```

### Validate Local Setup

```bash
#!/bin/bash
# scripts/validate-local-setup.sh

echo "Validating local development setup..."

# Check .env.local exists
if [ ! -f ".env.local" ]; then
    echo "❌ .env.local not found"
    echo "   Create it from .env.example"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo "❌ AWS credentials not configured"
    echo "   Run: aws configure"
    exit 1
fi

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "❌ Dependencies not installed"
    echo "   Run: npm install"
    exit 1
fi

echo "✅ Local development setup is valid"
```

## Next Steps

1. **Start developing:** Make changes and see them instantly
2. **Test integration:** Use browser console test functions
3. **Deploy changes:** Push to GitHub to trigger Amplify deployment
4. **Monitor:** Check CloudWatch for backend metrics

## Related Documentation

- [Main README](../README.md) - Project overview
- [Amplify Deployment](AMPLIFY_DEPLOYMENT.md) - Backend deployment
- [Integration Testing](INTEGRATION_TESTING.md) - Testing guide
- [CI/CD Setup](CICD_SETUP.md) - Automated deployments

---

**Happy coding!** 🚀 Your local environment is now connected to AWS backend.
