# VoisLab Music Upload Quickstart

**Get your first track uploaded and live in 5 minutes!**

This is a quick reference guide for uploading audio content to VoisLab. For detailed information, see [MUSIC_UPLOAD_WORKFLOW.md](MUSIC_UPLOAD_WORKFLOW.md).

---

## Prerequisites

✅ AWS CLI installed and configured  
✅ Audio file ready (MP3, WAV, FLAC, M4A, AAC, or OGG)  
✅ Backend infrastructure deployed

---

## Quick Upload (3 Steps)

### Step 1: Prepare Your File

**Best practices:**
- Use hyphens or underscores instead of spaces: `my-track.mp3` ✅
- Avoid special characters: `my track (1).mp3` ❌
- Keep file size under 100MB
- Use descriptive names: `voislab-ethereal-waves.mp3` ✅

**Optional - Validate before upload:**
```bash
./scripts/validate-audio.sh my-track.mp3
```

### Step 2: Upload to DEV

**Using the upload script (recommended):**
```bash
./scripts/upload-audio.sh my-track.mp3 dev
```

**Or using AWS CLI directly:**
```bash
aws s3 cp my-track.mp3 s3://voislab-upload-dev-{account-id}/audio/
```

**Replace `{account-id}` with your AWS account ID:**
```bash
aws sts get-caller-identity --query Account --output text
```

### Step 3: Verify & Test

**Wait 10-30 seconds for processing, then verify:**
```bash
./scripts/verify-track-processing.sh my-track.mp3 dev
```

**Test on website:**
- Open: `https://dev.voislab.com` (or `http://localhost:3000` for local)
- Find your track in the music library
- Click play to test

**✅ Done!** Your track is live on the DEV website.

---

## Upload to Production

**After testing in DEV, promote to PROD:**

### Option 1: Manual Promotion

```bash
# Get track ID
TRACK_ID=$(aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}' \
  --query 'Items[0].id.S' \
  --output text)

# Promote to PROD
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload "{\"action\":\"promote_track\",\"trackId\":\"$TRACK_ID\"}" \
  --cli-binary-format raw-in-base64-out \
  response.json

# Check result
cat response.json | jq '.'
```

### Option 2: Automatic Promotion

Tracks are automatically promoted every 6 hours if they meet quality criteria:
- Status = `processed`
- All metadata present
- In DEV for 24+ hours
- No validation errors

---

## Common Commands

### Upload

```bash
# Single file to DEV
./scripts/upload-audio.sh track.mp3 dev

# Single file to PROD (not recommended - use promotion instead)
./scripts/upload-audio.sh track.mp3 prod

# Batch upload
./scripts/upload-audio.sh ./tracks/ dev --batch
```

### Verify

```bash
# Check processing status
./scripts/verify-track-processing.sh track.mp3 dev

# Debug issues
./scripts/debug-upload.sh track.mp3 dev

# Validate before upload
./scripts/validate-audio.sh track.mp3
```

### Check Status

```bash
# List recent tracks in DEV
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --limit 5 \
  --query 'Items[*].[id.S, title.S, status.S]' \
  --output table

# List recent tracks in PROD
aws dynamodb scan \
  --table-name voislab-audio-metadata-prod \
  --limit 5 \
  --query 'Items[*].[id.S, title.S, status.S]' \
  --output table
```

### View Logs

```bash
# Audio processor logs
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow

# Content promoter logs
aws logs tail /aws/lambda/voislab-content-promoter-dev --follow
```

---

## Troubleshooting

### File Not Appearing

**Check processing:**
```bash
./scripts/debug-upload.sh my-track.mp3 dev
```

**Common issues:**
- File uploaded to wrong folder (must be in `audio/` folder)
- File format not supported
- File too large (>100MB)
- Lambda processing failed

**Solution:**
```bash
# Check Lambda logs
aws logs tail /aws/lambda/voislab-audio-processor-dev --since 10m

# Re-upload if needed
aws s3 rm s3://voislab-upload-dev-{account-id}/audio/my-track.mp3
aws s3 cp my-track.mp3 s3://voislab-upload-dev-{account-id}/audio/
```

### "Failed to load audio track"

**Issue:** Track appears in library but won't play

**Solution:**
- Check CloudFront URL is correct
- Verify file exists in media bucket
- Check browser console for errors

```bash
# Check media bucket
aws s3 ls s3://voislab-media-dev-{account-id}/audio/ --recursive | grep my-track

# Check DynamoDB record
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"my-track.mp3"}}' \
  --query 'Items[0].fileUrl.S'
```

### Permission Denied

**Issue:** `AccessDenied` error when uploading

**Solution:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify bucket exists
aws s3 ls | grep voislab-upload

# Check IAM permissions
aws iam get-user-policy --user-name your-username --policy-name VoisLabLocalDevAccess
```

---

## File Format Guide

### Supported Formats

| Format | Extension | Recommended Use |
|--------|-----------|-----------------|
| MP3 | `.mp3` | General use, good compression |
| WAV | `.wav` | Highest quality, large files |
| FLAC | `.flac` | Lossless compression |
| M4A | `.m4a` | Apple devices, good quality |
| AAC | `.aac` | Modern compression |
| OGG | `.ogg` | Open format, good compression |

### Recommended Settings

**MP3:**
- Bitrate: 320kbps CBR or V0 VBR
- Sample rate: 44.1kHz or 48kHz
- Channels: Stereo

**WAV:**
- Sample rate: 44.1kHz or 48kHz
- Bit depth: 16-bit or 24-bit
- Channels: Stereo

**FLAC:**
- Compression level: 5-8
- Sample rate: 44.1kHz or 48kHz
- Bit depth: 16-bit or 24-bit

---

## Metadata Best Practices

### Filename Format

Use descriptive, URL-friendly names:

```bash
✅ Good:
artist-name-track-title.mp3
voislab-ethereal-waves.mp3
ambient-collection-01.wav

❌ Avoid:
track.mp3
my track (1).mp3
final_FINAL_v3.mp3
```

### ID3 Tags (MP3)

Add metadata before uploading:

```bash
# Using ffmpeg
ffmpeg -i input.mp3 \
  -metadata title="Ethereal Waves" \
  -metadata artist="VoisLab" \
  -metadata album="Ambient Collection" \
  -metadata genre="Ambient" \
  -metadata date="2024" \
  -codec copy output.mp3
```

### Metadata Fields

The Lambda will extract:
- **Title** - From filename or ID3 tags
- **Artist** - From ID3 tags or filename pattern
- **Duration** - Calculated from file
- **Format** - From file extension
- **Genre** - From ID3 tags (defaults to "unknown")

---

## Workflow Diagram

```
Upload → Process → Verify → Test → Promote → Live
  ↓         ↓         ↓       ↓       ↓        ↓
 S3      Lambda    DynamoDB  DEV    Lambda   PROD
```

**Timeline:**
- Upload: Instant
- Processing: 5-30 seconds
- Verification: 10 seconds
- Testing: 5-10 minutes
- Promotion: 30 seconds
- **Total: ~10 minutes from upload to PROD**

---

## Quick Reference Card

### Essential Commands

```bash
# Upload
./scripts/upload-audio.sh FILENAME dev

# Verify
./scripts/verify-track-processing.sh FILENAME dev

# Debug
./scripts/debug-upload.sh FILENAME dev

# Promote
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"promote_track","trackId":"TRACK_ID"}' \
  response.json
```

### Essential URLs

- **DEV Website:** `https://dev.voislab.com`
- **PROD Website:** `https://voislab.com`
- **AWS Console:** `https://console.aws.amazon.com`
- **CloudWatch Logs:** `https://console.aws.amazon.com/cloudwatch/home?region=us-west-2#logsV2:log-groups`

### Essential Bucket Names

```bash
# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bucket names
voislab-upload-dev-$ACCOUNT_ID
voislab-media-dev-$ACCOUNT_ID
voislab-upload-prod-$ACCOUNT_ID
voislab-media-prod-$ACCOUNT_ID
```

---

## Next Steps

After your first successful upload:

1. **Read the full documentation:**
   - [MUSIC_UPLOAD_WORKFLOW.md](MUSIC_UPLOAD_WORKFLOW.md) - Complete workflow guide
   - [CONTENT_PROMOTION.md](CONTENT_PROMOTION.md) - DEV to PROD promotion
   - [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md) - Testing procedures

2. **Set up automation:**
   - Configure automatic promotions
   - Set up monitoring alerts
   - Create batch upload scripts

3. **Optimize your workflow:**
   - Add ID3 tags to files
   - Create upload templates
   - Document your process

---

## Getting Help

**Check logs:**
```bash
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow
```

**Run diagnostics:**
```bash
./scripts/debug-upload.sh FILENAME dev
```

**Verify infrastructure:**
```bash
aws cloudformation describe-stacks --stack-name VoislabWebsite-dev
```

**Test connectivity:**
```bash
# DynamoDB
aws dynamodb describe-table --table-name voislab-audio-metadata-dev

# S3
aws s3 ls s3://voislab-upload-dev-$ACCOUNT_ID/

# Lambda
aws lambda get-function --function-name voislab-audio-processor-dev
```

---

## Cheat Sheet

```bash
# 1. Upload
aws s3 cp track.mp3 s3://voislab-upload-dev-{account}/audio/

# 2. Wait
sleep 30

# 3. Verify
aws dynamodb scan --table-name voislab-audio-metadata-dev --limit 1

# 4. Test
open https://dev.voislab.com

# 5. Promote
aws lambda invoke \
  --function-name voislab-content-promoter-dev \
  --payload '{"action":"promote_track","trackId":"ID"}' \
  response.json

# 6. Verify PROD
open https://voislab.com
```

---

**That's it! You're ready to upload music to VoisLab.** 🎵

For detailed information, troubleshooting, and advanced features, see the [complete documentation](MUSIC_UPLOAD_WORKFLOW.md).
