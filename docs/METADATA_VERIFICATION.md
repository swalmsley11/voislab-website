# Metadata Verification Script

## Overview

The metadata verification script (`verify-metadata.sh`) is a comprehensive troubleshooting tool that compares audio file metadata against DynamoDB entries to detect and optionally correct discrepancies.

## Features

- **Automated Verification**: Scans all tracks in the Music Library
- **Error Detection**: Identifies title mismatches, duration discrepancies, missing genres, and file hash inconsistencies
- **Auto-Correction**: Automatically fixes detected metadata errors with backup
- **Performance Optimized**: Completes verification within 5 minutes for typical libraries
- **Progress Tracking**: Real-time progress bar with ETA
- **Safety Features**: Automatic backups, confirmation prompts, and rollback capability

## Requirements

### Prerequisites

- AWS CLI configured with appropriate credentials
- `jq` for JSON parsing (install: `brew install jq`)
- `ffprobe` (optional, for duration verification - install: `brew install ffmpeg`)

### AWS Permissions

The script requires read access to:
- DynamoDB table: `voislab-audio-metadata-{environment}`
- S3 bucket: `voislab-media-{environment}-{account-id}`

For auto-correction mode, write access to DynamoDB is also required.

## Usage

### Basic Verification (Report Only)

```bash
# Verify dev environment
./scripts/verify-metadata.sh

# Verify prod environment
./scripts/verify-metadata.sh prod
```

### Fast Mode (Lightweight Checks)

Skip heavy operations like duration extraction and hash calculation:

```bash
# Fast verification (completes in ~30 seconds for 100 tracks)
./scripts/verify-metadata.sh dev --fast
```

### Auto-Correction Mode

Automatically fix detected metadata errors:

```bash
# With confirmation prompt
./scripts/verify-metadata.sh dev --auto-correct

# Skip confirmation (automated workflows)
./scripts/verify-metadata.sh dev --auto-correct --yes

# Fast auto-correction
./scripts/verify-metadata.sh dev --auto-correct --fast --yes
```

### Verbose Mode

Show detailed output during verification:

```bash
./scripts/verify-metadata.sh dev --verbose
```

## Verification Checks

### 1. Title Verification (Lightweight)

Compares database title against expected title derived from filename.

**Example:**
- Filename: `neural_anarchist.mp3`
- Expected: `Neural Anarchist`
- Database: `neural anarchist` ❌

### 2. Duration Verification (Heavy)

Extracts actual audio duration using `ffprobe` and compares with database value.

**Tolerance:** ±2 seconds

**Note:** Requires `ffprobe` to be installed. Skipped in fast mode.

### 3. Genre Verification (Lightweight)

Checks if genre field is set (not "unknown" or empty).

### 4. File Hash Verification (Heavy)

Calculates SHA-256 hash of audio file and compares with stored hash.

**Note:** Downloads entire file. Skipped in fast mode.

### 5. File Existence Check (Lightweight)

Verifies audio file exists in S3 media bucket.

## Error Types

| Error Type | Description | Auto-Correctable |
|------------|-------------|------------------|
| `title_mismatch` | Title doesn't match filename | ✅ Yes |
| `duration_mismatch` | Duration differs by >2 seconds | ✅ Yes |
| `genre_mismatch` | Genre not set or "unknown" | ❌ No (manual) |
| `hash_mismatch` | File hash doesn't match | ✅ Yes |
| `missing_db_entry` | Track in S3 but not in database | ❌ No (manual) |
| `missing_file` | Track in database but file not in S3 | ❌ No (manual) |
| `metadata_incomplete` | Required fields missing | ❌ No (manual) |

## Output

### Report File

Detailed error report saved to:
```
./metadata-verification-report-YYYYMMDD-HHMMSS.txt
```

Example content:
```
[title_mismatch] Track: abc123 - Title mismatch: DB='neural anarchist' Expected='Neural Anarchist' File='neural_anarchist.mp3'
[duration_mismatch] Track: def456 - Duration mismatch: DB=180s Actual=183s File='darkest_hour.mp3'
[metadata_incomplete] Track: ghi789 - Genre not set for track: silicon_horizon.mp3
```

### Backup File (Auto-Correction Mode)

Backup of original metadata saved to:
```
./metadata-backup-YYYYMMDD-HHMMSS.json
```

**Important:** Keep this file to restore if corrections cause issues.

### Summary Report

```
═══════════════════════════════════════════════════════════
           Metadata Verification Report
═══════════════════════════════════════════════════════════

Environment:        dev
Timestamp:          2025-01-15 14:30:00
Mode:               Auto-Correct
Fast mode:          Enabled

─────────────────────────────────────────────────────────────
Statistics:
─────────────────────────────────────────────────────────────
Total tracks:       4
Verified OK:        3
Errors detected:    1
Skipped:            0
Corrections made:   1
Backups created:    1

Success rate:       75%

─────────────────────────────────────────────────────────────
Backup Information:
─────────────────────────────────────────────────────────────
Backup file:        ./metadata-backup-20250115-143000.json
Backed up tracks:   1

To restore from backup:
  Use the restore_from_backup function in this script
  Or manually restore using AWS CLI

─────────────────────────────────────────────────────────────
Error Breakdown:
─────────────────────────────────────────────────────────────
  Title Mismatch: 1

Detailed errors saved to: ./metadata-verification-report-20250115-143000.txt

═══════════════════════════════════════════════════════════
```

## Performance

### Execution Time

| Mode | Tracks | Time | Checks Performed |
|------|--------|------|------------------|
| Fast | 100 | ~30s | Title, Genre, File Existence |
| Full | 100 | ~5m | All checks including Duration, Hash |
| Fast | 10 | ~5s | Title, Genre, File Existence |
| Full | 10 | ~30s | All checks including Duration, Hash |

### Optimization Features

1. **S3 Key Caching**: Lists all S3 keys once and caches for fast lookups
2. **Progress Bar**: Real-time progress with ETA calculation
3. **Lightweight Pre-check**: Fast scan before auto-correction
4. **Conditional Heavy Checks**: Skip duration/hash in fast mode

## Safety Features

### 1. Automatic Backup

Before any correction, the script backs up the original track metadata:

```bash
# Backup is created automatically
./scripts/verify-metadata.sh dev --auto-correct
```

### 2. Confirmation Prompt

By default, auto-correction requires user confirmation:

```
═══════════════════════════════════════════════════════════
WARNING: Auto-Correction Mode
═══════════════════════════════════════════════════════════

This will automatically correct 3 detected metadata error(s).

A backup will be created before making any changes.
Backup location: /tmp/voislab-metadata-verify-12345/metadata-backup-20250115-143000.json

Do you want to proceed with automatic corrections?

Type 'yes' to continue, or anything else to cancel:
```

Skip with `--yes` flag for automated workflows.

### 3. Rollback Capability

If corrections cause issues, restore from backup:

```bash
# Manual restoration using AWS CLI
aws dynamodb put-item \
  --table-name voislab-audio-metadata-dev \
  --item file://metadata-backup-20250115-143000.json
```

## Common Use Cases

### 1. Daily Health Check

```bash
# Quick daily verification
./scripts/verify-metadata.sh prod --fast
```

### 2. Post-Upload Verification

After uploading new tracks:

```bash
# Verify new tracks were processed correctly
./scripts/verify-metadata.sh dev --verbose
```

### 3. Bulk Correction

Fix all detected issues:

```bash
# Full verification and correction
./scripts/verify-metadata.sh dev --auto-correct --yes
```

### 4. Pre-Production Validation

Before promoting content to production:

```bash
# Comprehensive check
./scripts/verify-metadata.sh dev
```

## Troubleshooting

### Issue: "AWS CLI not found"

**Solution:**
```bash
# Install AWS CLI
brew install awscli

# Configure credentials
aws configure
```

### Issue: "jq not found"

**Solution:**
```bash
brew install jq
```

### Issue: "Duration verification skipped"

**Cause:** `ffprobe` not installed

**Solution:**
```bash
brew install ffmpeg
```

### Issue: "Bucket not found"

**Cause:** Backend infrastructure not deployed

**Solution:**
```bash
cd infrastructure
npm run deploy:dev
```

### Issue: "Permission denied"

**Cause:** Insufficient AWS permissions

**Solution:** Ensure IAM user/role has:
- `dynamodb:Scan`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem` (for auto-correction)
- `s3:ListBucket`
- `s3:GetObject`

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Metadata Verification

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y jq ffmpeg
      
      - name: Run verification
        run: |
          cd voislab-website
          ./scripts/verify-metadata.sh prod --fast
      
      - name: Upload report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: verification-report
          path: metadata-verification-report-*.txt
```

## Best Practices

1. **Run Fast Mode Daily**: Quick health checks without heavy operations
2. **Run Full Mode Weekly**: Comprehensive verification including duration/hash
3. **Always Review Reports**: Check error details before auto-correcting
4. **Keep Backups**: Store backup files for at least 30 days
5. **Test in DEV First**: Verify corrections work before running in PROD
6. **Monitor Performance**: Track execution time to detect infrastructure issues

## Related Documentation

- [Music Upload Workflow](./MUSIC_UPLOAD_WORKFLOW.md)
- [Content Promotion](./CONTENT_PROMOTION.md)
- [Local Development](./LOCAL_DEVELOPMENT.md)
- [Troubleshooting Guide](./DEPLOYMENT_INCONSISTENCIES.md)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review error logs in CloudWatch
3. Examine the detailed error report file
4. Contact the development team with backup files if restoration needed
