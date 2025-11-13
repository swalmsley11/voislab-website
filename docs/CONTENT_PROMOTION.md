# VoisLab Content Promotion Workflow

**Guide for promoting audio content from DEV to PROD environment.**

This document explains how to safely test content in the development environment and promote it to production when ready.

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Prerequisites](#prerequisites)
3. [Testing in DEV](#testing-in-dev)
4. [Manual Promotion](#manual-promotion)
5. [Automated Promotion](#automated-promotion)
6. [Rollback Procedures](#rollback-procedures)
7. [Best Practices](#best-practices)

---

## Workflow Overview

The VoisLab content promotion workflow follows a **DEV → PROD** pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONTENT PROMOTION WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. Upload to DEV
   └─> Upload audio file to DEV environment
   └─> Automatic processing by Lambda
   └─> Track appears on dev.voislab.com

2. Test in DEV
   ├─> Listen to track quality
   ├─> Verify metadata is correct
   ├─> Check streaming performance
   └─> Confirm all links work

3. Quality Gates (Automatic)
   ├─> Track status = "processed"
   ├─> All required metadata present
   ├─> File exists in DEV media bucket
   ├─> Duration > 0 seconds
   └─> No validation errors

4. Promote to PROD (Manual or Automated)
   ├─> Content Promoter Lambda invoked
   ├─> Validation checks performed
   ├─> Files copied from DEV to PROD S3
   ├─> DynamoDB record created in PROD
   └─> Notification sent

5. Verify in PROD
   └─> Track appears on voislab.com
   └─> Test playback
   └─> Monitor for issues
```

**Key Principles:**
- ✅ **Always test in DEV first** - Never upload directly to PROD
- ✅ **Automated validation** - Quality gates prevent bad content from reaching PROD
- ✅ **Audit trail** - All promotions are logged and tracked
- ✅ **Easy rollback** - Can quickly remove content from PROD if needed

---

## Prerequisites

### Required Permissions

Your IAM user needs these permissions for manual promotion:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": [
        "arn:aws:lambda:us-west-2:*:function:voislab-content-promoter-dev"
      ]
    }
  ]
}
```

### Required Tools

```bash
# AWS CLI
aws --version  # Should be 2.x

# jq (for JSON parsing)
jq --version
```

---

## Testing in DEV

### Step 1: Upload to DEV

```bash
# Upload audio file to DEV
./scripts/upload-audio.sh "my-track.mp3" dev

# Or manually
aws s3 cp my-track.mp3 s3://voislab-upload-dev-{account-id}/audio/
```

### Step 2: Verify Processing

```bash
# Wait 10-30 seconds for processing
sleep 30

# Verify track was processed
./scripts/verify-track-processing.sh "my-track.mp3" dev
```

Expected output:
```
✓ Upload bucket: OK
✓ Media bucket: OK
✓ Database: OK
✓ Processing logs: OK

✓ SUCCESS: Track successfully processed!
```

### Step 3: Test on DEV Website

1. **Open DEV website:**
   - URL: `https://dev.voislab.com` (or your DEV domain)
   - Or local: `http://localhost:3000`

2. **Find your track:**
   - Should appear in the music library
   - Check title, artist, genre are correct

3. **Test playback:**
   - Click play button
   - Verify audio quality
   - Check duration is correct
   - Test pause/resume

4. **Test streaming links:**
   - Verify external platform links work (if configured)

5. **Check metadata:**
   - Open browser console (F12)
   - Run: `testVoisLabComplete()`
   - Verify no errors

### Step 4: Quality Checklist

Before promoting to PROD, verify:

- [ ] Audio quality is good (no distortion, clipping, or artifacts)
- [ ] Metadata is accurate (title, artist, genre, duration)
- [ ] File format is correct and plays smoothly
- [ ] No copyright or licensing issues
- [ ] Track has been in DEV for at least 24 hours (recommended)
- [ ] No reported issues from testing

---

## Manual Promotion

### Method 1: Using Content Promoter Lambda

**Promote a single track:**

```bash
# Get the track ID from DynamoDB
TRACK_ID=$(aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}' \
  --query 'Items[0].id.S' \
  --output text)

echo "Track ID: $TRACK_ID"

# Invoke content promoter Lambda
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload "{
    \"action\": \"promote_track\",
    \"trackId\": \"$TRACK_ID\"
  }" \
  --cli-binary-format raw-in-base64-out \
  response.json

# Check response
cat response.json | jq '.'
```

**Expected response:**

```json
{
  "statusCode": 200,
  "body": {
    "message": "Track promoted successfully",
    "trackId": "abc-123-def-456",
    "validation": {
      "valid": true,
      "checks": [
        {"name": "Processing Status", "passed": true},
        {"name": "Required Fields", "passed": true},
        {"name": "File Existence", "passed": true}
      ]
    },
    "promotion": {
      "filesCopied": 1,
      "recordCreated": true,
      "promotionDate": "2024-11-12T10:30:00Z"
    }
  }
}
```

### Method 2: Using Promotion Script

Create a helper script for easier promotion:

```bash
#!/bin/bash
# scripts/promote-track.sh

FILENAME=$1

if [ -z "$FILENAME" ]; then
  echo "Usage: $0 <filename>"
  exit 1
fi

echo "Promoting: $FILENAME"

# Get track ID
TRACK_ID=$(aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values "{\":fn\":{\"S\":\"$FILENAME\"}}" \
  --query 'Items[0].id.S' \
  --output text)

if [ -z "$TRACK_ID" ]; then
  echo "Error: Track not found in DEV"
  exit 1
fi

echo "Track ID: $TRACK_ID"

# Promote
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload "{\"action\":\"promote_track\",\"trackId\":\"$TRACK_ID\"}" \
  --cli-binary-format raw-in-base64-out \
  response.json

# Show result
cat response.json | jq '.'
```

Usage:
```bash
chmod +x scripts/promote-track.sh
./scripts/promote-track.sh "my-track.mp3"
```

### Verification After Promotion

```bash
# Check if track exists in PROD DynamoDB
aws dynamodb scan \
  --table-name voislab-audio-metadata-prod \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}' \
  --output table

# Check if file exists in PROD S3
aws s3 ls s3://voislab-media-prod-{account-id}/audio/ --recursive | grep "my-track.mp3"

# Test PROD website
open https://voislab.com
```

---

## Automated Promotion

### Scheduled Batch Promotion

The **Promotion Orchestrator** Lambda runs every 6 hours and automatically promotes tracks that meet quality criteria.

**Quality Gates for Auto-Promotion:**
- Track status = `processed` or `enhanced`
- All required metadata present (title, duration, fileUrl)
- Track has been in DEV for at least 24 hours
- No validation errors
- File exists in DEV media bucket

**Check promotion schedule:**

```bash
# View EventBridge rule
aws events describe-rule \
  --name voislab-promotion-schedule-dev

# View recent promotions
aws logs tail /aws/lambda/voislab-promotion-orchestrator-dev --since 24h
```

### Manual Trigger of Batch Promotion

```bash
# Promote up to 10 tracks at once
aws lambda invoke \
  --function-name voislab-promotion-orchestrator-dev \
  --payload '{
    "action": "batch_promotion",
    "maxPromotions": 10
  }' \
  --cli-binary-format raw-in-base64-out \
  response.json

# Check results
cat response.json | jq '.'
```

### Disable Auto-Promotion

If you want to disable automatic promotions:

```bash
# Disable the EventBridge rule
aws events disable-rule \
  --name voislab-promotion-schedule-dev

# Re-enable later
aws events enable-rule \
  --name voislab-promotion-schedule-dev
```

---

## Rollback Procedures

### Remove Track from PROD

If you need to remove a track from production:

**Step 1: Get track details**

```bash
# Find the track in PROD
aws dynamodb scan \
  --table-name voislab-audio-metadata-prod \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}' \
  --output json > track-info.json

# Extract track ID and created date
TRACK_ID=$(cat track-info.json | jq -r '.Items[0].id.S')
CREATED_DATE=$(cat track-info.json | jq -r '.Items[0].createdDate.S')

echo "Track ID: $TRACK_ID"
echo "Created Date: $CREATED_DATE"
```

**Step 2: Delete from DynamoDB**

```bash
# Delete the record
aws dynamodb delete-item \
  --table-name voislab-audio-metadata-prod \
  --key "{\"id\":{\"S\":\"$TRACK_ID\"},\"createdDate\":{\"S\":\"$CREATED_DATE\"}}"

echo "✓ Deleted from DynamoDB"
```

**Step 3: Delete from S3 (Optional)**

```bash
# List files for this track
aws s3 ls s3://voislab-media-prod-{account-id}/audio/$TRACK_ID/ --recursive

# Delete all files for this track
aws s3 rm s3://voislab-media-prod-{account-id}/audio/$TRACK_ID/ --recursive

echo "✓ Deleted from S3"
```

**Step 4: Verify removal**

```bash
# Check PROD website
open https://voislab.com

# Track should no longer appear in the library
```

### Rollback Script

Create a rollback helper script:

```bash
#!/bin/bash
# scripts/rollback-track.sh

FILENAME=$1

if [ -z "$FILENAME" ]; then
  echo "Usage: $0 <filename>"
  exit 1
fi

echo "Rolling back: $FILENAME from PROD"

# Get track info
TRACK_INFO=$(aws dynamodb scan \
  --table-name voislab-audio-metadata-prod \
  --filter-expression "filename = :fn" \
  --expression-attribute-values "{\":fn\":{\"S\":\"$FILENAME\"}}" \
  --output json)

TRACK_ID=$(echo "$TRACK_INFO" | jq -r '.Items[0].id.S')
CREATED_DATE=$(echo "$TRACK_INFO" | jq -r '.Items[0].createdDate.S')

if [ -z "$TRACK_ID" ] || [ "$TRACK_ID" = "null" ]; then
  echo "Error: Track not found in PROD"
  exit 1
fi

echo "Track ID: $TRACK_ID"
echo "Created Date: $CREATED_DATE"

# Confirm
read -p "Are you sure you want to remove this track from PROD? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Delete from DynamoDB
aws dynamodb delete-item \
  --table-name voislab-audio-metadata-prod \
  --key "{\"id\":{\"S\":\"$TRACK_ID\"},\"createdDate\":{\"S\":\"$CREATED_DATE\"}}"

echo "✓ Removed from PROD DynamoDB"

# Optionally delete from S3
read -p "Also delete files from S3? (yes/no): " DELETE_S3

if [ "$DELETE_S3" = "yes" ]; then
  aws s3 rm s3://voislab-media-prod-{account-id}/audio/$TRACK_ID/ --recursive
  echo "✓ Removed from PROD S3"
fi

echo "✓ Rollback complete"
```

---

## Best Practices

### Before Promotion

1. **Test thoroughly in DEV**
   - Listen to the entire track
   - Test on multiple devices
   - Verify metadata accuracy

2. **Wait 24 hours**
   - Allows time for thorough testing
   - Gives opportunity to catch issues

3. **Check quality gates**
   - Ensure all validation checks pass
   - Review any warnings

4. **Document changes**
   - Note any special considerations
   - Record promotion date and reason

### During Promotion

1. **Promote during low-traffic hours**
   - Typically early morning or late night
   - Reduces impact if issues occur

2. **Promote one track at a time**
   - Easier to identify issues
   - Simpler rollback if needed

3. **Monitor the promotion**
   - Watch Lambda logs
   - Check for errors
   - Verify files copied successfully

4. **Test immediately after**
   - Check PROD website
   - Test playback
   - Verify metadata

### After Promotion

1. **Monitor for 24 hours**
   - Watch for user reports
   - Check analytics
   - Monitor error rates

2. **Keep DEV version**
   - Don't delete from DEV immediately
   - Useful for comparison if issues arise

3. **Document the promotion**
   - Record what was promoted
   - Note any issues encountered
   - Update promotion log

4. **Review metrics**
   - Check playback statistics
   - Monitor user engagement
   - Analyze performance

### Naming Conventions

Use consistent naming for easy tracking:

```
✅ Good:
- artist-name-track-title.mp3
- voislab-ethereal-waves.mp3
- ambient-collection-01.wav

❌ Avoid:
- track.mp3 (too generic)
- final_FINAL_v3.mp3 (confusing)
- test123.mp3 (not descriptive)
```

### Metadata Standards

Ensure consistent metadata:

```json
{
  "title": "Ethereal Waves",
  "artist": "VoisLab",
  "genre": "Ambient",
  "description": "A dreamy ambient composition...",
  "tags": ["atmospheric", "dreamy", "synthesizer"],
  "duration": 180
}
```

---

## Troubleshooting

### Promotion Fails

**Error: "Track not found in DEV"**

```bash
# Verify track exists
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}'
```

**Solution:** Ensure track was uploaded and processed in DEV first.

**Error: "Validation failed"**

```bash
# Check validation details
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"validate_track","trackId":"abc-123"}' \
  response.json

cat response.json | jq '.body.validation'
```

**Solution:** Fix validation issues in DEV, then retry promotion.

**Error: "File not found in DEV bucket"**

```bash
# Check if file exists
aws s3 ls s3://voislab-media-dev-{account-id}/audio/ --recursive | grep "track-id"
```

**Solution:** Re-upload and reprocess the file in DEV.

### Track Not Appearing in PROD

**Check DynamoDB:**

```bash
aws dynamodb scan \
  --table-name voislab-audio-metadata-prod \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}'
```

**Check S3:**

```bash
aws s3 ls s3://voislab-media-prod-{account-id}/audio/ --recursive | grep "my-track"
```

**Check CloudFront cache:**

```bash
# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name VoislabWebsite-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`MediaDistributionId`].OutputValue' \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

---

## Quick Reference

### Promotion Commands

```bash
# Manual promotion
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"promote_track","trackId":"abc-123"}' \
  response.json

# Batch promotion
aws lambda invoke \
  --function-name voislab-promotion-orchestrator-dev \
  --payload '{"action":"batch_promotion","maxPromotions":10}' \
  response.json

# Validate track
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"validate_track","trackId":"abc-123"}' \
  response.json
```

### Verification Commands

```bash
# Check DEV
aws dynamodb scan --table-name voislab-audio-metadata-dev --limit 5

# Check PROD
aws dynamodb scan --table-name voislab-audio-metadata-prod --limit 5

# Check promotion logs
aws logs tail /aws/lambda/voislab-content-promoter-dev --follow
```

### Rollback Commands

```bash
# Delete from PROD DynamoDB
aws dynamodb delete-item \
  --table-name voislab-audio-metadata-prod \
  --key '{"id":{"S":"track-id"},"createdDate":{"S":"2024-11-12T10:30:00Z"}}'

# Delete from PROD S3
aws s3 rm s3://voislab-media-prod-{account-id}/audio/track-id/ --recursive
```

---

## Related Documentation

- [Music Upload Workflow](MUSIC_UPLOAD_WORKFLOW.md) - How to upload audio files
- [Getting Started Guide](GETTING_STARTED.md) - Initial setup
- [Integration Testing](INTEGRATION_TESTING.md) - Testing procedures
- [Amplify Deployment](AMPLIFY_DEPLOYMENT.md) - Deployment guide

---

**Questions or Issues?**

- Check Lambda logs for detailed error messages
- Review validation results before promoting
- Test thoroughly in DEV before promoting to PROD
- Keep audit trail of all promotions

**Happy promoting! 🚀**
