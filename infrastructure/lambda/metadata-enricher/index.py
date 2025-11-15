import json
import boto3
import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from io import BytesIO
from mutagen import File as MutagenFile
from mutagen.id3 import ID3, APIC
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']
CLOUDFRONT_DOMAIN = os.environ.get('CLOUDFRONT_DOMAIN', '')

class MetadataEnricher:
    """Extracts and enriches audio metadata from embedded tags"""
    
    def __init__(self):
        self.table = dynamodb.Table(METADATA_TABLE_NAME)
    
    def enrich_track_metadata(self, track_id: str, s3_key: str) -> Dict[str, Any]:
        """
        Extract embedded metadata from audio file and update DynamoDB
        
        Args:
            track_id: Track ID in DynamoDB
            s3_key: S3 key of the audio file
            
        Returns:
            Dictionary with enriched metadata
        """
        try:
            logger.info(f"Enriching metadata for track {track_id}: {s3_key}")
            
            # Download file to temporary location
            temp_file = f"/tmp/{track_id}"
            s3_client.download_file(MEDIA_BUCKET_NAME, s3_key, temp_file)
            
            # Extract metadata using mutagen
            audio = MutagenFile(temp_file, easy=True)
            
            if audio is None:
                logger.warning(f"Could not read audio file: {s3_key}")
                return {}
            
            # Extract common metadata
            enriched_metadata = self._extract_common_metadata(audio)
            
            # Extract album artwork
            artwork_url = self._extract_and_store_artwork(audio, track_id, temp_file)
            if artwork_url:
                enriched_metadata['thumbnailUrl'] = artwork_url
            
            # Get accurate duration
            if audio.info and hasattr(audio.info, 'length'):
                enriched_metadata['duration'] = int(audio.info.length)
            
            # Get audio properties
            if audio.info:
                if hasattr(audio.info, 'bitrate'):
                    enriched_metadata['bitrate'] = audio.info.bitrate
                if hasattr(audio.info, 'sample_rate'):
                    enriched_metadata['sampleRate'] = audio.info.sample_rate
                if hasattr(audio.info, 'channels'):
                    enriched_metadata['channels'] = audio.info.channels
            
            # Clean up temp file
            os.remove(temp_file)
            
            # Update DynamoDB with enriched metadata
            self._update_dynamodb_metadata(track_id, enriched_metadata)
            
            logger.info(f"Successfully enriched metadata for track {track_id}")
            
            return enriched_metadata
            
        except Exception as e:
            logger.error(f"Error enriching metadata for {track_id}: {str(e)}")
            # Clean up temp file if it exists
            if os.path.exists(f"/tmp/{track_id}"):
                os.remove(f"/tmp/{track_id}")
            raise
    
    def _extract_common_metadata(self, audio) -> Dict[str, Any]:
        """Extract common metadata fields from audio file"""
        metadata = {}
        
        # Title
        if 'title' in audio:
            metadata['title'] = self._get_first_value(audio['title'])
        
        # Artist
        if 'artist' in audio:
            metadata['artist'] = self._get_first_value(audio['artist'])
        
        # Album
        if 'album' in audio:
            metadata['album'] = self._get_first_value(audio['album'])
        
        # Genre
        if 'genre' in audio:
            metadata['genre'] = self._get_first_value(audio['genre'])
        
        # Year
        if 'date' in audio:
            metadata['year'] = self._get_first_value(audio['date'])
        
        # Track number
        if 'tracknumber' in audio:
            metadata['trackNumber'] = self._get_first_value(audio['tracknumber'])
        
        # Album artist
        if 'albumartist' in audio:
            metadata['albumArtist'] = self._get_first_value(audio['albumartist'])
        
        # Composer
        if 'composer' in audio:
            metadata['composer'] = self._get_first_value(audio['composer'])
        
        # Comment/Description
        if 'comment' in audio:
            metadata['description'] = self._get_first_value(audio['comment'])
        
        # BPM
        if 'bpm' in audio:
            try:
                metadata['bpm'] = int(self._get_first_value(audio['bpm']))
            except (ValueError, TypeError):
                pass
        
        # Key
        if 'initialkey' in audio:
            metadata['key'] = self._get_first_value(audio['initialkey'])
        
        # ISRC
        if 'isrc' in audio:
            metadata['isrc'] = self._get_first_value(audio['isrc'])
        
        # Copyright
        if 'copyright' in audio:
            metadata['copyright'] = self._get_first_value(audio['copyright'])
        
        # Publisher
        if 'organization' in audio:
            metadata['publisher'] = self._get_first_value(audio['organization'])
        
        return metadata
    
    def _get_first_value(self, value) -> str:
        """Get first value from list or return string"""
        if isinstance(value, list) and len(value) > 0:
            return str(value[0])
        return str(value)
    
    def _extract_and_store_artwork(self, audio, track_id: str, temp_file: str) -> Optional[str]:
        """
        Extract album artwork and store in S3
        
        Returns:
            CloudFront URL of the artwork, or None if no artwork found
        """
        try:
            artwork_data = None
            mime_type = None
            
            # Try different methods based on file type
            if isinstance(audio, ID3) or hasattr(audio, 'tags') and isinstance(audio.tags, ID3):
                # MP3 with ID3 tags
                artwork_data, mime_type = self._extract_id3_artwork(audio)
            
            elif isinstance(audio, FLAC):
                # FLAC files
                artwork_data, mime_type = self._extract_flac_artwork(audio)
            
            elif isinstance(audio, MP4):
                # M4A/MP4 files
                artwork_data, mime_type = self._extract_mp4_artwork(audio)
            
            elif isinstance(audio, OggVorbis):
                # OGG Vorbis files
                artwork_data, mime_type = self._extract_ogg_artwork(audio)
            
            elif isinstance(audio, WAVE):
                # WAV files (less common to have artwork)
                logger.info("WAV files typically don't contain embedded artwork")
            
            if artwork_data:
                # Determine file extension from MIME type
                ext_map = {
                    'image/jpeg': 'jpg',
                    'image/jpg': 'jpg',
                    'image/png': 'png',
                    'image/gif': 'gif',
                    'image/bmp': 'bmp',
                    'image/webp': 'webp'
                }
                ext = ext_map.get(mime_type, 'jpg')
                
                # Upload to S3
                artwork_key = f"artwork/{track_id}/cover.{ext}"
                
                s3_client.put_object(
                    Bucket=MEDIA_BUCKET_NAME,
                    Key=artwork_key,
                    Body=artwork_data,
                    ContentType=mime_type,
                    CacheControl='public, max-age=31536000'  # Cache for 1 year
                )
                
                # Generate CloudFront URL
                if CLOUDFRONT_DOMAIN:
                    artwork_url = f"https://{CLOUDFRONT_DOMAIN}/{artwork_key}"
                else:
                    artwork_url = f"https://{MEDIA_BUCKET_NAME}.s3.amazonaws.com/{artwork_key}"
                
                logger.info(f"Stored artwork for track {track_id}: {artwork_url}")
                return artwork_url
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting artwork: {str(e)}")
            return None
    
    def _extract_id3_artwork(self, audio) -> tuple[Optional[bytes], Optional[str]]:
        """Extract artwork from ID3 tags (MP3)"""
        try:
            tags = audio.tags if hasattr(audio, 'tags') else audio
            
            if tags is None:
                return None, None
            
            # Look for APIC (Attached Picture) frames
            for key in tags.keys():
                if key.startswith('APIC'):
                    apic = tags[key]
                    return apic.data, apic.mime
            
            return None, None
        except Exception as e:
            logger.error(f"Error extracting ID3 artwork: {str(e)}")
            return None, None
    
    def _extract_flac_artwork(self, audio: FLAC) -> tuple[Optional[bytes], Optional[str]]:
        """Extract artwork from FLAC files"""
        try:
            if audio.pictures:
                # Get the first picture (usually front cover)
                picture = audio.pictures[0]
                return picture.data, picture.mime
            return None, None
        except Exception as e:
            logger.error(f"Error extracting FLAC artwork: {str(e)}")
            return None, None
    
    def _extract_mp4_artwork(self, audio: MP4) -> tuple[Optional[bytes], Optional[str]]:
        """Extract artwork from MP4/M4A files"""
        try:
            if 'covr' in audio.tags:
                cover = audio.tags['covr'][0]
                
                # Determine MIME type from imageformat
                if cover.imageformat == MP4Cover.FORMAT_JPEG:
                    mime_type = 'image/jpeg'
                elif cover.imageformat == MP4Cover.FORMAT_PNG:
                    mime_type = 'image/png'
                else:
                    mime_type = 'image/jpeg'  # Default
                
                return bytes(cover), mime_type
            
            return None, None
        except Exception as e:
            logger.error(f"Error extracting MP4 artwork: {str(e)}")
            return None, None
    
    def _extract_ogg_artwork(self, audio: OggVorbis) -> tuple[Optional[bytes], Optional[str]]:
        """Extract artwork from OGG Vorbis files"""
        try:
            # OGG Vorbis can have METADATA_BLOCK_PICTURE
            if 'metadata_block_picture' in audio:
                import base64
                picture_data = base64.b64decode(audio['metadata_block_picture'][0])
                
                # Parse the picture block (simplified)
                # This is a basic implementation - full parsing would be more complex
                return picture_data, 'image/jpeg'
            
            return None, None
        except Exception as e:
            logger.error(f"Error extracting OGG artwork: {str(e)}")
            return None, None
    
    def _update_dynamodb_metadata(self, track_id: str, metadata: Dict[str, Any]):
        """Update DynamoDB record with enriched metadata"""
        try:
            # Get existing record to get the sort key (createdDate)
            response = self.table.query(
                KeyConditionExpression='id = :id',
                ExpressionAttributeValues={':id': track_id},
                Limit=1
            )
            
            if not response['Items']:
                logger.error(f"Track {track_id} not found in DynamoDB")
                return
            
            item = response['Items'][0]
            created_date = item['createdDate']
            
            # Build update expression
            update_parts = []
            expression_values = {}
            expression_names = {}
            
            for key, value in metadata.items():
                # Convert camelCase to snake_case for attribute names if needed
                attr_name = f"#{key}"
                attr_value = f":{key}"
                
                update_parts.append(f"{attr_name} = {attr_value}")
                expression_values[attr_value] = value
                expression_names[attr_name] = key
            
            # Add enrichment timestamp
            update_parts.append("#enrichedAt = :enrichedAt")
            expression_values[':enrichedAt'] = datetime.utcnow().isoformat()
            expression_names['#enrichedAt'] = 'enrichedAt'
            
            # Update status to 'enhanced'
            update_parts.append("#status = :status")
            expression_values[':status'] = 'enhanced'
            expression_names['#status'] = 'status'
            
            update_expression = "SET " + ", ".join(update_parts)
            
            # Update the item
            self.table.update_item(
                Key={
                    'id': track_id,
                    'createdDate': created_date
                },
                UpdateExpression=update_expression,
                ExpressionAttributeNames=expression_names,
                ExpressionAttributeValues=expression_values
            )
            
            logger.info(f"Updated DynamoDB record for track {track_id}")
            
        except Exception as e:
            logger.error(f"Error updating DynamoDB: {str(e)}")
            raise


def handler(event, context):
    """
    Lambda handler for metadata enrichment
    
    Can be triggered by:
    1. EventBridge rule after audio-processor completes
    2. Direct invocation with track_id and s3_key
    3. SQS queue message
    """
    enricher = MetadataEnricher()
    results = []
    
    try:
        # Handle different event sources
        if 'Records' in event:
            # SQS or SNS event
            for record in event['Records']:
                if 'Sns' in record:
                    # SNS message
                    message = json.loads(record['Sns']['Message'])
                    track_id = message.get('trackId')
                    s3_key = message.get('s3Key')
                elif 'body' in record:
                    # SQS message
                    message = json.loads(record['body'])
                    track_id = message.get('trackId')
                    s3_key = message.get('s3Key')
                else:
                    continue
                
                if track_id and s3_key:
                    enriched = enricher.enrich_track_metadata(track_id, s3_key)
                    results.append({
                        'trackId': track_id,
                        'status': 'success',
                        'enrichedMetadata': enriched
                    })
        
        elif 'trackId' in event and 's3Key' in event:
            # Direct invocation
            track_id = event['trackId']
            s3_key = event['s3Key']
            
            enriched = enricher.enrich_track_metadata(track_id, s3_key)
            results.append({
                'trackId': track_id,
                'status': 'success',
                'enrichedMetadata': enriched
            })
        
        else:
            logger.error(f"Unsupported event format: {json.dumps(event)}")
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'message': 'Invalid event format',
                    'error': 'Expected trackId and s3Key'
                })
            }
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Metadata enrichment completed',
                'results': results
            })
        }
        
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Metadata enrichment failed',
                'error': str(e)
            })
        }
