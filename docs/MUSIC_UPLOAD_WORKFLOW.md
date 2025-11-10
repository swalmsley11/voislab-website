# VoisLab Music Upload Workflow

**Complete guide for uploading and publishing audio content to VoisLab.**

This document explains the end-to-end workflow for getting your music from production to live on the website.

---

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Prerequisites](#prerequisites)
3. [Upload Methods](#upload-methods)
4. [Automated Processing Pipeline](#automated-processing-pipeline)
5. [Verification and Testing](#verification-and-testing)
6. [DEV to PROD Promotion](#dev-to-prod-promotion)
7. [Troubleshooting](#troubleshooting)

---

## Workflow Overview

The VoisLab music upload workflow is **fully automated** after the initial upload:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MUSIC UPLOAD WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. Producer creates audio file
   └─> Audio file ready (MP3, WAV, FLAC, M4A, AAC, OGG)

2. Upload to S3 upload bucket
   └─> aws s3 cp audio.mp3 s3://voislab-upload-{env}/audio/
   └─> S3 event automatically triggered

3. Audio Processor Lambda (AUTOMATIC)
   ├─> Validates file format and size
   ├─> Scans for security issues
   ├─> Extracts basic metadata
   ├─> Copies to media bucket
   └─> Creates DynamoDB record

4. Format Converter Lambda (OPTIONAL)
   ├─> Converts to optimized formats
   ├─> Extracts detailed metadata (duration, bitrate, etc.)
   └─> Updates DynamoDB record

5. CloudFront Distribution (AUTOMATIC)
   └─> Makes audio available globally via CDN

6. Website Display (AUTOMATIC)
   └─> Frontend fetches from DynamoDB
   └─> Track appears in music library
   └─> Users can stream immediately
```

**Key Points:**
- ✅ **One-step upload:** Just upload to S3, everything else is automatic
- ✅ **No manual intervention:** Lambda functions handle all processing
- ✅ **Immediate availability:** Track appears on website within seconds
- ✅ **Secure by default:** Automatic validation and security scanning

---

## Prerequisites

### Required Tools

```bash
# AWS CLI (for uploads)
aws --version  # Should be 2.x

# jq (for JSON parsing, optional but helpful)
jq --version
```

### AWS Credentials

Ensure your AWS credentials are configured:

```bash
# Check current credentials
aws sts get-caller-identity

# Should show your account and user
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/voislab-dev"
}
```

### Required Permissions

Your IAM user needs these permissions:
- `s3:PutObject` on upload bucket
- `s3:ListBucket` on upload bucket
- `dynamodb:GetItem` on metadata table (for verification)

---

## Upload Methods

### Method 1: AWS CLI (Recommended)

**Single File Upload:**

```bash
# Upload to development environment
aws s3 cp my-track.mp3 s3://voislab-upload-dev-{account-id}/audio/

# Upload to production environment
aws s3 cp my-track.mp3 s3://voislab-upload-prod-{account-id}/audio/

# Upload with metadata
aws s3 cp my-track.mp3 \
  s3://voislab-upload-dev-{account-id}/audio/ \
  --metadata artist="VoisLab",genre="Ambient"
```

**Batch Upload:**

```bash
# Upload entire directory
aws s3 cp ./audio-files/ \
  s3://voislab-upload-dev-{account-id}/audio/ \
  --recursive \
  --exclude "*.txt" \
  --exclude "*.md"

# Upload with progress
aws s3 cp ./audio-files/ \
  s3://voislab-upload-dev-{account-id}/audio/ \
  --recursive \
  --include "*.mp3" \
  --include "*.wav" \
  --include "*.flac"
```

### Method 2: AWS Console

1. **Navigate to S3:**
   - Go to https://console.aws.amazon.com/s3/
   - Find bucket: `voislab-upload-{env}-{account-id}`

2. **Upload Files:**
   - Click "Upload" button
   - Drag and drop audio files
   - Ensure files go into `audio/` folder
   - Click "Upload"

3. **Monitor Processing:**
   - Check CloudWatch Logs for Lambda execution
   - Verify DynamoDB table for new records

### Method 3: Presigned URLs (Programmatic)

For automated uploads or third-party integrations:

```python
import boto3
from datetime import timedelta

s3_client = boto3.client('s3')

# Generate presigned URL (valid for 1 hour)
url = s3_client.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': 'voislab-upload-dev-{account-id}',
        'Key': 'audio/my-track.mp3',
        'ContentType': 'audio/mpeg'
    },
    ExpiresIn=3600
)

# Use URL to upload
import requests
with open('my-track.mp3', 'rb') as f:
    response = requests.put(url, data=f)
```

---

## Automated Processing Pipeline

### Step 1: Audio Processor Lambda

**Triggered automatically** when file is uploaded to S3.

**What it does:**
1. **Validates file format**
   - Checks file extension (`.mp3`, `.wav`, `.flac`, `.m4a`, `.aac`, `.ogg`)
   - Validates MIME type matches extension
   - Ensures file size is between 1KB and 100MB

2. **Security scanning**
   - Scans first 1KB for malicious patterns
   - Checks for script injection attempts
   - Validates file integrity

3. **Extracts basic metadata**
   - Parses filename for title/artist
   - Estimates duration based on file size
   - Generates unique track ID (UUID)

4. **Copies to media bucket**
   - Organized structure: `audio/{track-id}/{filename}`
   - Adds S3 metadata tags
   - Calculates SHA-256 hash for integrity

5. **Creates DynamoDB record**
   - Stores track metadata
   - Sets status to `processed`
   - Records processing timestamp

**Processing Time:** 2-5 seconds per file

**CloudWatch Logs:**
```bash
# View processing logs
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow
```

### Step 2: Format Converter Lambda (Optional)

**Triggered manually** or by advanced processing needs.

**What it does:**
1. **Converts to optimized formats**
   - Creates web-optimized MP3 (if source is different format)
   - Generates multiple bitrate versions (future)
   - Creates audio thumbnails/previews (future)

2. **Extracts detailed metadata**
   - Actual duration (not estimated)
   - Bitrate and sample rate
   - Number of channels
   - ID3 tags (artist, album, genre)

3. **Updates DynamoDB record**
   - Enhances metadata with detailed information
   - Updates processing status to `enhanced`

**Processing Time:** 10-30 seconds per file

**Manual Invocation:**
```bash
# Invoke format converter for specific track
aws lambda invoke \
  --function-name voislab-format-converter-dev \
  --payload '{"trackId":"abc-123","sourceKey":"audio/abc-123/track.mp3"}' \
  response.json
```

### Step 3: CloudFront Distribution

**Automatic** - no action required.

**What it does:**
- Distributes audio files globally via CDN
- Caches files at edge locations
- Provides secure HTTPS URLs
- Handles CORS for web playback

**Access URLs:**
```
https://{cloudfront-domain}/audio/{track-id}/{filename}
```

### Step 4: Website Display

**Automatic** - frontend polls DynamoDB.

**What happens:**
- Frontend queries DynamoDB for tracks with `status=processed`
- Tracks appear in music library immediately
- Users can stream, search, and filter
- Analytics track playback events

---

## Verification and Testing

### Verify Upload Success

```bash
# Check if file exists in upload bucket
aws s3 ls s3://voislab-upload-dev-{account-id}/audio/

# Check if file was copied to media bucket
aws s3 ls s3://voislab-media-dev-{account-id}/audio/
```

### Verify DynamoDB Record

```bash
# List recent tracks
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --limit 5 \
  --query 'Items[*].[id.S, title.S, status.S]' \
  --output table

# Get specific track by ID
aws dynamodb get-item \
  --table-name voislab-audio-metadata-dev \
  --key '{"id":{"S":"your-track-id"},"createdDate":{"S":"2024-01-15T10:30:00Z"}}'
```

### Verify Website Display

1. **Open website:**
   - Development: `https://dev.voislab.com`
   - Production: `https://voislab.com`

2. **Check music library:**
   - Your track should appear in the list
   - Click play to test streaming
   - Verify metadata is correct

3. **Run integration tests:**
   ```javascript
   // Open browser console (F12)
   testVoisLabComplete()
   ```

### Check Processing Logs

```bash
# Audio processor logs
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow

# Format converter logs
aws logs tail /aws/lambda/voislab-format-converter-dev --follow

# Filter for specific track
aws logs filter-pattern /aws/lambda/voislab-audio-processor-dev \
  --filter-pattern "track-id-here"
```

---

## DEV to PROD Promotion

### Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              DEV TO PROD PROMOTION WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. Upload to DEV environment
   └─> Test and verify in dev.voislab.com

2. Quality assurance
   ├─> Listen to track
   ├─> Verify metadata
   └─> Check streaming quality

3. Promote to PROD (manual or automated)
   ├─> Content Promoter Lambda copies files
   ├─> Copies S3 objects to prod bucket
   └─> Creates DynamoDB record in prod table

4. Verify in PROD
   └─> Track appears on voislab.com
```

### Manual Promotion

**Option 1: Using Content Promoter Lambda**

```bash
# Promote specific track
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{
    "action": "promote_track",
    "trackId": "your-track-id",
    "environment": "prod"
  }' \
  response.json

# Check response
cat response.json
```

**Option 2: Manual Copy**

```bash
# 1. Copy file from DEV to PROD
aws s3 cp \
  s3://voislab-media-dev-{account-id}/audio/{track-id}/ \
  s3://voislab-media-prod-{account-id}/audio/{track-id}/ \
  --recursive

# 2. Get metadata from DEV
aws dynamodb get-item \
  --table-name voislab-audio-metadata-dev \
  --key '{"id":{"S":"track-id"},"createdDate":{"S":"2024-01-15T10:30:00Z"}}' \
  > track-metadata.json

# 3. Put metadata in PROD
aws dynamodb put-item \
  --table-name voislab-audio-metadata-prod \
  --item file://track-metadata.json
```

### Automated Promotion

**Scheduled Batch Promotion:**

The Promotion Orchestrator Lambda runs every 6 hours and automatically promotes tracks that meet quality criteria:

```bash
# Check promotion schedule
aws events describe-rule \
  --name voislab-promotion-schedule-dev

# Manually trigger batch promotion
aws lambda invoke \
  --function-name voislab-promotion-orchestrator-dev \
  --payload '{
    "action": "batch_promotion",
    "maxPromotions": 10
  }' \
  response.json
```

**Quality Gates:**
- Track must have `status=processed` or `status=enhanced`
- Track must have valid metadata (title, duration > 0)
- Track must have been in DEV for at least 24 hours
- Track must have no reported issues

### Rollback Procedure

If you need to remove a track from production:

```bash
# 1. Delete from PROD DynamoDB
aws dynamodb delete-item \
  --table-name voislab-audio-metadata-prod \
  --key '{"id":{"S":"track-id"},"createdDate":{"S":"2024-01-15T10:30:00Z"}}'

# 2. Delete from PROD S3 (optional - keeps backup)
aws s3 rm \
  s3://voislab-media-prod-{account-id}/audio/{track-id}/ \
  --recursive
```

---

## Troubleshooting

### Upload Issues

**Problem: "Access Denied" error**

```bash
# Check your AWS credentials
aws sts get-caller-identity

# Verify bucket exists
aws s3 ls | grep voislab-upload

# Check bucket permissions
aws s3api get-bucket-policy \
  --bucket voislab-upload-dev-{account-id}
```

**Solution:**
- Ensure AWS credentials are configured correctly
- Verify IAM user has `s3:PutObject` permission
- Check bucket name is correct (include account ID)

**Problem: "File too large" error**

```bash
# Check file size
ls -lh my-track.mp3
```

**Solution:**
- Maximum file size is 100MB
- Compress audio file or reduce bitrate
- Use format converter to optimize

### Processing Issues

**Problem: Track not appearing on website**

```bash
# Check if Lambda was triggered
aws logs tail /aws/lambda/voislab-audio-processor-dev --since 10m

# Check DynamoDB for track
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}'
```

**Solution:**
- Verify file was uploaded to `audio/` folder (not root)
- Check Lambda execution logs for errors
- Ensure file format is supported
- Verify DynamoDB table exists and is accessible

**Problem: "Security scan failed" error**

```bash
# Check Lambda logs for details
aws logs filter-pattern /aws/lambda/voislab-audio-processor-dev \
  --filter-pattern "Security scan failed"
```

**Solution:**
- Ensure file is a valid audio file (not corrupted)
- Check file doesn't contain suspicious content
- Try re-exporting from audio software
- Contact support if issue persists

**Problem: "404 Not Found" or "HeadObject operation: Not Found" error**

```bash
# Check Lambda logs
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow
```

**Solution:**
- This often occurs with filenames containing spaces or special characters
- Spaces in filenames get URL-encoded (e.g., `Silicon Horizon.wav` becomes `Silicon+Horizon.wav`)
- **Fix:** Rename file to use hyphens or underscores instead of spaces
  - Good: `Silicon-Horizon.wav` or `Silicon_Horizon.wav`
  - Avoid: `Silicon Horizon.wav`
- Re-upload the file with the corrected filename
- The Lambda functions now handle URL-encoded filenames, but it's best practice to avoid spaces

### Metadata Issues

**Problem: Incorrect title or missing metadata**

**Solution:**
- Use proper filename format: `Artist - Title.mp3`
- Add ID3 tags to audio file before upload
- Manually update DynamoDB record:

```bash
aws dynamodb update-item \
  --table-name voislab-audio-metadata-dev \
  --key '{"id":{"S":"track-id"},"createdDate":{"S":"2024-01-15T10:30:00Z"}}' \
  --update-expression "SET title = :t, artist = :a, genre = :g" \
  --expression-attribute-values '{
    ":t":{"S":"Correct Title"},
    ":a":{"S":"Artist Name"},
    ":g":{"S":"Ambient"}
  }'
```

### Promotion Issues

**Problem: Track not promoting to PROD**

```bash
# Check promotion logs
aws logs tail /aws/lambda/voislab-content-promoter-dev --follow

# Check track status in DEV
aws dynamodb get-item \
  --table-name voislab-audio-metadata-dev \
  --key '{"id":{"S":"track-id"},"createdDate":{"S":"2024-01-15T10:30:00Z"}}' \
  --query 'Item.status.S'
```

**Solution:**
- Ensure track has `status=processed` or `status=enhanced`
- Verify track has been in DEV for required time period
- Check promotion Lambda has cross-account permissions
- Manually promote using content promoter Lambda

---

## Best Practices

### File Naming

✅ **Good:**
- `VoisLab-Ethereal-Waves.mp3` (hyphens instead of spaces)
- `Midnight_Reflections.wav` (underscores)
- `ambient-track-01.flac` (lowercase with hyphens)
- `Silicon-Horizon.wav` (clean, descriptive)

⚠️ **Use with caution:**
- `VoisLab - Ethereal Waves.mp3` (spaces work but get URL-encoded)
- Files with spaces will be encoded as `+` or `%20` in S3

❌ **Avoid:**
- `track.mp3` (too generic)
- `final_final_v3_FINAL.mp3` (confusing)
- `my track (1).mp3` (parentheses and spaces)
- Files with special characters: `@`, `#`, `$`, `%`, `&`, `*`, `(`, `)`, `[`, `]`, `{`, `}`

**Best Practice:** Use only letters, numbers, hyphens (`-`), and underscores (`_`) in filenames.

### File Preparation

1. **Export at appropriate quality:**
   - MP3: 320kbps CBR or V0 VBR
   - WAV: 44.1kHz or 48kHz, 16-bit or 24-bit
   - FLAC: Lossless compression

2. **Add ID3 tags:**
   - Title, Artist, Album
   - Genre, Year
   - Album art (optional)

3. **Normalize audio levels:**
   - Target -14 LUFS for streaming
   - Avoid clipping and distortion

### Testing Workflow

1. **Always test in DEV first**
2. **Verify playback quality**
3. **Check metadata accuracy**
4. **Test on multiple devices**
5. **Promote to PROD only after verification**

---

## Quick Reference

### Upload Commands

```bash
# Single file to DEV
aws s3 cp track.mp3 s3://voislab-upload-dev-{account-id}/audio/

# Single file to PROD
aws s3 cp track.mp3 s3://voislab-upload-prod-{account-id}/audio/

# Batch upload
aws s3 cp ./tracks/ s3://voislab-upload-dev-{account-id}/audio/ --recursive
```

### Verification Commands

```bash
# Check upload
aws s3 ls s3://voislab-upload-dev-{account-id}/audio/

# Check processing
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow

# Check DynamoDB
aws dynamodb scan --table-name voislab-audio-metadata-dev --limit 5
```

### Promotion Commands

```bash
# Manual promote
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"promote_track","trackId":"abc-123"}' \
  response.json

# Batch promote
aws lambda invoke \
  --function-name voislab-promotion-orchestrator-dev \
  --payload '{"action":"batch_promotion","maxPromotions":10}' \
  response.json
```

---

## Related Documentation

- [Getting Started Guide](GETTING_STARTED.md) - Initial setup
- [Local Development](LOCAL_DEVELOPMENT.md) - Development environment
- [Integration Testing](INTEGRATION_TESTING.md) - Testing procedures
- [Amplify Deployment](AMPLIFY_DEPLOYMENT.md) - Deployment guide

---

**Questions or Issues?**

- Check CloudWatch Logs for detailed error messages
- Review Lambda function code in `infrastructure/lambda/`
- Run validation scripts in `scripts/` directory
- Contact VoisLab support team

**Happy uploading! 🎵**
