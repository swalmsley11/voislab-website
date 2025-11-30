# Metadata Enrichment

## Overview

The VoisLab metadata enrichment system automatically extracts embedded metadata from uploaded audio files, including ID3 tags, album artwork, and accurate audio properties. This happens automatically after the initial audio processing completes.

## Architecture

```
Upload → Audio Processor → Metadata Enricher → Enhanced Track
         (Basic Info)      (Embedded Tags)      (Complete Metadata)
```

### Two-Stage Processing

1. **Audio Processor** (Fast, ~5 seconds)
   - File validation and security scanning
   - Basic metadata from filename
   - File copying to media bucket
   - Initial DynamoDB record creation
   - Status: `processed`

2. **Metadata Enricher** (Thorough, ~10-30 seconds)
   - Extract embedded ID3/Vorbis/RIFF tags
   - Extract and store album artwork
   - Get accurate duration via audio analysis
   - Extract audio properties (bitrate, sample rate, channels)
   - Update DynamoDB with enriched data
   - Status: `enhanced`

## Supported Metadata

### Common Fields

| Field | Source | Example |
|-------|--------|---------|
| Title | ID3/Vorbis `TITLE` | "Neural Anarchist" |
| Artist | ID3/Vorbis `ARTIST` | "VoisLab" |
| Album | ID3/Vorbis `ALBUM` | "Synthetic Dreams" |
| Genre | ID3/Vorbis `GENRE` | "Electronic" |
| Year | ID3/Vorbis `DATE` | "2025" |
| Track Number | ID3/Vorbis `TRACKNUMBER` | "3" |
| Album Artist | ID3/Vorbis `ALBUMARTIST` | "VoisLab" |
| Composer | ID3/Vorbis `COMPOSER` | "AI Composer" |
| Description | ID3/Vorbis `COMMENT` | "Track description" |

### Extended Fields

| Field | Source | Example |
|-------|--------|---------|
| BPM | ID3/Vorbis `BPM` | "128" |
| Key | ID3/Vorbis `INITIALKEY` | "Am" |
| ISRC | ID3/Vorbis `ISRC` | "USRC17607839" |
| Copyright | ID3/Vorbis `COPYRIGHT` | "© 2025 VoisLab" |
| Publisher | ID3/Vorbis `ORGANIZATION` | "VoisLab Records" |

### Audio Properties

| Property | Source | Example |
|----------|--------|---------|
| Duration | Audio analysis | 245 (seconds) |
| Bitrate | Audio stream | 320000 (bps) |
| Sample Rate | Audio stream | 44100 (Hz) |
| Channels | Audio stream | 2 (stereo) |

### Album Artwork

- **Extracted from**: ID3 APIC frames, FLAC pictures, MP4 cover art, Vorbis metadata
- **Stored in**: S3 at `artwork/{track_id}/cover.{ext}`
- **Formats supported**: JPEG, PNG, GIF, BMP, WebP
- **Delivered via**: CloudFront CDN
- **Field**: `thumbnailUrl`

## File Format Support

### MP3 (ID3 Tags)
- ✅ ID3v2.3 and ID3v2.4
- ✅ All standard frames (TIT2, TPE1, TALB, etc.)
- ✅ APIC frames (album artwork)
- ✅ Custom frames

### FLAC (Vorbis Comments)
- ✅ All standard Vorbis comment fields
- ✅ Embedded pictures
- ✅ Multiple pictures (front cover, back cover, etc.)

### M4A/MP4 (iTunes Tags)
- ✅ Standard iTunes metadata atoms
- ✅ Cover art (covr atom)
- ✅ Both JPEG and PNG artwork

### OGG Vorbis
- ✅ Vorbis comments
- ✅ METADATA_BLOCK_PICTURE (artwork)

### WAV (RIFF INFO)
- ✅ RIFF INFO chunks
- ⚠️ Limited metadata support (WAV typically has minimal embedded metadata)
- ❌ Artwork rarely supported in WAV

## Usage

### Automatic Enrichment

Metadata enrichment happens automatically when you upload audio files:

```bash
# Upload audio file with embedded metadata
./scripts/upload-audio.sh my-track.mp3 dev

# Wait for processing (5-10 seconds)
# Then wait for enrichment (10-30 seconds)

# Verify enrichment completed
./scripts/verify-track-processing.sh my-track.mp3 dev
```

The track status will change from `processed` → `enhanced` when enrichment completes.

### Manual Enrichment

You can manually trigger enrichment for a specific track:

```bash
# Get track ID from DynamoDB
TRACK_ID="abc-123-def-456"
S3_KEY="audio/${TRACK_ID}/my-track.mp3"

# Invoke enricher Lambda
aws lambda invoke \
  --function-name voislab-metadata-enricher-dev \
  --payload "{\"trackId\":\"${TRACK_ID}\",\"s3Key\":\"${S3_KEY}\"}" \
  response.json

# Check response
cat response.json
```

### Batch Enrichment

Re-enrich all tracks (useful after updating the enricher):

```bash
# Get all track IDs and S3 keys from DynamoDB
aws dynamodb scan \
  --table-name voislab-audio-metadata-dev \
  --projection-expression "id,fileUrl" \
  --output json | \
  jq -r '.Items[] | "\(.id.S) \(.fileUrl.S)"' | \
  while read track_id file_url; do
    # Extract S3 key from URL
    s3_key=$(echo "$file_url" | sed 's|.*/||' | sed "s|^|audio/${track_id}/|")
    
    # Invoke enricher
    aws lambda invoke \
      --function-name voislab-metadata-enricher-dev \
      --invocation-type Event \
      --payload "{\"trackId\":\"${track_id}\",\"s3Key\":\"${s3_key}\"}" \
      /dev/null
    
    echo "Triggered enrichment for $track_id"
    sleep 0.5  # Rate limiting
  done
```

## Preparing Audio Files

### Best Practices

To ensure maximum metadata extraction:

1. **Tag your files before uploading**
   ```bash
   # Use a tagging tool like:
   # - MusicBrainz Picard (GUI)
   # - Kid3 (GUI)
   # - eyeD3 (CLI)
   # - mid3v2 (CLI)
   
   # Example with mid3v2 (MP3):
   mid3v2 \
     --artist "VoisLab" \
     --album "Synthetic Dreams" \
     --song "Neural Anarchist" \
     --genre "Electronic" \
     --year "2025" \
     --track "3" \
     --picture "cover.jpg:FRONT_COVER" \
     my-track.mp3
   ```

2. **Include album artwork**
   - Recommended size: 1400x1400 or 3000x3000 pixels
   - Format: JPEG (smaller) or PNG (higher quality)
   - Embed as "Front Cover" type

3. **Use consistent naming**
   - Even with tags, filename is used as fallback
   - Format: `Artist - Title.ext` or `Title.ext`

4. **Set all relevant fields**
   - Title, Artist, Album (minimum)
   - Genre, Year, Track Number (recommended)
   - BPM, Key, ISRC (for DJ/production use)

### Tagging Tools

#### GUI Tools
- **MusicBrainz Picard** (Free, cross-platform)
  - Automatic metadata lookup
  - Batch processing
  - Download: https://picard.musicbrainz.org/

- **Kid3** (Free, cross-platform)
  - Manual tagging
  - Multiple format support
  - Download: https://kid3.kde.org/

- **Mp3tag** (Free, Windows)
  - Powerful batch editing
  - Download: https://www.mp3tag.de/

#### CLI Tools
- **eyeD3** (Python)
  ```bash
  pip install eyeD3
  eyeD3 --artist "VoisLab" --title "Track" file.mp3
  ```

- **mid3v2** (Python, part of mutagen)
  ```bash
  pip install mutagen
  mid3v2 --artist "VoisLab" file.mp3
  ```

- **ffmpeg** (For format conversion with metadata preservation)
  ```bash
  ffmpeg -i input.wav -metadata artist="VoisLab" output.mp3
  ```

## Monitoring

### Check Enrichment Status

```bash
# Query DynamoDB for track status
aws dynamodb get-item \
  --table-name voislab-audio-metadata-dev \
  --key '{"id":{"S":"TRACK_ID"}}' \
  --query 'Item.{status:status.S,enrichedAt:enrichedAt.S}'
```

### CloudWatch Logs

```bash
# View enricher logs
aws logs tail /aws/lambda/voislab-metadata-enricher-dev --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/voislab-metadata-enricher-dev \
  --filter-pattern "ERROR"
```

### Metrics

Key metrics to monitor:
- **Enrichment success rate**: Tracks with status `enhanced` vs `processed`
- **Artwork extraction rate**: Tracks with `thumbnailUrl` populated
- **Processing time**: Duration from upload to enrichment complete
- **Error rate**: Failed enrichments

## Troubleshooting

### Issue: Metadata not extracted

**Symptoms:**
- Track status is `processed` but not `enhanced`
- Fields like artist, album are empty
- No album artwork

**Causes & Solutions:**

1. **File has no embedded metadata**
   ```bash
   # Check if file has tags
   ffprobe -v quiet -show_format -show_streams file.mp3
   
   # Solution: Tag the file before uploading
   mid3v2 --artist "Artist" --song "Title" file.mp3
   ```

2. **Enricher Lambda failed**
   ```bash
   # Check CloudWatch logs
   aws logs tail /aws/lambda/voislab-metadata-enricher-dev --since 10m
   
   # Look for error messages
   ```

3. **Enricher not triggered**
   ```bash
   # Check audio processor logs
   aws logs tail /aws/lambda/voislab-audio-processor-dev --since 10m
   
   # Look for "Triggered metadata enricher" message
   ```

### Issue: Album artwork not showing

**Symptoms:**
- `thumbnailUrl` field is empty or null
- Artwork exists in file but not extracted

**Causes & Solutions:**

1. **Artwork not embedded in file**
   ```bash
   # Check for embedded artwork
   ffprobe -v quiet -show_entries format_tags=picture file.mp3
   
   # Solution: Embed artwork
   mid3v2 --picture "cover.jpg:FRONT_COVER" file.mp3
   ```

2. **Unsupported artwork format**
   - Solution: Convert to JPEG or PNG
   ```bash
   convert artwork.bmp artwork.jpg
   mid3v2 --picture "artwork.jpg:FRONT_COVER" file.mp3
   ```

3. **Artwork too large**
   - Lambda has 512MB memory limit
   - Solution: Resize artwork before embedding
   ```bash
   convert cover.jpg -resize 1400x1400 cover-resized.jpg
   ```

### Issue: Incorrect duration

**Symptoms:**
- Duration is estimated (rough) instead of accurate
- Duration doesn't match actual playback time

**Causes & Solutions:**

1. **Mutagen couldn't read audio stream**
   ```bash
   # Check file integrity
   ffprobe file.mp3
   
   # Solution: Re-encode if corrupted
   ffmpeg -i input.mp3 -c:a copy output.mp3
   ```

2. **Variable bitrate (VBR) file**
   - VBR files may have inaccurate duration in headers
   - Mutagen should handle this, but check logs

### Issue: Enrichment taking too long

**Symptoms:**
- Enrichment takes >1 minute
- Lambda timeout errors

**Causes & Solutions:**

1. **Large file size**
   - Files >50MB take longer to download
   - Solution: Increase Lambda timeout or memory

2. **High-resolution artwork**
   - Large embedded images slow processing
   - Solution: Resize artwork to 1400x1400 max

3. **Lambda cold start**
   - First invocation after idle period is slower
   - This is normal, subsequent invocations are faster

## API Response

### Before Enrichment (status: processed)

```json
{
  "id": "abc-123-def-456",
  "title": "Neural Anarchist",
  "artist": null,
  "album": null,
  "genre": "unknown",
  "duration": 245,
  "thumbnailUrl": null,
  "status": "processed",
  "fileUrl": "https://cdn.voislab.com/audio/abc-123/neural_anarchist.mp3"
}
```

### After Enrichment (status: enhanced)

```json
{
  "id": "abc-123-def-456",
  "title": "Neural Anarchist",
  "artist": "VoisLab",
  "album": "Synthetic Dreams",
  "albumArtist": "VoisLab",
  "genre": "Electronic",
  "year": "2025",
  "trackNumber": "3",
  "duration": 247,
  "bitrate": 320000,
  "sampleRate": 44100,
  "channels": 2,
  "bpm": 128,
  "key": "Am",
  "thumbnailUrl": "https://cdn.voislab.com/artwork/abc-123/cover.jpg",
  "description": "A journey through synthetic soundscapes",
  "status": "enhanced",
  "enrichedAt": "2025-11-15T14:30:00.000Z",
  "fileUrl": "https://cdn.voislab.com/audio/abc-123/neural_anarchist.mp3"
}
```

## Performance

### Typical Processing Times

| File Size | Format | Enrichment Time |
|-----------|--------|-----------------|
| 5 MB | MP3 | 10-15 seconds |
| 10 MB | MP3 | 15-20 seconds |
| 30 MB | FLAC | 20-30 seconds |
| 50 MB | WAV | 30-45 seconds |

### Optimization Tips

1. **Use compressed formats** (MP3, M4A) instead of WAV for faster processing
2. **Resize artwork** to 1400x1400 before embedding
3. **Remove unnecessary tags** to reduce file size
4. **Use constant bitrate (CBR)** instead of VBR for faster duration extraction

## Cost Considerations

### Lambda Invocations
- **Audio Processor**: $0.0000002 per invocation
- **Metadata Enricher**: $0.0000002 per invocation
- **Total per upload**: ~$0.0000004

### Lambda Duration
- **Audio Processor**: ~5 seconds @ 1024MB
- **Metadata Enricher**: ~20 seconds @ 1024MB
- **Cost per upload**: ~$0.0005

### S3 Storage
- **Audio file**: Original size
- **Artwork**: ~500KB average
- **Total additional**: Minimal

### Data Transfer
- **Download for enrichment**: Charged at S3 rates
- **Upload artwork**: Charged at S3 rates
- **CloudFront delivery**: Charged at CloudFront rates

**Estimated cost per 1000 uploads**: ~$0.50

## Related Documentation

- [Music Upload Workflow](./MUSIC_UPLOAD_WORKFLOW.md)
- [Metadata Verification](./METADATA_VERIFICATION.md)
- [Content Promotion](./CONTENT_PROMOTION.md)
- [Integration Testing](./INTEGRATION_TESTING.md)

## Support

For issues with metadata enrichment:
1. Check CloudWatch logs for both audio-processor and metadata-enricher
2. Verify file has embedded metadata using `ffprobe`
3. Test with a known-good file (properly tagged MP3)
4. Check Lambda function permissions and environment variables
