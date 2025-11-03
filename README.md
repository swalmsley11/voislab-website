# VoisLab Website

A modern, serverless web application for VoisLab audio content creation business, built with React TypeScript and AWS CDK.

## Project Structure

```
voislab-website/
├── src/                    # React TypeScript frontend
├── infrastructure/         # AWS CDK infrastructure code
├── .github/workflows/      # CI/CD pipelines
├── scripts/               # Development scripts
└── docker-compose.dev.yml # Local AWS services
```

## Prerequisites

- Node.js 18+
- AWS CLI configured
- Docker and Docker Compose (for local development)
- AWS CDK CLI (`npm install -g aws-cdk`)

## Quick Start

### 1. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install infrastructure dependencies
cd infrastructure
npm install
cd ..
```

### 2. Local Development Setup

```bash
# Start local AWS services (LocalStack)
./scripts/setup-local-aws.sh

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

### 3. Deploy Infrastructure

```bash
# Bootstrap CDK (first time only)
cd infrastructure
npm run bootstrap

# Deploy to development environment
npm run deploy:dev

# Deploy to production environment
npm run deploy:prod
```

## Development Workflow

### Frontend Development

```bash
# Start development server
npm run dev

# Run linting
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Type checking
npm run type-check

# Build for production
npm run build
```

### Infrastructure Development

```bash
cd infrastructure

# Build TypeScript
npm run build

# Run tests
npm test

# Synthesize CloudFormation
npm run synth

# View differences
npm run diff
```

### Local AWS Services

The project uses LocalStack for local AWS service emulation:

- **LocalStack Dashboard**: http://localhost:4566
- **DynamoDB Admin**: http://localhost:8001
- **S3 Buckets**: 
  - Website: `voislab-website-dev-local`
  - Media: `voislab-media-dev-local`

## CI/CD Pipeline

The project uses GitHub Actions for automated testing and deployment:

### Branches
- `develop` → Automatically deploys to DEV environment
- `main` → Automatically deploys to PROD environment (with manual approval)

### Required Secrets
Configure these in GitHub repository settings:

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

### Workflow Steps
1. **Test Frontend**: ESLint, Prettier, TypeScript, Build
2. **Test Infrastructure**: Jest tests, CDK synthesis
3. **Deploy DEV**: Automatic on `develop` branch
4. **Deploy PROD**: Manual approval required for `main` branch

## Architecture

- **Frontend**: React TypeScript with Vite
- **Hosting**: AWS S3 + CloudFront CDN
- **Infrastructure**: AWS CDK (TypeScript)
- **CI/CD**: GitHub Actions
- **Local Development**: LocalStack + Docker Compose

## Environment Configuration

### Development
- LocalStack for AWS services
- Hot reloading with Vite
- Local S3 buckets and DynamoDB

### Production
- AWS managed services
- CloudFront global CDN
- Separate DEV/PROD environments

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `./scripts/setup-local-aws.sh` - Setup local AWS environment

## Contributing

1. Create feature branch from `develop`
2. Make changes and test locally
3. Push to feature branch (triggers CI tests)
4. Create PR to `develop` for DEV deployment
5. After testing, create PR to `main` for PROD deployment