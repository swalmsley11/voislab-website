# Local Development Quick Start

**TL;DR:** Run VoisLab frontend locally, connected to AWS backend.

## First Time Setup (5 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Configure AWS CLI (if not already done)
aws configure

# 3. Deploy backend to AWS
cd infrastructure
./deploy-backend.sh dev
cd ..

# 4. Get backend configuration
./scripts/get-backend-config.sh dev

# 5. Create .env.local and paste the output from step 4
cp .env.example .env.local
nano .env.local  # Paste configuration

# 6. Validate setup
./scripts/validate-local-setup.sh

# 7. Start dev server
npm run dev
```

## Daily Development

```bash
# Start dev server
npm run dev

# Open http://localhost:5173
```

## Common Commands

```bash
# Validate local setup
./scripts/validate-local-setup.sh

# Get backend config
./scripts/get-backend-config.sh dev

# Run tests in browser console
testVoisLabComplete()

# Deploy backend changes
cd infrastructure && ./deploy-backend.sh dev
```

## Security Checklist

- ✅ `.env.local` is git-ignored (never commit it!)
- ✅ AWS credentials in `~/.aws/credentials` (not in project)
- ✅ Use `.env.example` as template (safe to commit)
- ✅ Never hardcode credentials in code

## Troubleshooting

**Can't connect to AWS?**
```bash
aws sts get-caller-identity  # Check credentials
```

**Environment variables not loading?**
```bash
# Restart dev server (Ctrl+C, then npm run dev)
```

**Backend not found?**
```bash
cd infrastructure
./deploy-backend.sh dev
```

## Full Documentation

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for complete guide.
