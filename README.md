# VoisLab Website

Professional audio content creation and music production website built with React, TypeScript, and AWS.

---

## 🚀 New to VoisLab?

**Start here:** [Getting Started Guide](docs/GETTING_STARTED.md)

Complete setup from zero to production in ~2 hours. Covers:
- Prerequisites installation
- AWS account setup
- Backend deployment
- Frontend deployment
- Local development

---

## 🏗️ Architecture

**Frontend:** AWS Amplify (React + Vite)
- Automatic CI/CD from GitHub
- `main` branch → Production (`voislab.com`)
- `develop` branch → Development (`dev.voislab.com`)

**Backend:** AWS CDK (Standalone infrastructure)
- DynamoDB for metadata storage
- S3 + CloudFront for media delivery
- Lambda functions for audio processing
- CloudWatch monitoring and alerting

## 🚀 Quick Start

### Local Development

Run the frontend locally while connecting to AWS backend:

```bash
# Install dependencies
npm install

# Set up local environment (first time only)
cp .env.example .env.local
# Edit .env.local with your backend configuration

# Validate setup
./scripts/validate-local-setup.sh

# Start development server
npm run dev

# Run integration tests in browser console
testVoisLabComplete()
```

See [Local Development Guide](docs/LOCAL_DEVELOPMENT.md) for detailed setup instructions.

### Backend Deployment
```bash
# Deploy backend infrastructure (from project root)
cd infrastructure
./deploy-backend.sh dev    # Development
./deploy-backend.sh prod   # Production

# Or manually with CDK
cdk deploy VoislabWebsite-dev --context environment=dev
cdk deploy VoislabWebsite-prod --context environment=prod
```

### Frontend Deployment
1. **Set up AWS Amplify** (one-time):
   - Go to AWS Amplify Console
   - Connect your GitHub repository
   - Configure build settings using `amplify.yml`

2. **Deploy automatically**:
   ```bash
   git push origin develop  # → dev.voislab.com
   git push origin main     # → voislab.com
   ```

## 📁 Project Structure

```
voislab-website/
├── src/                    # React frontend source
│   ├── components/         # UI components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # AWS service integrations
│   └── utils/             # Utilities and testing
├── infrastructure/        # AWS CDK backend
│   ├── lib/              # CDK stack definitions
│   ├── lambda/           # Lambda function code
│   └── deploy-backend.sh # Deployment script
├── docs/                 # Documentation
├── scripts/              # Validation and testing scripts
└── amplify.yml          # Amplify build configuration
```

## 🔧 Configuration

### Environment Variables (Amplify)
Set these in Amplify Console → Environment variables:

**Production:**
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

**Development:**
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

## 🧪 Testing

### Automated Testing
```bash
# Run integration validation
./scripts/validate-integration.sh

# Run comprehensive UAT
./scripts/run-uat.sh

# Node.js integration tests
node test-integration-node.cjs
```

### Browser Testing
Open developer console and run:
```javascript
testVoisLabComplete()      // All tests
testVoisLabIntegration()   // Basic integration
testVoisLabE2E()          // End-to-end workflows
testVoisLabDevProd()      // Environment validation
```

## 📊 Monitoring

- **CloudWatch Dashboards:** Backend service metrics
- **Google Analytics:** User behavior and performance
- **Amplify Console:** Build logs and deployment status
- **Error Tracking:** Automatic error reporting and alerting

## 🔒 Security Features

- HTTPS enforcement with automatic SSL certificates
- Content Security Policy (CSP) headers
- S3 bucket policies with least privilege access
- CloudFront signed URLs for secure content delivery
- Input validation and sanitization

## 📚 Documentation

**[📖 Complete Documentation Index](docs/INDEX.md)** - Browse all documentation

### Getting Started
- **[Getting Started Guide](docs/GETTING_STARTED.md)** ⭐ Start here for complete setup
- [Local Development Guide](docs/LOCAL_DEVELOPMENT.md) - Run frontend locally with AWS backend
- [Local Dev Quickstart](docs/LOCAL_DEV_QUICKSTART.md) - Quick reference for daily development

### Deployment
- [Amplify Deployment Guide](docs/AMPLIFY_DEPLOYMENT.md) - Complete AWS Amplify + CDK setup
- [CI/CD Setup Guide](docs/CICD_SETUP.md) - Automated deployment pipelines
- [Teardown Guide](infrastructure/TEARDOWN_GUIDE.md) - Safely remove infrastructure

### Testing & Security
- [Integration Testing Guide](docs/INTEGRATION_TESTING.md) - Testing and validation
- [Security Best Practices](docs/SECURITY_BEST_PRACTICES.md) - Security guidelines

## 🎵 Features

- **Audio Streaming:** High-quality audio playback with format fallbacks
- **Music Library:** Searchable and filterable track collection
- **Streaming Platform Integration:** Links to Spotify, Apple Music, etc.
- **Responsive Design:** Mobile-first, accessible interface
- **SEO Optimized:** Meta tags, structured data, sitemap
- **PWA Ready:** Service worker, offline capability
- **Analytics:** Comprehensive user behavior tracking

## 🚦 CI/CD Workflow

### Development
```bash
git checkout develop
# Make changes
git commit -m "Add feature"
git push origin develop
# → Automatically deploys to dev.voislab.com
```

### Production
```bash
git checkout main
git merge develop
git push origin main
# → Automatically deploys to voislab.com
```

## 🆘 Support

- **Issues:** Create GitHub issues for bugs or feature requests
- **Documentation:** Check the `docs/` directory
- **Monitoring:** Use CloudWatch dashboards for system health
- **Logs:** Check Amplify Console for build logs

---

**VoisLab** - Professional audio content creation and music production platform.

Built with ❤️ using React, TypeScript, AWS Amplify, and AWS CDK.