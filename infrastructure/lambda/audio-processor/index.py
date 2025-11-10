import json
import boto3
import os
import uuid
import hashlib
import mimetypes
from datetime import datetime
from typing import Dict, Any, Optional, List
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
UPLOAD_BUCKET_NAME = os.environ['UPLOAD_BUCKET_NAME']

# Audio file configuration
SUPPORTED_FORMATS = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg'
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
MIN_FILE_SIZE = 1024  # 1KB

class AudioProcessingError(Exception):
    """Custom exception for audio processing errors"""
    pass

class AudioValidator:
    """Handles audio file validation and security scanning"""
    
    @staticmethod
    def validate_file_extension(filename: str) -> bool:
        """Validate file has supported audio extension"""
        ext = os.path.splitext(filename)[1].lower()
        return ext in SUPPORTED_FORMATS
    
    @staticmethod
    def validate_file_size(file_size: int) -> bool:
        """Validate file size is within acceptable limits"""
        return MIN_FILE_SIZE <= file_size <= MAX_FILE_SIZE
    
    @staticmethod
    def validate_mime_type(bucket: str, key: str) -> bool:
        """Validate MIME type matches file extension"""
        try:
            response = s3_client.head_object(Bucket=bucket, Key=key)
            content_type = response.get('ContentType', '')
            
            # Get expected MIME type from file extension
            ext = os.path.splitext(key)[1].lower()
            expected_mime = SUPPORTED_FORMATS.get(ext)
            
            if not expected_mime:
                return False
            
            # Allow some flexibility in MIME type checking
            return (content_type == expected_mime or 
                   content_type.startswith('audio/') or
                   content_type == 'application/octet-stream')
        except Exception as e:
            logger.error(f"Error validating MIME type: {str(e)}")
            return False
    
    @staticmethod
    def scan_for_malicious_content(bucket: str, key: str) -> bool:
        """Basic security scanning for malicious content"""
        try:
            # Download first 1KB to check for suspicious patterns
            response = s3_client.get_object(
                Bucket=bucket, 
                Key=key, 
                Range='bytes=0-1023'
            )
            
            content = response['Body'].read()
            
            # Check for common malicious patterns
            suspicious_patterns = [
                b'<script',
                b'javascript:',
                b'<?php',
                b'#!/bin/',
                b'cmd.exe',
                b'powershell'
            ]
            
            for pattern in suspicious_patterns:
                if pattern in content.lower():
                    logger.warning(f"Suspicious pattern found in {key}: {pattern}")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"Error scanning file: {str(e)}")
            return False

class AudioMetadataExtractor:
    """Extracts metadata from audio files"""
    
    @staticmethod
    def extract_basic_metadata(filename: str, file_size: int) -> Dict[str, Any]:
        """Extract basic metadata from filename and file properties"""
        # Clean up filename for title
        name_without_ext = os.path.splitext(filename)[0]
        title = (name_without_ext
                .replace('_', ' ')
                .replace('-', ' ')
                .replace('.', ' ')
                .strip()
                .title())
        
        # Extract potential metadata from filename patterns
        metadata = {
            'title': title,
            'filename': filename,
            'fileSize': file_size,
            'format': os.path.splitext(filename)[1].lower().lstrip('.'),
            'duration': 0,  # Will be updated by advanced processing
            'bitrate': 0,   # Will be updated by advanced processing
            'sampleRate': 0, # Will be updated by advanced processing
            'channels': 0,   # Will be updated by advanced processing
        }
        
        # Try to extract artist and track from common filename patterns
        # Pattern: "Artist - Title.ext" or "Artist_Title.ext"
        if ' - ' in title:
            parts = title.split(' - ', 1)
            if len(parts) == 2:
                metadata['artist'] = parts[0].strip()
                metadata['title'] = parts[1].strip()
        
        return metadata
    
    @staticmethod
    def estimate_duration(file_size: int, format_ext: str) -> int:
        """Estimate duration based on file size and format (rough approximation)"""
        # Rough estimates for different formats (bytes per second)
        bitrate_estimates = {
            'mp3': 16000,   # ~128kbps
            'wav': 176400,  # ~1411kbps (CD quality)
            'flac': 88200,  # ~705kbps (compressed lossless)
            'm4a': 16000,   # ~128kbps
            'aac': 16000,   # ~128kbps
            'ogg': 16000    # ~128kbps
        }
        
        bytes_per_second = bitrate_estimates.get(format_ext, 16000)
        return max(1, file_size // bytes_per_second)

class AudioProcessor:
    """Main audio processing class"""
    
    def __init__(self):
        self.validator = AudioValidator()
        self.metadata_extractor = AudioMetadataExtractor()
        self.table = dynamodb.Table(METADATA_TABLE_NAME)
    
    def process_audio_file(self, bucket_name: str, object_key: str) -> Dict[str, Any]:
        """Process a single audio file"""
        try:
            logger.info(f"Processing audio file: {object_key}")
            
            # Step 1: Basic validation
            filename = object_key.split('/')[-1]
            
            if not self.validator.validate_file_extension(filename):
                raise AudioProcessingError(f"Unsupported file format: {filename}")
            
            # Step 2: Get file metadata
            response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
            file_size = response['ContentLength']
            
            if not self.validator.validate_file_size(file_size):
                raise AudioProcessingError(f"File size {file_size} is outside acceptable range")
            
            # Step 3: MIME type validation
            if not self.validator.validate_mime_type(bucket_name, object_key):
                raise AudioProcessingError(f"Invalid MIME type for {filename}")
            
            # Step 4: Security scanning
            if not self.validator.scan_for_malicious_content(bucket_name, object_key):
                raise AudioProcessingError(f"Security scan failed for {filename}")
            
            # Step 5: Generate unique track ID
            track_id = str(uuid.uuid4())
            
            # Step 6: Extract metadata
            metadata = self.metadata_extractor.extract_basic_metadata(filename, file_size)
            
            # Estimate duration if not available
            if metadata['duration'] == 0:
                metadata['duration'] = self.metadata_extractor.estimate_duration(
                    file_size, metadata['format']
                )
            
            # Step 7: Copy to media bucket with organized structure
            media_key = f"audio/{track_id}/{filename}"
            copy_source = {'Bucket': bucket_name, 'Key': object_key}
            
            # Calculate file hash for integrity checking
            file_hash = self._calculate_file_hash(bucket_name, object_key)
            
            s3_client.copy_object(
                CopySource=copy_source,
                Bucket=MEDIA_BUCKET_NAME,
                Key=media_key,
                MetadataDirective='REPLACE',
                Metadata={
                    'track-id': track_id,
                    'original-filename': filename,
                    'processed-date': datetime.utcnow().isoformat(),
                    'file-hash': file_hash,
                    'validation-status': 'passed'
                }
            )
            
            # Step 8: Store metadata in DynamoDB
            created_date = datetime.utcnow().isoformat()
            
            item = {
                'id': track_id,
                'createdDate': created_date,
                'title': metadata['title'],
                'filename': filename,
                'fileUrl': f"https://cloudfront-domain/media/{media_key}",  # Will be updated with actual domain
                'fileSize': file_size,
                'duration': metadata['duration'],
                'format': metadata['format'],
                'status': 'processed',
                'genre': 'unknown',
                'description': '',
                'tags': [],
                'fileHash': file_hash,
                'processingDate': created_date,
                'validationStatus': 'passed'
            }
            
            # Add optional metadata if available
            if 'artist' in metadata:
                item['artist'] = metadata['artist']
            
            self.table.put_item(Item=item)
            
            logger.info(f"Successfully processed {filename} -> {track_id}")
            
            return {
                'trackId': track_id,
                'status': 'success',
                'message': f'Successfully processed {filename}',
                'metadata': item
            }
            
        except AudioProcessingError as e:
            logger.error(f"Audio processing error: {str(e)}")
            self._record_processing_failure(object_key, str(e))
            raise
        except Exception as e:
            logger.error(f"Unexpected error processing {object_key}: {str(e)}")
            self._record_processing_failure(object_key, f"Unexpected error: {str(e)}")
            raise
    
    def _calculate_file_hash(self, bucket: str, key: str) -> str:
        """Calculate SHA-256 hash of file for integrity checking"""
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            hash_sha256 = hashlib.sha256()
            
            # Read file in chunks to handle large files
            for chunk in iter(lambda: response['Body'].read(4096), b""):
                hash_sha256.update(chunk)
            
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {str(e)}")
            return ""
    
    def _record_processing_failure(self, object_key: str, error_message: str):
        """Record processing failure in DynamoDB for tracking"""
        try:
            failure_id = str(uuid.uuid4())
            created_date = datetime.utcnow().isoformat()
            
            self.table.put_item(
                Item={
                    'id': failure_id,
                    'createdDate': created_date,
                    'filename': object_key.split('/')[-1],
                    'status': 'failed',
                    'errorMessage': error_message,
                    'processingDate': created_date,
                    'validationStatus': 'failed'
                }
            )
        except Exception as e:
            logger.error(f"Error recording failure: {str(e)}")

def handler(event, context):
    """Lambda handler function"""
    processor = AudioProcessor()
    results = []
    
    try:
        # Process each S3 event record
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            # URL decode the object key (S3 events URL-encode keys with special characters)
            object_key = unquote_plus(record['s3']['object']['key'])
            
            logger.info(f"Received S3 event for: {object_key}")
            
            # Skip non-audio files based on path
            if not object_key.startswith('audio/'):
                logger.info(f"Skipping non-audio path: {object_key}")
                continue
            
            try:
                result = processor.process_audio_file(bucket_name, object_key)
                results.append(result)
            except Exception as e:
                logger.error(f"Failed to process {object_key}: {str(e)}")
                results.append({
                    'filename': object_key.split('/')[-1],
                    'status': 'error',
                    'message': str(e)
                })
        
        # Return summary of processing results
        successful = len([r for r in results if r['status'] == 'success'])
        failed = len([r for r in results if r['status'] == 'error'])
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Audio processing completed',
                'processed': len(results),
                'successful': successful,
                'failed': failed,
                'results': results
            })
        }
        
    except Exception as e:
        logger.error(f"Handler error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Audio processing failed',
                'error': str(e)
            })
        }