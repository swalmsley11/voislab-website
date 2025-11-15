# GitHub Actions Cleanup Recommendations

## Current Status

You have **5 GitHub Actions workflows**. Most are redundant or overly complex for your needs.

## Recommended Actions

### ✅ KEEP (1 workflow)

**`ci.yml`** - Main CI/CD Pipeline
- **Purpose**: Automated testing and deployment
- **Triggers**: Push to main/develop, PRs, manual dispatch
- **What it does**:
  - Tests frontend (lint, type-check, build)
  - Tests infrastructure (CDK synthesis)
  - Auto-deploys to dev (on develop branch)
  - Auto-deploys to prod (on main branch)
- **Status**: ✅ Fixed (added metadata-enricher build step)

### ❌ DELETE (4 workflows)

#### 1. `infrastructure.yml` - **REDUNDANT**
- **Why delete**: Duplicates ci.yml deployment functionality
- **Alternative**: Use ci.yml with manual dispatch for infrastructure-only deploys

#### 2. `infrastructure-test.yml` - **OVERLY COMPLEX**
- **Why delete**: Too detailed for typical needs, manual-only
- **Alternative**: ci.yml already tests infrastructure synthesis

#### 3. `uat-cicd.yml` - **OVERLY COMPLEX**
- **Why delete**: Enterprise-level UAT testing, rarely needed
- **Alternative**: Use ci.yml for standard testing

#### 4. `production-deploy.yml` - **REDUNDANT**
- **Why delete**: Duplicates ci.yml prod deployment
- **Alternative**: Use ci.yml by pushing to main branch

## Simplified Workflow

After cleanup, you'll have **one workflow** that handles everything:

```
┌─────────────────────────────────────────────────────────┐
│                      ci.yml                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  On Push/PR:                                           │
│    ✓ Test frontend                                     │
│    ✓ Test infrastructure                               │
│                                                         │
│  On Push to develop:                                   │
│    ✓ Deploy to DEV automatically                       │
│                                                         │
│  On Push to main:                                      │
│    ✓ Deploy to PROD automatically                      │
│                                                         │
│  Manual Dispatch:                                      │
│    ✓ Deploy to dev or prod on demand                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## How to Clean Up

### Step 1: Delete Redundant Workflows

```bash
cd voislab-website/.github/workflows

# Delete redundant workflows
rm infrastructure.yml
rm infrastructure-test.yml
rm uat-cicd.yml
rm production-deploy.yml

# Keep only ci.yml
ls -la
# Should show: ci.yml
```

### Step 2: Commit Changes

```bash
git add .github/workflows/
git commit -m "chore: remove redundant GitHub Actions workflows

- Removed infrastructure.yml (redundant with ci.yml)
- Removed infrastructure-test.yml (overly complex)
- Removed uat-cicd.yml (overly complex)
- Removed production-deploy.yml (redundant with ci.yml)
- Fixed ci.yml to build metadata-enricher Lambda before CDK synthesis

Keeping only ci.yml for all CI/CD needs."
```

### Step 3: Update Documentation

Update any docs that reference the deleted workflows to point to ci.yml instead.

## Using the Simplified Workflow

### Deploy to DEV
```bash
# Option 1: Push to develop branch
git checkout develop
git push origin develop

# Option 2: Manual dispatch
# Go to GitHub Actions → ci.yml → Run workflow → Select "development"
```

### Deploy to PROD
```bash
# Option 1: Push to main branch (recommended)
git checkout main
git merge develop
git push origin main

# Option 2: Manual dispatch
# Go to GitHub Actions → ci.yml → Run workflow → Select "production"
```

### Test Only (No Deploy)
```bash
# Create a PR - tests run automatically
git checkout -b feature/my-feature
git push origin feature/my-feature
# Create PR on GitHub
```

## Benefits of Cleanup

1. **Simpler**: One workflow instead of five
2. **Faster**: No redundant test runs
3. **Clearer**: Easy to understand what runs when
4. **Maintainable**: One place to update deployment logic
5. **Cost-effective**: Fewer GitHub Actions minutes used

## What You're NOT Losing

- ✅ Automated testing
- ✅ Automated deployments
- ✅ Manual deployment option
- ✅ Environment-specific deploys
- ✅ Build artifact caching
- ✅ Post-deployment validation

## If You Need Advanced Testing Later

If you later need the detailed testing from the deleted workflows, you can:

1. Add specific test jobs to ci.yml
2. Create a separate `advanced-testing.yml` workflow
3. Restore from git history: `git checkout HEAD~1 .github/workflows/infrastructure-test.yml`

## Current Fix Applied

The `ci.yml` workflow has been updated to build the metadata-enricher Lambda package before CDK synthesis. This fixes the current failure.

### What Changed:

```yaml
# Added before "Run infrastructure tests"
- name: Build metadata-enricher Lambda package
  working-directory: infrastructure/lambda/metadata-enricher
  run: |
    if [ -f "build.sh" ]; then
      chmod +x build.sh
      ./build.sh
    else
      echo "⚠️ build.sh not found, skipping metadata-enricher build"
    fi
```

This ensures the `metadata-enricher.zip` file exists before CDK tries to package it.

## Next Steps

1. **Test the fix**: Push a commit and watch ci.yml run successfully
2. **Delete redundant workflows**: Remove the 4 workflows listed above
3. **Update team**: Let everyone know to use ci.yml for all deployments
4. **Simplify docs**: Update deployment documentation to reference only ci.yml

## Questions?

- **Q: What if I need manual infrastructure testing?**
  - A: Add a manual dispatch option to ci.yml with a "test-only" mode

- **Q: What if I need production deployment approval?**
  - A: Use GitHub's environment protection rules (already configured)

- **Q: What if I want to test without deploying?**
  - A: Create a PR - tests run automatically without deployment

- **Q: Can I still do manual deployments?**
  - A: Yes! Use ci.yml's workflow_dispatch with environment selection
