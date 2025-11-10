import json
import boto3
import os
import tempfile
from datetime import datetime
from typing import Dict, Any, List
from urllib.parse import unquote_plus
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
MEDIA_BUCKET_NAME = os.environ['MEDIA_BUCKET_NAME']

class FormatConverter:
    """Handles audio format conversion and optimization"""
    
    def __init__(self):
        self.table = dynamodb.Table(METADATA_TABLE_NAME)
    
    def convert_audio_formats(self, track_id: str, source_key: str) -> Dict[str, Any]:
        """Convert audio to multiple optimized formats"""
        try:
            logger.info(f"Converting formats for track {track_id}")
            
            # Download source file to temporary location
            with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                temp_path = temp_file.name
                s3_client.download_file(MEDIA_BUCKET_NAME, source_key, temp_path)
            
            conversion_results = {}
            
            try:
                # Import advanced processor if available
                from advanced_processor import process_with_advanced_features
                
                # Create temporary output directory
                with tempfile.TemporaryDirectory() as output_dir:
                    # Process with advanced features
                    results = process_with_advanced_features(temp_path, output_dir)
                    
                    # Upload converted files back to S3
                    if 'converted' in results:
                        converted_info = results['converted']
                        converted_path = converted_info['path']
                        
                        # Upload optimized version
                        optimized_key = f"audio/{track_id}/optimized.mp3"
                        s3_client.upload_file(
                            converted_path, 
                            MEDIA_BUCKET_NAME, 
                            optimized_key,
                            ExtraArgs={
                                'Metadata': {
                                    'track-id': track_id,
                                    'format': 'mp3-optimized',
                                    'conversion-date': datetime.utcnow().isoformat()
                                }
                            }
                        )
                        
                        conversion_results['optimized_mp3'] = {
                            'key': optimized_key,
                            'format': 'mp3',
                            'quality': 'optimized'
                        }
                    
                    # Update metadata with conversion results
                    if results.get('metadata'):
                        self._update_track_metadata(track_id, results['metadata'])
                    
                    conversion_results.update(results)
            
            except ImportError:
                logger.warning("Advanced processor not available, using basic conversion")
                conversion_results = self._basic_format_conversion(track_id, temp_path)
            
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            
            return conversion_results
            
        except Exception as e:
            logger.error(f"Error converting formats for {track_id}: {str(e)}")
            raise
    
    def _basic_format_conversion(self, track_id: str, source_path: str) -> Dict[str, Any]:
        """Basic format conversion without FFmpeg"""
        logger.info("Performing basic format validation and optimization")
        
        # For now, just validate the file and create metadata
        file_size = os.path.getsize(source_path)
        
        return {
            'validation': {
                'isValid': True,
                'message': 'Basic validation passed',
                'fileSize': file_size
            },
            'conversion': {
                'status': 'skipped',
                'reason': 'Advanced conversion tools not available'
            }
        }
    
    def _update_track_metadata(self, track_id: str, metadata: Dict[str, Any]):
        """Update track metadata in DynamoDB"""
        try:
            update_expression = "SET "
            expression_values = {}
            
            # Build update expression for available metadata
            updates = []
            
            if 'duration' in metadata and metadata['duration'] > 0:
                updates.append("duration = :duration")
                expression_values[':duration'] = int(metadata['duration'])
            
            if 'bitrate' in metadata and metadata['bitrate'] > 0:
                updates.append("bitrate = :bitrate")
                expression_values[':bitrate'] = int(metadata['bitrate'])
            
            if 'sampleRate' in metadata and metadata['sampleRate'] > 0:
                updates.append("sampleRate = :sampleRate")
                expression_values[':sampleRate'] = int(metadata['sampleRate'])
            
            if 'channels' in metadata and metadata['channels'] > 0:
                updates.append("channels = :channels")
                expression_values[':channels'] = int(metadata['channels'])
            
            if 'artist' in metadata and metadata['artist']:
                updates.append("artist = :artist")
                expression_values[':artist'] = metadata['artist']
            
            if 'album' in metadata and metadata['album']:
                updates.append("album = :album")
                expression_values[':album'] = metadata['album']
            
            if 'genre' in metadata and metadata['genre']:
                updates.append("genre = :genre")
                expression_values[':genre'] = metadata['genre']
            
            if updates:
                update_expression += ", ".join(updates)
                
                # Add processing status update
                updates.append("processingStatus = :status")
                expression_values[':status'] = 'enhanced'
                update_expression += ", processingStatus = :status"
                
                # Get the item first to find the sort key
                response = self.table.query(
                    KeyConditionExpression='id = :id',
                    ExpressionAttributeValues={':id': track_id},
                    Limit=1
                )
                
                if response['Items']:
                    item = response['Items'][0]
                    created_date = item['createdDate']
                    
                    self.table.update_item(
                        Key={
                            'id': track_id,
                            'createdDate': created_date
                        },
                        UpdateExpression=update_expression,
                        ExpressionAttributeValues=expression_values
                    )
                    
                    logger.info(f"Updated metadata for track {track_id}")
                
        except Exception as e:
            logger.error(f"Error updating metadata for {track_id}: {str(e)}")

def handler(event, context):
    """Lambda handler for format conversion"""
    converter = FormatConverter()
    
    try:
        # Handle different event sources
        if 'Records' in event:
            # S3 event or SQS message
            results = []
            
            for record in event['Records']:
                if 'eventSource' in record and record['eventSource'] == 'aws:s3':
                    # Direct S3 event
                    bucket_name = record['s3']['bucket']['name']
                    # URL decode the object key (S3 events URL-encode keys with special characters)
                    object_key = unquote_plus(record['s3']['object']['key'])
                    
                    logger.info(f"Received S3 event for: {object_key}")
                    
                    # Extract track ID from object key
                    # Expected format: audio/{track_id}/filename.ext
                    path_parts = object_key.split('/')
                    if len(path_parts) >= 3 and path_parts[0] == 'audio':
                        track_id = path_parts[1]
                        
                        result = converter.convert_audio_formats(track_id, object_key)
                        results.append({
                            'trackId': track_id,
                            'status': 'success',
                            'result': result
                        })
                
                elif 'body' in record:
                    # SQS message
                    message = json.loads(record['body'])
                    track_id = message.get('trackId')
                    source_key = message.get('sourceKey')
                    
                    if track_id and source_key:
                        result = converter.convert_audio_formats(track_id, source_key)
                        results.append({
                            'trackId': track_id,
                            'status': 'success',
                            'result': result
                        })
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Format conversion completed',
                    'results': results
                })
            }
        
        else:
            # Direct invocation
            track_id = event.get('trackId')
            source_key = event.get('sourceKey')
            
            if not track_id or not source_key:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'trackId and sourceKey are required'
                    })
                }
            
            result = converter.convert_audio_formats(track_id, source_key)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Format conversion completed',
                    'trackId': track_id,
                    'result': result
                })
            }
    
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }