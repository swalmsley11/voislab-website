# VoisLab Documentation Flow

Visual guide to navigating VoisLab documentation.

---

## 📊 Documentation Hierarchy

```
README.md (Project Overview)
    ↓
    ├─→ docs/INDEX.md (Complete Documentation Index)
    │
    └─→ docs/GETTING_STARTED.md ⭐ START HERE
            │
            ├─→ Prerequisites Setup
            │   └─→ Install Node.js, AWS CLI, CDK
            │
            ├─→ AWS Account Setup
            │   └─→ Create IAM user, configure credentials
            │
            ├─→ Local Development Setup
            │   ├─→ docs/LOCAL_DEVELOPMENT.md (detailed)
            │   └─→ docs/LOCAL_DEV_QUICKSTART.md (quick ref)
            │
            ├─→ Backend Deployment
            │   └─→ docs/AMPLIFY_DEPLOYMENT.md
            │       └─→ infrastructure/TEARDOWN_GUIDE.md (cleanup)
            │
            ├─→ Frontend Deployment
            │   └─→ docs/AMPLIFY_DEPLOYMENT.md
            │       └─→ docs/CICD_SETUP.md (automation)
            │
            └─→ Verification & Testing
                └─→ docs/INTEGRATION_TESTING.md

Cross-cutting concerns:
    └─→ docs/SECURITY_BEST_PRACTICES.md (read early!)
```

---

## 🎯 User Journey Maps

### Journey 1: New Developer (First Day)

```
START
  ↓
[README.md] - "What is VoisLab?"
  ↓
[GETTING_STARTED.md] - "How do I set this up?"
  ↓
Install Prerequisites (Node, AWS CLI, etc.)
  ↓
Set up AWS Account
  ↓
[LOCAL_DEVELOPMENT.md] - "How do I develop locally?"
  ↓
Deploy Backend (infrastructure/deploy-backend.sh)
  ↓
Configure .env.local
  ↓
Run: npm run dev
  ↓
SUCCESS: Local development working!
  ↓
[SECURITY_BEST_PRACTICES.md] - "What should I know about security?"
  ↓
READY TO DEVELOP
```

### Journey 2: Daily Development

```
START
  ↓
[LOCAL_DEV_QUICKSTART.md] - Quick commands
  ↓
npm run dev
  ↓
Make changes
  ↓
Test locally (testVoisLabComplete())
  ↓
[INTEGRATION_TESTING.md] - Run tests
  ↓
git commit & push
  ↓
[CICD_SETUP.md] - Automatic deployment
  ↓
Verify in dev environment
  ↓
DONE
```

### Journey 3: Production Deployment

```
START
  ↓
[AMPLIFY_DEPLOYMENT.md] - "How do I deploy?"
  ↓
Deploy Backend (prod)
  ↓
Set up Amplify App
  ↓
Configure Environment Variables
  ↓
Connect GitHub Repository
  ↓
[CICD_SETUP.md] - Set up automation
  ↓
Deploy to Production
  ↓
[INTEGRATION_TESTING.md] - Verify deployment
  ↓
Monitor (CloudWatch, Amplify Console)
  ↓
PRODUCTION LIVE
```

### Journey 4: Troubleshooting

```
PROBLEM ENCOUNTERED
  ↓
Check relevant guide's troubleshooting section:
  ├─→ [GETTING_STARTED.md#troubleshooting]
  ├─→ [LOCAL_DEVELOPMENT.md#common-issues]
  ├─→ [AMPLIFY_DEPLOYMENT.md#troubleshooting]
  └─→ [INTEGRATION_TESTING.md]
  ↓
Run validation scripts:
  ├─→ ./scripts/validate-local-setup.sh
  └─→ ./scripts/validate-docs-consistency.sh
  ↓
Check AWS resources:
  ├─→ CloudWatch Logs
  ├─→ CloudFormation Stacks
  └─→ Amplify Console
  ↓
Still stuck?
  └─→ Create GitHub Issue
  ↓
PROBLEM RESOLVED
```

---

## 📚 Documentation Dependencies

### Core Documents (Read First)
```
GETTING_STARTED.md
    ├── References: LOCAL_DEVELOPMENT.md
    ├── References: AMPLIFY_DEPLOYMENT.md
    ├── References: SECURITY_BEST_PRACTICES.md
    └── References: INTEGRATION_TESTING.md
```

### Development Documents
```
LOCAL_DEVELOPMENT.md
    ├── Requires: GETTING_STARTED.md (prerequisites)
    ├── References: SECURITY_BEST_PRACTICES.md
    └── References: INTEGRATION_TESTING.md

LOCAL_DEV_QUICKSTART.md
    └── Summarizes: LOCAL_DEVELOPMENT.md
```

### Deployment Documents
```
AMPLIFY_DEPLOYMENT.md
    ├── Requires: GETTING_STARTED.md (AWS setup)
    ├── References: LOCAL_DEVELOPMENT.md
    ├── References: CICD_SETUP.md
    └── References: TEARDOWN_GUIDE.md

CICD_SETUP.md
    └── Requires: AMPLIFY_DEPLOYMENT.md
```

### Testing & Security
```
INTEGRATION_TESTING.md
    ├── Requires: LOCAL_DEVELOPMENT.md
    └── Requires: AMPLIFY_DEPLOYMENT.md

SECURITY_BEST_PRACTICES.md
    └── Referenced by: ALL documents
```

---

## 🔄 Document Update Flow

```
Code Change
    ↓
Update relevant documentation
    ↓
Update cross-references
    ↓
Run: ./scripts/validate-docs-consistency.sh
    ↓
Update INDEX.md if needed
    ↓
Update README.md if needed
    ↓
Commit documentation with code
```

---

## 🎓 Learning Paths

### Path 1: Frontend Developer
```
Week 1:
  Day 1-2: GETTING_STARTED.md
  Day 3-4: LOCAL_DEVELOPMENT.md
  Day 5:   SECURITY_BEST_PRACTICES.md

Week 2:
  Daily:   LOCAL_DEV_QUICKSTART.md (reference)
  As needed: INTEGRATION_TESTING.md
```

### Path 2: Full Stack Developer
```
Week 1:
  Day 1-2: GETTING_STARTED.md
  Day 3:   LOCAL_DEVELOPMENT.md
  Day 4:   AMPLIFY_DEPLOYMENT.md
  Day 5:   SECURITY_BEST_PRACTICES.md

Week 2:
  Day 1-2: CICD_SETUP.md
  Day 3-4: INTEGRATION_TESTING.md
  Day 5:   Practice deployments
```

### Path 3: DevOps Engineer
```
Week 1:
  Day 1:   GETTING_STARTED.md
  Day 2:   AMPLIFY_DEPLOYMENT.md
  Day 3:   CICD_SETUP.md
  Day 4:   INTEGRATION_TESTING.md
  Day 5:   SECURITY_BEST_PRACTICES.md

Week 2:
  Day 1:   TEARDOWN_GUIDE.md
  Day 2-5: Set up monitoring, alerts, backups
```

---

## 📖 Quick Reference Matrix

| I want to... | Read this... | Time |
|--------------|--------------|------|
| Set up from scratch | GETTING_STARTED.md | 1-2 hrs |
| Develop locally | LOCAL_DEVELOPMENT.md | 30 min |
| Quick daily commands | LOCAL_DEV_QUICKSTART.md | 5 min |
| Deploy backend | AMPLIFY_DEPLOYMENT.md | 45 min |
| Deploy frontend | AMPLIFY_DEPLOYMENT.md | 30 min |
| Set up CI/CD | CICD_SETUP.md | 30 min |
| Test deployment | INTEGRATION_TESTING.md | 20 min |
| Learn security | SECURITY_BEST_PRACTICES.md | 15 min |
| Remove infrastructure | TEARDOWN_GUIDE.md | 10 min |
| Browse all docs | INDEX.md | 5 min |

---

## 🔍 Documentation Search Strategy

### By Role

**Frontend Developer:**
1. GETTING_STARTED.md
2. LOCAL_DEVELOPMENT.md
3. LOCAL_DEV_QUICKSTART.md
4. INTEGRATION_TESTING.md

**Backend Developer:**
1. GETTING_STARTED.md
2. AMPLIFY_DEPLOYMENT.md
3. LOCAL_DEVELOPMENT.md
4. INTEGRATION_TESTING.md

**DevOps Engineer:**
1. GETTING_STARTED.md
2. AMPLIFY_DEPLOYMENT.md
3. CICD_SETUP.md
4. TEARDOWN_GUIDE.md
5. SECURITY_BEST_PRACTICES.md

**QA Engineer:**
1. GETTING_STARTED.md
2. INTEGRATION_TESTING.md
3. LOCAL_DEVELOPMENT.md

### By Task

**First time setup:**
→ GETTING_STARTED.md

**Daily development:**
→ LOCAL_DEV_QUICKSTART.md

**Deployment:**
→ AMPLIFY_DEPLOYMENT.md

**Testing:**
→ INTEGRATION_TESTING.md

**Troubleshooting:**
→ Check relevant doc's troubleshooting section

**Security question:**
→ SECURITY_BEST_PRACTICES.md

**Cleanup:**
→ TEARDOWN_GUIDE.md

---

## 📊 Documentation Metrics

### Coverage
- ✅ Setup & Installation: 100%
- ✅ Development: 100%
- ✅ Deployment: 100%
- ✅ Testing: 100%
- ✅ Security: 100%
- ✅ Operations: 100%

### Validation
- ✅ All docs cross-referenced
- ✅ Consistency validated
- ✅ Commands tested
- ✅ Examples verified

### Maintenance
- Last full review: 2025-11-09
- Next review: 2025-12-09
- Update frequency: As needed

---

**Navigation Tip:** Use the [Documentation Index](INDEX.md) to browse all available documentation.
