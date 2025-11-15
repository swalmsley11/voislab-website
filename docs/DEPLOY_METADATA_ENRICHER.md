# Deploying the Metadata Enricher

## Overview

This guide walks you through deploying the metadata enrichment Lambda function to your VoisLab infrastructure.

## Prerequisites

- Existing VoisLab backend infrastructure deployed
- AWS CLI configured
- Node.js and npm installed
- Python 3.11 installed

## Deployment Steps

### 1. Install Python Dependencies

The metadata enricher requires the `mutagen` library for reading audio metadata.

```bash
cd voislab-website/infrastructure/lambda/metadata-enricher

# Create a package directory
mkdir -p package

# Install mutagen to the package directory
pip install -r requirements.txt -t package/

# Copy the Lambda function code
cp index.py package/

# Create deployment package
cd package
zip -r ../metadata-enricher.zip .
cd ..

# Clean up
rm -rf package
```

### 2. Deploy Infrastructure

The metadata enricher is included in the CDK stack. Deploy it:

```bash
cd voislab-website/infrastructure

# Deploy to dev
npm run deploy:dev

# Or deploy to prod
npm run deploy:prod
```

### 3. Verify Deployment

Check that the Lambda function was created:

```bash
# List Lambda functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `metadata-enricher`)].FunctionName'

# Get function details
aws lambda get-function --function-name voislab-metadata-enricher-dev
```

### 4. Test the Enricher

Upload a test file with embedded metadata:

```bash
# Create a test MP3 with metadata
# (Use a tool like mid3v2 or MusicBrainz Picard to tag a file)

# Upload the file
./scripts/upload-audio.sh test-track.mp3 dev

# Wait for processing (5-10 seconds)
sleep 10

# Check if enrichment completed
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --filter-expression "filename = :fn" \
  --expression-attribute-values '{":fn":{"S":"test-track.mp3"}}' \
  --query 'Items[0].{status:status.S,artist:artist.S,album:album.S,thumbnailUrl:thumbnailUrl.S}'
```

Expected output:
```json
{
  "status": "enhanced",
  "artist": "Your Artist",
  "album": "Your Album",
  "thumbnailUrl": "https://cdn.voislab.com/artwork/abc-123/cover.jpg"
}
```

## Troubleshooting

### Issue: Lambda deployment fails

**Error:** "Unable to import module 'index'"

**Solution:** The mutagen library wasn't packaged correctly.

```bash
# Rebuild the package
cd infrastructure/lambda/metadata-enricher
rm -rf package metadata-enricher.zip

# Install dependencies with correct architecture
pip install -r requirements.txt \
  --platform manylinux2014_x86_64 \
  --target package \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --upgrade

# Copy code and zip
cp index.py package/
cd package && zip -r ../metadata-enricher.zip . && cd ..

# Redeploy
cd ../..
npm run deploy:dev
```

### Issue: Enricher not triggered

**Symptoms:** Tracks stay in `processed` status, never become `enhanced`

**Check audio processor logs:**
```bash
aws logs tail /aws/lambda/voislab-audio-processor-dev --follow
```

Look for: "Triggered metadata enricher for track..."

**If not found:**
1. Check that `METADATA_ENRICHER_FUNCTION` environment variable is set:
   ```bash
   aws lambda get-function-configuration \
     --function-name voislab-audio-processor-dev \
     --query 'Environment.Variables.METADATA_ENRICHER_FUNCTION'
   ```

2. Check IAM permissions:
   ```bash
   aws lambda get-policy \
     --function-name voislab-metadata-enricher-dev
   ```

### Issue: Enricher times out

**Error:** "Task timed out after 300.00 seconds"

**Solution:** Increase Lambda timeout or memory:

```typescript
// In voislab-website-stack.ts
const metadataEnricherFunction = new lambda.Function(this, 'MetadataEnricherFunction', {
  // ...
  timeout: cdk.Duration.minutes(10),  // Increase from 5 to 10
  memorySize: 2048,  // Increase from 1024 to 2048
});
```

Then redeploy:
```bash
npm run deploy:dev
```

### Issue: Artwork not extracted

**Check enricher logs:**
```bash
aws logs tail /aws/lambda/voislab-metadata-enricher-dev --follow
```

Look for errors like:
- "Could not read audio file"
- "Error extracting artwork"

**Common causes:**
1. File has no embedded artwork
2. Artwork format not supported
3. File is corrupted

**Test with a known-good file:**
```bash
# Download a sample MP3 with artwork
curl -o test.mp3 "https://example.com/sample-with-artwork.mp3"

# Upload and test
./scripts/upload-audio.sh test.mp3 dev
```

## Manual Invocation

You can manually invoke the enricher for testing:

```bash
# Get a track ID from DynamoDB
TRACK_ID=$(aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --limit 1 \
  --query 'Items[0].id.S' \
  --output text)

# Get the S3 key
S3_KEY="audio/${TRACK_ID}/filename.mp3"

# Invoke enricher
aws lambda invoke \
  --function-name voislab-metadata-enricher-dev \
  --payload "{\"trackId\":\"${TRACK_ID}\",\"s3Key\":\"${S3_KEY}\"}" \
  response.json

# Check response
cat response.json
```

## Monitoring

### CloudWatch Metrics

Key metrics to monitor:
- **Invocations**: Number of enrichment attempts
- **Errors**: Failed enrichments
- **Duration**: Processing time
- **Throttles**: Rate limiting issues

```bash
# View metrics in CloudWatch console
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=voislab-metadata-enricher-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

### CloudWatch Logs Insights

Query for enrichment statistics:

```sql
fields @timestamp, @message
| filter @message like /Successfully enriched metadata/
| stats count() as enriched_tracks by bin(5m)
```

Query for errors:

```sql
fields @timestamp, @message
| filter @message like /Error enriching metadata/
| sort @timestamp desc
| limit 20
```

## Cost Optimization

### Reduce Lambda Costs

1. **Optimize memory allocation**
   - Start with 1024MB
   - Monitor actual usage
   - Adjust based on metrics

2. **Use reserved concurrency**
   - Prevents runaway costs
   - Already set in CDK stack

3. **Implement caching**
   - Cache S3 downloads if re-processing
   - Use EFS for shared cache (advanced)

### Reduce S3 Costs

1. **Lifecycle policies for artwork**
   ```bash
   # Move old artwork to Glacier after 90 days
   aws s3api put-bucket-lifecycle-configuration \
     --bucket voislab-media-dev-ACCOUNT_ID \
     --lifecycle-configuration file://lifecycle.json
   ```

2. **Compress artwork**
   - Use JPEG instead of PNG
   - Optimize quality vs size

## Rollback

If you need to rollback the deployment:

```bash
# Remove the metadata enricher from the stack
# Comment out the metadataEnricherFunction in voislab-website-stack.ts

# Redeploy
npm run deploy:dev

# Or manually delete the function
aws lambda delete-function \
  --function-name voislab-metadata-enricher-dev
```

## Next Steps

After successful deployment:

1. **Test with various file formats**
   - MP3, FLAC, M4A, OGG, WAV
   - Different tagging tools
   - Various artwork formats

2. **Monitor performance**
   - Check CloudWatch metrics
   - Review logs for errors
   - Track enrichment success rate

3. **Update existing tracks**
   - Use batch enrichment script
   - Re-process tracks without metadata

4. **Configure alerts**
   - Set up CloudWatch alarms
   - Monitor error rates
   - Track processing times

## Related Documentation

- [Metadata Enrichment](./METADATA_ENRICHMENT.md) - Feature overview
- [Metadata Verification](./METADATA_VERIFICATION.md) - Verify metadata quality
- [Music Upload Workflow](./MUSIC_UPLOAD_WORKFLOW.md) - Complete upload process
- [Amplify Deployment](./AMPLIFY_DEPLOYMENT.md) - Infrastructure deployment

## Support

For deployment issues:
1. Check CloudWatch logs for both functions
2. Verify IAM permissions
3. Test with a simple, known-good file
4. Review CDK stack outputs
5. Contact the development team with logs
