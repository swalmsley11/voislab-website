# Security Best Practices for VoisLab Development

This document outlines security best practices for developing and deploying VoisLab.

## Environment Variables & Secrets

### ✅ DO:

1. **Use `.env.local` for local development**
   - Already git-ignored
   - Contains environment-specific configuration
   - Never committed to repository

2. **Store AWS credentials securely**
   - Use `~/.aws/credentials` (managed by AWS CLI)
   - Use IAM roles in production (Amplify, Lambda)
   - Never hardcode credentials in code

3. **Use `.env.example` as template**
   - Safe to commit (no real values)
   - Documents required variables
   - Helps onboard new developers

4. **Separate environments**
   - Dev backend for development
   - Prod backend for production
   - Different AWS accounts (recommended)

### ❌ DON'T:

1. **Never commit these files:**
   - `.env.local`
   - `.env.production`
   - `outputs-*.json` (contains resource names)
   - `~/.aws/credentials`

2. **Never hardcode:**
   - AWS Access Keys
   - AWS Secret Keys
   - API keys
   - Database credentials
   - Account IDs (use placeholders in docs)

3. **Never share via:**
   - Email
   - Slack/Chat
   - Screenshots
   - Public repositories

## Git Security

### .gitignore Configuration

Ensure these patterns are in `.gitignore`:

```gitignore
# Environment files
.env
.env.local
.env.*.local
*.local

# AWS outputs
outputs-*.json
cdk.out/
.aws-sam/

# Credentials
.aws/
*.pem
*.key
```

### Before Committing

```bash
# Check what will be committed
git status

# Review changes
git diff

# Verify no secrets
git diff | grep -i "secret\|password\|key"

# Check .gitignore is working
git check-ignore .env.local  # Should output: .env.local
```

### If You Accidentally Commit Secrets

1. **Immediately rotate credentials**
   ```bash
   aws iam create-access-key --user-name your-user
   aws iam delete-access-key --access-key-id OLD_KEY --user-name your-user
   ```

2. **Remove from git history**
   ```bash
   # Use git-filter-repo or BFG Repo-Cleaner
   # Contact your team lead for assistance
   ```

3. **Force push (if repository is private and you're sure)**
   ```bash
   git push --force
   ```

## AWS IAM Best Practices

### Development IAM User

Create a dedicated IAM user for development with minimal permissions:

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
      "Resource": "arn:aws:dynamodb:*:*:table/voislab-*-dev"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::voislab-*-dev/*"
    }
  ]
}
```

### Production IAM Roles

- Use IAM roles for Amplify (not access keys)
- Enable MFA for production access
- Use separate AWS accounts for prod
- Enable CloudTrail for audit logging

### Credential Rotation

```bash
# Rotate credentials every 90 days
aws iam create-access-key --user-name your-user
# Update ~/.aws/credentials
aws iam delete-access-key --access-key-id OLD_KEY --user-name your-user
```

## Code Security

### Environment Variable Access

**✅ Correct:**
```typescript
const region = import.meta.env.VITE_AWS_REGION;
const tableName = import.meta.env.VITE_DYNAMODB_TABLE_NAME;
```

**❌ Wrong:**
```typescript
const accessKey = "AKIAIOSFODNN7EXAMPLE";  // Never!
const secretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";  // Never!
```

### Logging

**✅ Safe to log:**
```typescript
console.log('Environment:', import.meta.env.VITE_ENVIRONMENT);
console.log('Region:', import.meta.env.VITE_AWS_REGION);
```

**❌ Never log:**
```typescript
console.log('Credentials:', credentials);  // Never!
console.log('Access Key:', accessKey);     // Never!
```

### Error Messages

**✅ Safe error messages:**
```typescript
throw new Error('Failed to connect to DynamoDB');
```

**❌ Dangerous error messages:**
```typescript
throw new Error(`Failed with key ${accessKey}`);  // Never!
```

## Deployment Security

### Amplify Environment Variables

Set in Amplify Console (not in code):
- `VITE_AWS_REGION`
- `VITE_DYNAMODB_TABLE_NAME`
- `VITE_S3_MEDIA_BUCKET`
- `VITE_CLOUDFRONT_DOMAIN`

### CDK Deployment

```bash
# Use context for environment
cdk deploy --context environment=dev

# Never use parameters with secrets
cdk deploy --parameters password=secret123  # Wrong!
```

### GitHub Actions

Use GitHub Secrets for CI/CD:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Never hardcode in workflow files.

## Monitoring & Auditing

### Enable CloudTrail

```bash
# Track all AWS API calls
aws cloudtrail create-trail --name voislab-audit
```

### Review Access Logs

```bash
# Check who accessed what
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=your-user
```

### Set Up Alerts

- Unusual API activity
- Failed authentication attempts
- Resource creation/deletion
- Cost anomalies

## Incident Response

### If Credentials Are Compromised

1. **Immediately disable credentials**
   ```bash
   aws iam update-access-key --access-key-id KEY --status Inactive --user-name USER
   ```

2. **Review CloudTrail logs**
   ```bash
   aws cloudtrail lookup-events --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)
   ```

3. **Rotate all credentials**
4. **Review all resources for unauthorized changes**
5. **Document incident**

### If Secrets Are Committed

1. **Rotate immediately** (before removing from git)
2. **Remove from git history**
3. **Force push to remote**
4. **Notify team**
5. **Review access logs**

## Security Checklist

### Before Starting Development

- [ ] AWS CLI configured with dedicated dev user
- [ ] `.env.local` created from `.env.example`
- [ ] `.gitignore` includes all sensitive files
- [ ] IAM permissions follow least privilege
- [ ] MFA enabled on AWS account

### Before Committing Code

- [ ] No hardcoded credentials
- [ ] No sensitive data in comments
- [ ] `.env.local` not staged
- [ ] `outputs-*.json` not staged
- [ ] Reviewed `git diff` for secrets

### Before Deploying

- [ ] Environment variables set in Amplify
- [ ] IAM roles configured (not access keys)
- [ ] CloudTrail enabled
- [ ] Monitoring alerts configured
- [ ] Backup strategy in place

### Regular Maintenance

- [ ] Rotate credentials every 90 days
- [ ] Review IAM permissions quarterly
- [ ] Update dependencies monthly
- [ ] Review CloudTrail logs weekly
- [ ] Test disaster recovery annually

## Resources

- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Git Secrets Tool](https://github.com/awslabs/git-secrets)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

## Questions?

If you're unsure about security practices:
1. Ask your team lead
2. Review AWS documentation
3. When in doubt, don't commit it

**Remember:** Security is everyone's responsibility! 🔒
