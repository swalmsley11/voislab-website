# VoisLab Stack Teardown Guide

This guide explains how to safely remove VoisLab infrastructure from AWS.

## Overview

The teardown script (`teardown-stack.sh`) safely destroys all VoisLab backend infrastructure including:
- CloudFormation stacks
- S3 buckets (with all content)
- DynamoDB tables
- Lambda functions
- CloudFront distributions
- IAM roles and policies

## Issues Fixed

The teardown script had several issues that prevented proper resource deletion:

1. **S3 Bucket Emptying Logic**: The original script used `delete-objects` with potentially empty JSON, which would silently fail. Fixed by iterating through versions individually.

2. **CDK Context**: Added proper `--context environment=` flag to ensure CDK knows which stack to destroy.

3. **Fallback Mechanism**: Added direct CloudFormation deletion as a fallback if CDK destroy fails.

4. **Better Verification**: Enhanced cleanup verification to show actual resource status and list remaining resources.

## Related Documentation

- [Amplify Deployment Guide](../docs/AMPLIFY_DEPLOYMENT.md) - How to deploy infrastructure
- [Main README](../README.md) - Project overview
- [Integration Testing](../docs/INTEGRATION_TESTING.md) - Testing before teardown

## Usage

```bash
cd voislab-website/infrastructure
./teardown-stack.sh dev
```

Or for production:
```bash
./teardown-stack.sh prod
```

## What the Script Does

1. **Empties S3 Buckets**: Removes all objects, versions, and delete markers from:
   - `voislab-upload-{env}-{account-id}`
   - `voislab-media-{env}-{account-id}`
   - `voislab-website-{env}-{account-id}`

2. **Destroys CDK Stack**: Runs `cdk destroy` with proper context, or falls back to CloudFormation if needed.

3. **Verifies Cleanup**: Checks for remaining:
   - CloudFormation stacks
   - S3 buckets
   - DynamoDB tables

## Important Notes

### Retained Resources

Some resources may be retained even after teardown due to:

- **RemovalPolicy.RETAIN**: Production resources are configured to be retained for safety
- **Deletion Protection**: Some resources may have deletion protection enabled
- **Cross-Stack Dependencies**: Resources used by other stacks won't be deleted

### Manual Cleanup

If resources remain after running the script, you can manually delete them:

```bash
# Delete a specific bucket (after emptying it)
aws s3 rb s3://bucket-name --force

# Delete a DynamoDB table
aws dynamodb delete-table --table-name table-name

# Delete CloudFormation stack directly
aws cloudformation delete-stack --stack-name VoislabWebsite-dev
```

### Monitoring Deletion Progress

```bash
# Watch stack deletion status
aws cloudformation describe-stacks --stack-name VoislabWebsite-dev

# List remaining resources in stack
aws cloudformation list-stack-resources --stack-name VoislabWebsite-dev

# Check all VoisLab stacks
aws cloudformation list-stacks --query "StackSummaries[?contains(StackName, 'VoislabWebsite')]"
```

## Troubleshooting

### "Stack still exists after teardown"

The stack may be in `DELETE_IN_PROGRESS` state. Wait a few minutes and check again:

```bash
# Check stack status
aws cloudformation describe-stacks --stack-name VoislabWebsite-dev --query 'Stacks[0].StackStatus'

# Watch deletion progress
aws cloudformation describe-stack-events --stack-name VoislabWebsite-dev --max-items 10
```

### "Bucket not empty" errors

Run the bucket emptying part again:

```bash
# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Empty bucket manually
aws s3 rm s3://voislab-upload-dev-${ACCOUNT_ID} --recursive
```

### "Resource being used by another resource"

Check for dependencies:

```bash
aws cloudformation describe-stack-resources --stack-name VoislabWebsite-dev
```

Some resources (like Lambda functions) may need time to fully terminate before their dependencies can be deleted.
