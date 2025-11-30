# VoisLab Documentation Index

Complete guide to VoisLab development, deployment, and operations.

---

## 🎯 Start Here

### New to VoisLab?
**[Getting Started Guide](GETTING_STARTED.md)** - Complete setup from scratch (1-2 hours)

### Quick References
- [Local Dev Quickstart](LOCAL_DEV_QUICKSTART.md) - Daily development commands
- [Main README](../README.md) - Project overview

---

## 📖 Documentation by Topic

### 1. Setup & Installation

| Document | Purpose | Time | Audience |
|----------|---------|------|----------|
| **[Getting Started](GETTING_STARTED.md)** | Complete setup from zero | 1-2 hrs | New developers |
| [Local Development](LOCAL_DEVELOPMENT.md) | Local dev environment setup | 30 min | All developers |
| [Local Dev Quickstart](LOCAL_DEV_QUICKSTART.md) | Quick reference | 5 min | Daily use |

### 2. Deployment

| Document | Purpose | Time | Audience |
|----------|---------|------|----------|
| [Amplify Deployment](AMPLIFY_DEPLOYMENT.md) | AWS Amplify + CDK setup | 45 min | DevOps, New setup |
| [CI/CD Setup](CICD_SETUP.md) | Automated deployments | 30 min | DevOps |
| [Teardown Guide](../infrastructure/TEARDOWN_GUIDE.md) | Remove infrastructure | 10 min | DevOps |

### 3. Testing & Validation

| Document | Purpose | Time | Audience |
|----------|---------|------|----------|
| [Integration Testing](INTEGRATION_TESTING.md) | Test deployment | 20 min | QA, Developers |
| [Validation Results](VALIDATION_RESULTS.md) | Doc consistency checks | 5 min | All |
| [Metadata Verification](METADATA_VERIFICATION.md) | Verify & fix metadata | 5-10 min | Operations, Developers |
| [Metadata Enrichment](METADATA_ENRICHMENT.md) | Extract embedded tags | 10 min | All developers |

### 4. Security & Best Practices

| Document | Purpose | Time | Audience |
|----------|---------|------|----------|
| [Security Best Practices](SECURITY_BEST_PRACTICES.md) | Security guidelines | 15 min | All developers |
| [Deployment Inconsistencies](DEPLOYMENT_INCONSISTENCIES.md) | Fixed issues log | 5 min | Reference |

---

## 🔄 Common Workflows

### First Time Setup
1. [Getting Started](GETTING_STARTED.md) - Follow soup-to-nuts guide
2. [Local Development](LOCAL_DEVELOPMENT.md) - Set up local environment
3. [Security Best Practices](SECURITY_BEST_PRACTICES.md) - Review security

### Daily Development
1. [Local Dev Quickstart](LOCAL_DEV_QUICKSTART.md) - Quick commands
2. [Integration Testing](INTEGRATION_TESTING.md) - Test your changes
3. [CI/CD Setup](CICD_SETUP.md) - Deploy to dev/prod

### Deployment & Operations
1. [Amplify Deployment](AMPLIFY_DEPLOYMENT.md) - Deploy infrastructure
2. [Integration Testing](INTEGRATION_TESTING.md) - Validate deployment
3. [CI/CD Setup](CICD_SETUP.md) - Set up automation

### Troubleshooting
1. [Getting Started](GETTING_STARTED.md#troubleshooting) - Common issues
2. [Local Development](LOCAL_DEVELOPMENT.md#common-issues) - Local dev issues
3. [Amplify Deployment](AMPLIFY_DEPLOYMENT.md#troubleshooting) - Deployment issues
4. [Metadata Verification](METADATA_VERIFICATION.md) - Fix metadata errors

### Cleanup
1. [Teardown Guide](../infrastructure/TEARDOWN_GUIDE.md) - Remove resources
2. [Security Best Practices](SECURITY_BEST_PRACTICES.md) - Rotate credentials

---

## 🛠️ Helper Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `validate-local-setup.sh` | Validate local environment | `./scripts/validate-local-setup.sh` |
| `get-backend-config.sh` | Get backend configuration | `./scripts/get-backend-config.sh dev` |
| `validate-docs-consistency.sh` | Check doc consistency | `./scripts/validate-docs-consistency.sh` |
| `verify-metadata.sh` | Verify & fix track metadata | `./scripts/verify-metadata.sh dev` |
| `upload-audio.sh` | Upload audio files to S3 | `./scripts/upload-audio.sh track.mp3 dev` |
| `verify-track-processing.sh` | Verify track processing | `./scripts/verify-track-processing.sh track.mp3 dev` |
| `deploy-backend.sh` | Deploy backend infrastructure | `cd infrastructure && ./deploy-backend.sh dev` |
| `teardown-stack.sh` | Remove infrastructure | `cd infrastructure && ./teardown-stack.sh dev` |

---

## 📋 Checklists

### New Developer Onboarding
- [ ] Read [Getting Started](GETTING_STARTED.md)
- [ ] Set up AWS account and credentials
- [ ] Deploy backend infrastructure
- [ ] Configure local environment
- [ ] Run validation scripts
- [ ] Review [Security Best Practices](SECURITY_BEST_PRACTICES.md)
- [ ] Test local development
- [ ] Join team communication channels

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] Tests passing locally
- [ ] Integration tests passing
- [ ] Environment variables configured
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Backup strategy confirmed

### Post-Deployment
- [ ] Deployment successful
- [ ] Integration tests passing
- [ ] Monitoring dashboards showing data
- [ ] No errors in CloudWatch logs
- [ ] Performance metrics acceptable
- [ ] Team notified of deployment

---

## 🎓 Learning Path

### Beginner (Week 1)
1. Complete [Getting Started](GETTING_STARTED.md)
2. Read [Local Development](LOCAL_DEVELOPMENT.md)
3. Review [Security Best Practices](SECURITY_BEST_PRACTICES.md)
4. Practice daily development workflow

### Intermediate (Week 2-3)
1. Study [Amplify Deployment](AMPLIFY_DEPLOYMENT.md)
2. Learn [Integration Testing](INTEGRATION_TESTING.md)
3. Understand [CI/CD Setup](CICD_SETUP.md)
4. Deploy to dev environment

### Advanced (Week 4+)
1. Set up production deployment
2. Configure custom domain
3. Implement monitoring and alerts
4. Optimize performance
5. Contribute to documentation

---

## 📊 Documentation Status

| Document | Status | Last Updated | Validated |
|----------|--------|--------------|-----------|
| Getting Started | ✅ Complete | 2025-11-09 | ✅ Yes |
| Local Development | ✅ Complete | 2025-11-09 | ✅ Yes |
| Amplify Deployment | ✅ Complete | 2025-11-09 | ✅ Yes |
| Security Best Practices | ✅ Complete | 2025-11-09 | ✅ Yes |
| Integration Testing | ✅ Complete | Earlier | ⚠️ Review |
| CI/CD Setup | ✅ Complete | Earlier | ⚠️ Review |
| Teardown Guide | ✅ Complete | 2025-11-09 | ✅ Yes |
| Metadata Verification | ✅ Complete | 2025-11-15 | ✅ Yes |

---

## 🔍 Quick Search

**Looking for...**

- **How to start?** → [Getting Started](GETTING_STARTED.md)
- **Local development?** → [Local Development](LOCAL_DEVELOPMENT.md)
- **Deploy backend?** → [Amplify Deployment](AMPLIFY_DEPLOYMENT.md)
- **Deploy frontend?** → [Amplify Deployment](AMPLIFY_DEPLOYMENT.md#step-2-set-up-aws-amplify-app)
- **Test deployment?** → [Integration Testing](INTEGRATION_TESTING.md)
- **Fix metadata errors?** → [Metadata Verification](METADATA_VERIFICATION.md)
- **Extract embedded tags?** → [Metadata Enrichment](METADATA_ENRICHMENT.md)
- **Upload audio files?** → [Music Upload Quickstart](MUSIC_UPLOAD_QUICKSTART.md)
- **Security guidelines?** → [Security Best Practices](SECURITY_BEST_PRACTICES.md)
- **Remove infrastructure?** → [Teardown Guide](../infrastructure/TEARDOWN_GUIDE.md)
- **Daily commands?** → [Local Dev Quickstart](LOCAL_DEV_QUICKSTART.md)
- **Troubleshooting?** → Check each guide's troubleshooting section

---

## 📞 Support

### Self-Service
1. Check relevant documentation above
2. Run validation scripts
3. Review troubleshooting sections
4. Check AWS CloudWatch logs

### Team Support
1. Create GitHub issue
2. Contact team lead
3. Check team communication channels

---

## 🤝 Contributing to Documentation

### Adding New Documentation
1. Create document in `docs/` directory
2. Add entry to this index
3. Cross-reference from related docs
4. Update README.md if needed
5. Run `./scripts/validate-docs-consistency.sh`

### Updating Existing Documentation
1. Make changes to document
2. Update "Last Updated" date
3. Run validation scripts
4. Update cross-references if needed
5. Submit pull request

### Documentation Standards
- Use clear, concise language
- Include code examples
- Add troubleshooting sections
- Cross-reference related docs
- Keep security in mind
- Test all commands before documenting

---

**Last Updated:** 2025-11-09  
**Maintained By:** VoisLab Team
