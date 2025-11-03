"""
Utilities for testing audio processing pipeline
"""

import boto3
import json
import time
import hashlib
import tempfile
import os
from typing import Dict, Any, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class AudioTestUtils:
    """Utilities for testing audio processing functionality"""
    
    def __init__(self, environment: str = 'dev'):
        self.environment = environment
        self.s3_client = boto3.client('s3')
        self.lambda_client = boto3.client('lambda')
        self.dynamodb = boto3.resource('dynamodb')
        
        # Environment-specific resource names
        self.upload_bucket = f'voislab-upload-{environment}-{self._get_account_id()}'
        self.media_bucket = f'voislab-media-{environment}-{self._get_account_id()}'
        self.metadata_table = f'voislab-audio-metadata-{environment}'
        
        # Lambda function names
        self.audio_processor_function = f'voislab-audio-processor-{environment}'
        self.format_converter_function = f'voislab-format-converter-{environment}'
        
        self.table = self.dynamodb.Table(self.metadata_table)
    
    def _get_account_id(self) -> str:
        """Get AWS account ID"""
        try:
            sts = boto3.client('sts')
            return sts.get_caller_identity()['Account']
        except:
            return '123456789012'  # Fallback for testing
    
    def create_test_audio_file(self, filename: str, duration_seconds: int = 5) -> bytes:
        """Create a simple test audio file (WAV format)"""
        # Create a simple WAV file with sine wave
        sample_rate = 44100
        samples = duration_seconds * sample_rate
        
        # WAV header (44 bytes)
        wav_header = bytearray()
        
        # RIFF header
        wav_header.extend(b'RIFF')
        wav_header.extend((36 + samples * 2).to_bytes(4, 'little'))  # File size - 8
        wav_header.extend(b'WAVE')
        
        # fmt chunk
        wav_header.extend(b'fmt ')
        wav_header.extend((16).to_bytes(4, 'little'))  # Chunk size
        wav_header.extend((1).to_bytes(2, 'little'))   # Audio format (PCM)
        wav_header.extend((1).to_bytes(2, 'little'))   # Number of channels
        wav_header.extend(sample_rate.to_bytes(4, 'little'))  # Sample rate
        wav_header.extend((sample_rate * 2).to_bytes(4, 'little'))  # Byte rate
        wav_header.extend((2).to_bytes(2, 'little'))   # Block align
        wav_header.extend((16).to_bytes(2, 'little'))  # Bits per sample
        
        # data chunk
        wav_header.extend(b'data')
        wav_header.extend((samples * 2).to_bytes(4, 'little'))  # Data size
        
        # Generate simple sine wave data
        audio_data = bytearray()
        for i in range(samples):
            # Simple sine wave at 440 Hz
            import math
            sample = int(32767 * 0.5 * math.sin(2 * math.pi * 440 * i / sample_rate))
            audio_data.extend(sample.to_bytes(2, 'little', signed=True))
        
        return bytes(wav_header + audio_data)
    
    def upload_test_file(self, filename: str, content: bytes, metadata: Optional[Dict[str, str]] = None) -> str:
        """Upload test file to S3 upload bucket"""
        key = f'audio/{filename}'
        
        extra_args = {}
        if metadata:
            extra_args['Metadata'] = metadata
        
        with tempfile.NamedTemporaryFile() as temp_file:
            temp_file.write(content)
            temp_file.flush()
            
            self.s3_client.upload_file(
                temp_file.name,
                self.upload_bucket,
                key,
                ExtraArgs=extra_args
            )
        
        logger.info(f"Uploaded test file: {key}")
        return key
    
    def wait_for_processing(self, track_id: str, timeout_seconds: int = 300) -> Optional[Dict[str, Any]]:
        """Wait for audio processing to complete and return metadata"""
        start_time = time.time()
        
        while time.time() - start_time < timeout_seconds:
            try:
                response = self.table.query(
                    KeyConditionExpression='id = :id',
                    ExpressionAttributeValues={':id': track_id},
                    Limit=1
                )
                
                if response['Items']:
                    item = response['Items'][0]
                    if item.get('status') in ['processed', 'failed']:
                        return item
                
                time.sleep(2)  # Wait 2 seconds before checking again
                
            except Exception as e:
                logger.error(f"Error checking processing status: {str(e)}")
                time.sleep(5)
        
        logger.warning(f"Timeout waiting for processing of track {track_id}")
        return None
    
    def invoke_lambda_function(self, function_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Invoke Lambda function and return response"""
        try:
            response = self.lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            
            response_payload = json.loads(response['Payload'].read())
            return response_payload
            
        except Exception as e:
            logger.error(f"Error invoking Lambda function {function_name}: {str(e)}")
            raise
    
    def validate_processed_audio(self, track_id: str) -> Dict[str, Any]:
        """Validate that audio was processed correctly"""
        validation_results = {
            'valid': True,
            'checks': [],
            'errors': []
        }
        
        try:
            # Check 1: Metadata exists in DynamoDB
            response = self.table.query(
                KeyConditionExpression='id = :id',
                ExpressionAttributeValues={':id': track_id},
                Limit=1
            )
            
            if not response['Items']:
                validation_results['valid'] = False
                validation_results['errors'].append('No metadata found in DynamoDB')
                return validation_results
            
            metadata = response['Items'][0]
            validation_results['checks'].append('Metadata exists in DynamoDB')
            
            # Check 2: Required fields present
            required_fields = ['title', 'filename', 'fileUrl', 'status', 'createdDate']
            for field in required_fields:
                if field not in metadata or not metadata[field]:
                    validation_results['valid'] = False
                    validation_results['errors'].append(f'Missing required field: {field}')
                else:
                    validation_results['checks'].append(f'Required field present: {field}')
            
            # Check 3: Processing status
            if metadata.get('status') != 'processed':
                validation_results['valid'] = False
                validation_results['errors'].append(f"Status is '{metadata.get('status')}', expected 'processed'")
            else:
                validation_results['checks'].append('Processing status is correct')
            
            # Check 4: File exists in media bucket
            file_exists = self._check_media_file_exists(track_id)
            if file_exists:
                validation_results['checks'].append('Audio file exists in media bucket')
            else:
                validation_results['valid'] = False
                validation_results['errors'].append('Audio file not found in media bucket')
            
            # Check 5: File integrity
            if file_exists and metadata.get('fileHash'):
                integrity_check = self._verify_file_integrity(track_id, metadata['fileHash'])
                if integrity_check:
                    validation_results['checks'].append('File integrity verified')
                else:
                    validation_results['valid'] = False
                    validation_results['errors'].append('File integrity check failed')
            
            validation_results['metadata'] = metadata
            
        except Exception as e:
            validation_results['valid'] = False
            validation_results['errors'].append(f'Validation error: {str(e)}')
        
        return validation_results
    
    def _check_media_file_exists(self, track_id: str) -> bool:
        """Check if processed audio file exists in media bucket"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.media_bucket,
                Prefix=f'audio/{track_id}/',
                MaxKeys=1
            )
            return response.get('KeyCount', 0) > 0
        except Exception as e:
            logger.error(f"Error checking media file existence: {str(e)}")
            return False
    
    def _verify_file_integrity(self, track_id: str, expected_hash: str) -> bool:
        """Verify file integrity using hash comparison"""
        try:
            # List files for this track
            response = self.s3_client.list_objects_v2(
                Bucket=self.media_bucket,
                Prefix=f'audio/{track_id}/'
            )
            
            for obj in response.get('Contents', []):
                # Download and hash the file
                with tempfile.NamedTemporaryFile() as temp_file:
                    self.s3_client.download_file(
                        self.media_bucket,
                        obj['Key'],
                        temp_file.name
                    )
                    
                    # Calculate hash
                    hash_sha256 = hashlib.sha256()
                    with open(temp_file.name, 'rb') as f:
                        for chunk in iter(lambda: f.read(4096), b""):
                            hash_sha256.update(chunk)
                    
                    calculated_hash = hash_sha256.hexdigest()
                    
                    if calculated_hash == expected_hash:
                        return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error verifying file integrity: {str(e)}")
            return False
    
    def cleanup_test_data(self, track_id: str):
        """Clean up test data from S3 and DynamoDB"""
        try:
            # Delete from media bucket
            response = self.s3_client.list_objects_v2(
                Bucket=self.media_bucket,
                Prefix=f'audio/{track_id}/'
            )
            
            for obj in response.get('Contents', []):
                self.s3_client.delete_object(
                    Bucket=self.media_bucket,
                    Key=obj['Key']
                )
            
            # Delete from upload bucket
            response = self.s3_client.list_objects_v2(
                Bucket=self.upload_bucket,
                Prefix=f'audio/'
            )
            
            for obj in response.get('Contents', []):
                if track_id in obj['Key']:
                    self.s3_client.delete_object(
                        Bucket=self.upload_bucket,
                        Key=obj['Key']
                    )
            
            # Delete from DynamoDB
            response = self.table.query(
                KeyConditionExpression='id = :id',
                ExpressionAttributeValues={':id': track_id}
            )
            
            for item in response['Items']:
                self.table.delete_item(
                    Key={
                        'id': item['id'],
                        'createdDate': item['createdDate']
                    }
                )
            
            logger.info(f"Cleaned up test data for track {track_id}")
            
        except Exception as e:
            logger.error(f"Error cleaning up test data: {str(e)}")

class PerformanceTester:
    """Performance testing utilities for audio processing"""
    
    def __init__(self, test_utils: AudioTestUtils):
        self.test_utils = test_utils
    
    def benchmark_processing_time(self, file_sizes: List[int], iterations: int = 3) -> Dict[str, Any]:
        """Benchmark audio processing time for different file sizes"""
        results = {
            'benchmarks': [],
            'summary': {}
        }
        
        for file_size_mb in file_sizes:
            file_size_bytes = file_size_mb * 1024 * 1024
            duration_seconds = max(5, file_size_mb // 2)  # Rough estimate
            
            times = []
            
            for i in range(iterations):
                try:
                    # Create test file
                    test_content = self.test_utils.create_test_audio_file(
                        f'benchmark_{file_size_mb}mb_{i}.wav',
                        duration_seconds
                    )
                    
                    # Pad to desired size if needed
                    if len(test_content) < file_size_bytes:
                        padding = b'\x00' * (file_size_bytes - len(test_content))
                        test_content += padding
                    
                    start_time = time.time()
                    
                    # Upload and process
                    filename = f'benchmark_{file_size_mb}mb_{i}.wav'
                    key = self.test_utils.upload_test_file(filename, test_content)
                    
                    # Extract track ID (would be generated by Lambda)
                    # For testing, we'll simulate this
                    import uuid
                    track_id = str(uuid.uuid4())
                    
                    # Wait for processing
                    processed_metadata = self.test_utils.wait_for_processing(track_id, timeout_seconds=600)
                    
                    end_time = time.time()
                    processing_time = end_time - start_time
                    
                    times.append(processing_time)
                    
                    # Cleanup
                    if processed_metadata:
                        self.test_utils.cleanup_test_data(track_id)
                    
                except Exception as e:
                    logger.error(f"Benchmark iteration failed: {str(e)}")
                    times.append(None)
            
            # Calculate statistics
            valid_times = [t for t in times if t is not None]
            if valid_times:
                avg_time = sum(valid_times) / len(valid_times)
                min_time = min(valid_times)
                max_time = max(valid_times)
                
                results['benchmarks'].append({
                    'fileSizeMB': file_size_mb,
                    'iterations': len(valid_times),
                    'avgProcessingTime': avg_time,
                    'minProcessingTime': min_time,
                    'maxProcessingTime': max_time,
                    'throughputMBps': file_size_mb / avg_time if avg_time > 0 else 0
                })
        
        # Generate summary
        if results['benchmarks']:
            avg_throughput = sum(b['throughputMBps'] for b in results['benchmarks']) / len(results['benchmarks'])
            results['summary'] = {
                'averageThroughput': avg_throughput,
                'totalTests': sum(b['iterations'] for b in results['benchmarks']),
                'testCompleted': True
            }
        
        return results
    
    def stress_test_concurrent_processing(self, concurrent_files: int = 5) -> Dict[str, Any]:
        """Test concurrent audio processing"""
        import threading
        import queue
        
        results_queue = queue.Queue()
        
        def process_file(file_index: int):
            try:
                # Create test file
                filename = f'stress_test_{file_index}.wav'
                test_content = self.test_utils.create_test_audio_file(filename, 10)
                
                start_time = time.time()
                
                # Upload file
                key = self.test_utils.upload_test_file(filename, test_content)
                
                # Simulate track ID generation
                import uuid
                track_id = str(uuid.uuid4())
                
                # Wait for processing
                processed_metadata = self.test_utils.wait_for_processing(track_id, timeout_seconds=300)
                
                end_time = time.time()
                
                results_queue.put({
                    'fileIndex': file_index,
                    'success': processed_metadata is not None,
                    'processingTime': end_time - start_time,
                    'trackId': track_id
                })
                
            except Exception as e:
                results_queue.put({
                    'fileIndex': file_index,
                    'success': False,
                    'error': str(e),
                    'trackId': None
                })
        
        # Start concurrent processing
        threads = []
        start_time = time.time()
        
        for i in range(concurrent_files):
            thread = threading.Thread(target=process_file, args=(i,))
            thread.start()
            threads.append(thread)
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        end_time = time.time()
        
        # Collect results
        results = []
        while not results_queue.empty():
            results.append(results_queue.get())
        
        # Cleanup
        for result in results:
            if result.get('trackId'):
                try:
                    self.test_utils.cleanup_test_data(result['trackId'])
                except:
                    pass
        
        # Calculate summary
        successful = len([r for r in results if r['success']])
        failed = len([r for r in results if not r['success']])
        
        if successful > 0:
            avg_time = sum(r['processingTime'] for r in results if r['success']) / successful
        else:
            avg_time = 0
        
        return {
            'totalFiles': concurrent_files,
            'successful': successful,
            'failed': failed,
            'totalTime': end_time - start_time,
            'averageProcessingTime': avg_time,
            'results': results
        }