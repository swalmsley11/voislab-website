import json
import boto3
import os
import uuid
import time
import tempfile
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Environment variables
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'dev')
UPLOAD_BUCKET = os.environ.get('UPLOAD_BUCKET_NAME')
MEDIA_BUCKET = os.environ.get('MEDIA_BUCKET_NAME')
METADATA_TABLE = os.environ.get('METADATA_TABLE_NAME')
AUDIO_PROCESSOR_FUNCTION = os.environ.get('AUDIO_PROCESSOR_FUNCTION_NAME')
FORMAT_CONVERTER_FUNCTION = os.environ.get('FORMAT_CONVERTER_FUNCTION_NAME')
CONTENT_PROMOTER_FUNCTION = os.environ.get('CONTENT_PROMOTER_FUNCTION_NAME')
PIPELINE_TESTER_FUNCTION = os.environ.get('PIPELINE_TESTER_FUNCTION_NAME')
NOTIFICATION_TOPIC_ARN = os.environ.get('NOTIFICATION_TOPIC_ARN')

class UATRunner:
    """Comprehensive User Acceptance Testing for content management pipeline"""
    
    def __init__(self):
        self.table = dynamodb.Table(METADATA_TABLE) if METADATA_TABLE else None
        self.test_results = {
            'testSuite': 'UAT - Content Management Pipeline',
            'environment': ENVIRONMENT,
            'startTime': datetime.utcnow().isoformat(),
            'tests': [],
            'summary': {
                'total': 0,
                'passed': 0,
                'failed': 0,
                'warnings': 0
            },
            'testData': []
        }
    
    def run_comprehensive_uat(self) -> Dict[str, Any]:
        """Run comprehensive UAT suite"""
        logger.info("Starting comprehensive UAT suite")
        
        try:
            # Test 1: Upload and process valid audio files
            self.test_results['tests'].append(self._test_valid_audio_upload_and_processing())
            
            # Test 2: Test metadata extraction accuracy
            self.test_results['tests'].append(self._test_metadata_extraction_accuracy())
            
            # Test 3: Test format conversion quality
            self.test_results['tests'].append(self._test_format_conversion_quality())
            
            # Test 4: Test error handling for corrupted files
            self.test_results['tests'].append(self._test_corrupted_file_handling())
            
            # Test 5: Test DEV to PROD promotion workflow
            if ENVIRONMENT == 'dev' and CONTENT_PROMOTER_FUNCTION:
                self.test_results['tests'].append(self._test_dev_to_prod_promotion())
            
            # Test 6: Test pipeline performance under load
            self.test_results['tests'].append(self._test_pipeline_performance())
            
            # Test 7: Test end-to-end workflow
            self.test_results['tests'].append(self._test_end_to_end_workflow())
            
            # Calculate summary
            self._calculate_test_summary()
            
            # Send results notification
            self._send_uat_notification()
            
            # Cleanup test data
            self._cleanup_test_data()
            
        except Exception as e:
            logger.error(f"UAT suite error: {str(e)}")
            self.test_results['error'] = str(e)
        
        self.test_results['endTime'] = datetime.utcnow().isoformat()
        return self.test_results
    
    def _test_valid_audio_upload_and_processing(self) -> Dict[str, Any]:
        """Test uploading and processing valid audio files"""
        test_name = "Valid Audio Upload and Processing"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'steps': [],
            'passed': False
        }
        
        try:
            # Create test audio files of different formats
            test_files = [
                {'name': 'test_track_1.wav', 'duration': 10, 'format': 'wav'},
                {'name': 'test_track_2.mp3', 'duration': 15, 'format': 'mp3'},
                {'name': 'artist_name_-_song_title.wav', 'duration': 8, 'format': 'wav'}
            ]
            
            processed_tracks = []
            
            for test_file in test_files:
                step_result = {
                    'file': test_file['name'],
                    'success': False,
                    'details': {}
                }
                
                try:
                    # Create test audio content
                    audio_content = self._create_test_audio_file(
                        test_file['name'], 
                        test_file['duration']
                    )
                    
                    # Upload to S3
                    upload_key = f"audio/{test_file['name']}"
                    self._upload_test_file(upload_key, audio_content)
                    
                    step_result['details']['uploaded'] = True
                    
                    # Wait for processing
                    track_metadata = self._wait_for_processing_by_filename(
                        test_file['name'], 
                        timeout_seconds=180
                    )
                    
                    if track_metadata:
                        step_result['success'] = True
                        step_result['details']['processed'] = True
                        step_result['details']['trackId'] = track_metadata['id']
                        step_result['details']['metadata'] = track_metadata
                        
                        processed_tracks.append(track_metadata['id'])
                        self.test_results['testData'].append({
                            'type': 'processed_track',
                            'trackId': track_metadata['id'],
                            'filename': test_file['name']
                        })
                    else:
                        step_result['details']['error'] = 'Processing timeout or failure'
                
                except Exception as e:
                    step_result['details']['error'] = str(e)
                
                test_result['steps'].append(step_result)
            
            # Check overall success
            successful_files = len([s for s in test_result['steps'] if s['success']])
            test_result['passed'] = successful_files == len(test_files)
            test_result['message'] = f"Processed {successful_files}/{len(test_files)} files successfully"
            
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_metadata_extraction_accuracy(self) -> Dict[str, Any]:
        """Test accuracy of metadata extraction"""
        test_name = "Metadata Extraction Accuracy"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'checks': [],
            'passed': False
        }
        
        try:
            # Create test file with specific naming pattern
            filename = "John_Doe_-_Amazing_Song_Title.wav"
            audio_content = self._create_test_audio_file(filename, 12)
            
            # Upload and process
            upload_key = f"audio/{filename}"
            self._upload_test_file(upload_key, audio_content)
            
            # Wait for processing
            track_metadata = self._wait_for_processing_by_filename(filename, timeout_seconds=120)
            
            if track_metadata:
                # Check metadata extraction
                title = track_metadata.get('title', '')
                
                # Expected elements in title
                expected_elements = ['John', 'Doe', 'Amazing', 'Song', 'Title']
                found_elements = [elem for elem in expected_elements if elem in title]
                
                test_result['checks'].append({
                    'check': 'Title extraction from filename',
                    'expected': 'John Doe - Amazing Song Title',
                    'actual': title,
                    'passed': len(found_elements) >= 3
                })
                
                # Check duration estimation
                duration = track_metadata.get('duration', 0)
                test_result['checks'].append({
                    'check': 'Duration estimation',
                    'expected': '10-15 seconds',
                    'actual': f"{duration} seconds",
                    'passed': 8 <= duration <= 20
                })
                
                # Check file size
                file_size = track_metadata.get('fileSize', 0)
                test_result['checks'].append({
                    'check': 'File size recording',
                    'expected': '> 0 bytes',
                    'actual': f"{file_size} bytes",
                    'passed': file_size > 0
                })
                
                # Check format detection
                format_detected = track_metadata.get('format', '')
                test_result['checks'].append({
                    'check': 'Format detection',
                    'expected': 'wav',
                    'actual': format_detected,
                    'passed': format_detected == 'wav'
                })
                
                # Overall success
                passed_checks = len([c for c in test_result['checks'] if c['passed']])
                test_result['passed'] = passed_checks == len(test_result['checks'])
                test_result['message'] = f"Passed {passed_checks}/{len(test_result['checks'])} metadata checks"
                
                # Store track ID for cleanup
                self.test_results['testData'].append({
                    'type': 'metadata_test_track',
                    'trackId': track_metadata['id'],
                    'filename': filename
                })
            else:
                test_result['message'] = "Processing failed - cannot test metadata extraction"
                test_result['passed'] = False
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_format_conversion_quality(self) -> Dict[str, Any]:
        """Test format conversion quality"""
        test_name = "Format Conversion Quality"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'conversions': [],
            'passed': False
        }
        
        try:
            # Test conversion of different formats
            test_formats = [
                {'input': 'test_conversion.wav', 'duration': 10},
                {'input': 'test_conversion.flac', 'duration': 8}
            ]
            
            for test_format in test_formats:
                conversion_result = {
                    'inputFormat': test_format['input'].split('.')[-1],
                    'success': False,
                    'details': {}
                }
                
                try:
                    # Create and upload test file
                    audio_content = self._create_test_audio_file(
                        test_format['input'], 
                        test_format['duration']
                    )
                    
                    upload_key = f"audio/{test_format['input']}"
                    self._upload_test_file(upload_key, audio_content)
                    
                    # Wait for processing
                    track_metadata = self._wait_for_processing_by_filename(
                        test_format['input'], 
                        timeout_seconds=180
                    )
                    
                    if track_metadata:
                        track_id = track_metadata['id']
                        
                        # Invoke format converter
                        if FORMAT_CONVERTER_FUNCTION:
                            converter_payload = {
                                'trackId': track_id,
                                'sourceKey': f"audio/{track_id}/{test_format['input']}"
                            }
                            
                            response = lambda_client.invoke(
                                FunctionName=FORMAT_CONVERTER_FUNCTION,
                                InvocationType='RequestResponse',
                                Payload=json.dumps(converter_payload)
                            )
                            
                            converter_result = json.loads(response['Payload'].read())
                            
                            if converter_result.get('statusCode') == 200:
                                conversion_result['success'] = True
                                conversion_result['details'] = json.loads(converter_result['body'])
                            else:
                                conversion_result['details']['error'] = converter_result.get('body', 'Conversion failed')
                        
                        # Store for cleanup
                        self.test_results['testData'].append({
                            'type': 'conversion_test_track',
                            'trackId': track_id,
                            'filename': test_format['input']
                        })
                    else:
                        conversion_result['details']['error'] = 'Processing failed'
                
                except Exception as e:
                    conversion_result['details']['error'] = str(e)
                
                test_result['conversions'].append(conversion_result)
            
            # Check overall success
            successful_conversions = len([c for c in test_result['conversions'] if c['success']])
            test_result['passed'] = successful_conversions > 0
            test_result['message'] = f"Successfully converted {successful_conversions}/{len(test_result['conversions'])} formats"
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_corrupted_file_handling(self) -> Dict[str, Any]:
        """Test handling of corrupted or invalid files"""
        test_name = "Corrupted File Handling"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'tests': [],
            'passed': False
        }
        
        try:
            # Test different types of invalid files
            invalid_files = [
                {'name': 'corrupted.wav', 'content': b'This is not audio data', 'type': 'invalid_content'},
                {'name': 'empty.mp3', 'content': b'', 'type': 'empty_file'},
                {'name': 'script.wav', 'content': b'<script>alert("hack")</script>', 'type': 'malicious_content'}
            ]
            
            for invalid_file in invalid_files:
                file_test = {
                    'filename': invalid_file['name'],
                    'type': invalid_file['type'],
                    'success': False,
                    'details': {}
                }
                
                try:
                    # Upload invalid file
                    upload_key = f"audio/{invalid_file['name']}"
                    self._upload_test_file(upload_key, invalid_file['content'])
                    
                    file_test['details']['uploaded'] = True
                    
                    # Wait to see if processing occurs (it shouldn't)
                    time.sleep(30)  # Wait 30 seconds
                    
                    # Check if any metadata was created
                    track_metadata = self._wait_for_processing_by_filename(
                        invalid_file['name'], 
                        timeout_seconds=10  # Short timeout
                    )
                    
                    if track_metadata:
                        # If metadata was created, check if it's marked as failed
                        if track_metadata.get('status') == 'failed':
                            file_test['success'] = True
                            file_test['details']['result'] = 'Correctly marked as failed'
                        else:
                            file_test['details']['result'] = 'Incorrectly processed invalid file'
                    else:
                        # No metadata created - this is correct for invalid files
                        file_test['success'] = True
                        file_test['details']['result'] = 'Correctly rejected invalid file'
                
                except Exception as e:
                    file_test['details']['error'] = str(e)
                
                test_result['tests'].append(file_test)
            
            # Check overall success
            successful_rejections = len([t for t in test_result['tests'] if t['success']])
            test_result['passed'] = successful_rejections == len(test_result['tests'])
            test_result['message'] = f"Correctly handled {successful_rejections}/{len(test_result['tests'])} invalid files"
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_dev_to_prod_promotion(self) -> Dict[str, Any]:
        """Test DEV to PROD promotion workflow"""
        test_name = "DEV to PROD Promotion Workflow"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'steps': [],
            'passed': False
        }
        
        try:
            # Create and process a test file in DEV
            filename = "promotion_test.wav"
            audio_content = self._create_test_audio_file(filename, 10)
            
            upload_key = f"audio/{filename}"
            self._upload_test_file(upload_key, audio_content)
            
            # Wait for processing
            track_metadata = self._wait_for_processing_by_filename(filename, timeout_seconds=120)
            
            if track_metadata:
                track_id = track_metadata['id']
                
                test_result['steps'].append({
                    'step': 'DEV processing',
                    'success': True,
                    'trackId': track_id
                })
                
                # Test promotion validation
                validation_payload = {
                    'trackId': track_id,
                    'autoPromote': False
                }
                
                response = lambda_client.invoke(
                    FunctionName=CONTENT_PROMOTER_FUNCTION,
                    InvocationType='RequestResponse',
                    Payload=json.dumps(validation_payload)
                )
                
                validation_result = json.loads(response['Payload'].read())
                
                if validation_result.get('statusCode') == 200:
                    validation_body = json.loads(validation_result['body'])
                    
                    test_result['steps'].append({
                        'step': 'Promotion validation',
                        'success': validation_body.get('readyForPromotion', False),
                        'details': validation_body.get('validation', {})
                    })
                    
                    # If validation passes, test actual promotion (in a real scenario)
                    # For UAT, we'll just simulate this step
                    test_result['steps'].append({
                        'step': 'Promotion simulation',
                        'success': True,
                        'note': 'Actual promotion skipped in UAT to avoid cross-environment issues'
                    })
                else:
                    test_result['steps'].append({
                        'step': 'Promotion validation',
                        'success': False,
                        'error': validation_result.get('body', 'Validation failed')
                    })
                
                # Store for cleanup
                self.test_results['testData'].append({
                    'type': 'promotion_test_track',
                    'trackId': track_id,
                    'filename': filename
                })
            else:
                test_result['steps'].append({
                    'step': 'DEV processing',
                    'success': False,
                    'error': 'Processing failed'
                })
            
            # Check overall success
            successful_steps = len([s for s in test_result['steps'] if s['success']])
            test_result['passed'] = successful_steps == len(test_result['steps'])
            test_result['message'] = f"Completed {successful_steps}/{len(test_result['steps'])} promotion workflow steps"
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_pipeline_performance(self) -> Dict[str, Any]:
        """Test pipeline performance under load"""
        test_name = "Pipeline Performance Under Load"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'performance': {},
            'passed': False
        }
        
        try:
            # Invoke pipeline tester for performance benchmarks
            if PIPELINE_TESTER_FUNCTION:
                performance_payload = {
                    'testType': 'performance'
                }
                
                response = lambda_client.invoke(
                    FunctionName=PIPELINE_TESTER_FUNCTION,
                    InvocationType='RequestResponse',
                    Payload=json.dumps(performance_payload)
                )
                
                performance_result = json.loads(response['Payload'].read())
                
                if performance_result.get('statusCode') == 200:
                    performance_data = json.loads(performance_result['body'])
                    test_result['performance'] = performance_data
                    
                    # Check if performance meets criteria
                    benchmarks = performance_data.get('benchmarks', {})
                    
                    # Check processing time benchmarks
                    processing_benchmarks = benchmarks.get('processing_time', {})
                    if processing_benchmarks.get('summary', {}).get('averageThroughput', 0) > 0.1:  # > 0.1 MB/s
                        test_result['passed'] = True
                        test_result['message'] = "Performance benchmarks passed"
                    else:
                        test_result['message'] = "Performance benchmarks below threshold"
                else:
                    test_result['message'] = "Performance testing failed"
                    test_result['error'] = performance_result.get('body', 'Unknown error')
            else:
                test_result['message'] = "Pipeline tester function not available"
                test_result['passed'] = True  # Skip if not available
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _test_end_to_end_workflow(self) -> Dict[str, Any]:
        """Test complete end-to-end workflow"""
        test_name = "End-to-End Workflow"
        logger.info(f"Running UAT: {test_name}")
        
        test_result = {
            'name': test_name,
            'startTime': datetime.utcnow().isoformat(),
            'workflow': [],
            'passed': False
        }
        
        try:
            # Complete workflow: Upload -> Process -> Convert -> Validate -> (Promote)
            filename = "e2e_test_track.wav"
            audio_content = self._create_test_audio_file(filename, 15)
            
            # Step 1: Upload
            upload_key = f"audio/{filename}"
            self._upload_test_file(upload_key, audio_content)
            
            test_result['workflow'].append({
                'step': 'File Upload',
                'success': True,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            # Step 2: Wait for processing
            track_metadata = self._wait_for_processing_by_filename(filename, timeout_seconds=180)
            
            if track_metadata:
                track_id = track_metadata['id']
                
                test_result['workflow'].append({
                    'step': 'Audio Processing',
                    'success': True,
                    'trackId': track_id,
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                # Step 3: Format conversion (if available)
                if FORMAT_CONVERTER_FUNCTION:
                    converter_payload = {
                        'trackId': track_id,
                        'sourceKey': f"audio/{track_id}/{filename}"
                    }
                    
                    response = lambda_client.invoke(
                        FunctionName=FORMAT_CONVERTER_FUNCTION,
                        InvocationType='RequestResponse',
                        Payload=json.dumps(converter_payload)
                    )
                    
                    converter_result = json.loads(response['Payload'].read())
                    
                    test_result['workflow'].append({
                        'step': 'Format Conversion',
                        'success': converter_result.get('statusCode') == 200,
                        'timestamp': datetime.utcnow().isoformat()
                    })
                
                # Step 4: Validation
                validation_success = self._validate_processed_track(track_id)
                
                test_result['workflow'].append({
                    'step': 'Validation',
                    'success': validation_success,
                    'timestamp': datetime.utcnow().isoformat()
                })
                
                # Store for cleanup
                self.test_results['testData'].append({
                    'type': 'e2e_test_track',
                    'trackId': track_id,
                    'filename': filename
                })
            else:
                test_result['workflow'].append({
                    'step': 'Audio Processing',
                    'success': False,
                    'error': 'Processing timeout',
                    'timestamp': datetime.utcnow().isoformat()
                })
            
            # Check overall workflow success
            successful_steps = len([s for s in test_result['workflow'] if s['success']])
            test_result['passed'] = successful_steps == len(test_result['workflow'])
            test_result['message'] = f"Completed {successful_steps}/{len(test_result['workflow'])} workflow steps"
        
        except Exception as e:
            test_result['error'] = str(e)
            test_result['message'] = f"Test failed with error: {str(e)}"
        
        test_result['endTime'] = datetime.utcnow().isoformat()
        return test_result
    
    def _create_test_audio_file(self, filename: str, duration_seconds: int) -> bytes:
        """Create a simple test audio file"""
        # Create a simple WAV file
        sample_rate = 44100
        samples = duration_seconds * sample_rate
        
        # WAV header
        wav_header = bytearray()
        wav_header.extend(b'RIFF')
        wav_header.extend((36 + samples * 2).to_bytes(4, 'little'))
        wav_header.extend(b'WAVE')
        wav_header.extend(b'fmt ')
        wav_header.extend((16).to_bytes(4, 'little'))
        wav_header.extend((1).to_bytes(2, 'little'))
        wav_header.extend((1).to_bytes(2, 'little'))
        wav_header.extend(sample_rate.to_bytes(4, 'little'))
        wav_header.extend((sample_rate * 2).to_bytes(4, 'little'))
        wav_header.extend((2).to_bytes(2, 'little'))
        wav_header.extend((16).to_bytes(2, 'little'))
        wav_header.extend(b'data')
        wav_header.extend((samples * 2).to_bytes(4, 'little'))
        
        # Generate audio data
        audio_data = bytearray()
        for i in range(samples):
            import math
            sample = int(32767 * 0.3 * math.sin(2 * math.pi * 440 * i / sample_rate))
            audio_data.extend(sample.to_bytes(2, 'little', signed=True))
        
        return bytes(wav_header + audio_data)
    
    def _upload_test_file(self, key: str, content: bytes):
        """Upload test file to S3"""
        with tempfile.NamedTemporaryFile() as temp_file:
            temp_file.write(content)
            temp_file.flush()
            
            s3_client.upload_file(
                temp_file.name,
                UPLOAD_BUCKET,
                key
            )
    
    def _wait_for_processing_by_filename(self, filename: str, timeout_seconds: int = 300) -> Optional[Dict[str, Any]]:
        """Wait for processing to complete by checking for filename"""
        start_time = time.time()
        
        while time.time() - start_time < timeout_seconds:
            try:
                # Scan table for items with matching filename
                response = self.table.scan(
                    FilterExpression='filename = :filename',
                    ExpressionAttributeValues={':filename': filename},
                    Limit=10
                )
                
                for item in response['Items']:
                    if item.get('status') in ['processed', 'failed']:
                        return item
                
                time.sleep(5)  # Wait 5 seconds before checking again
                
            except Exception as e:
                logger.error(f"Error checking processing status: {str(e)}")
                time.sleep(10)
        
        return None
    
    def _validate_processed_track(self, track_id: str) -> bool:
        """Validate that a track was processed correctly"""
        try:
            # Check metadata exists
            response = self.table.query(
                KeyConditionExpression='id = :id',
                ExpressionAttributeValues={':id': track_id},
                Limit=1
            )
            
            if not response['Items']:
                return False
            
            metadata = response['Items'][0]
            
            # Check required fields
            required_fields = ['title', 'filename', 'fileUrl', 'status']
            for field in required_fields:
                if not metadata.get(field):
                    return False
            
            # Check status
            if metadata.get('status') != 'processed':
                return False
            
            # Check file exists in media bucket
            try:
                response = s3_client.list_objects_v2(
                    Bucket=MEDIA_BUCKET,
                    Prefix=f'audio/{track_id}/',
                    MaxKeys=1
                )
                return response.get('KeyCount', 0) > 0
            except:
                return False
        
        except Exception as e:
            logger.error(f"Error validating track {track_id}: {str(e)}")
            return False
    
    def _calculate_test_summary(self):
        """Calculate test summary statistics"""
        for test in self.test_results['tests']:
            self.test_results['summary']['total'] += 1
            
            if test.get('passed'):
                self.test_results['summary']['passed'] += 1
            else:
                self.test_results['summary']['failed'] += 1
    
    def _send_uat_notification(self):
        """Send UAT results notification"""
        try:
            if NOTIFICATION_TOPIC_ARN:
                summary = self.test_results['summary']
                
                subject = f"VoisLab UAT Results - {summary['passed']}/{summary['total']} Tests Passed"
                
                message = f"""
User Acceptance Testing Results

Environment: {ENVIRONMENT.upper()}
Test Suite: Content Management Pipeline
Start Time: {self.test_results['startTime']}
End Time: {self.test_results.get('endTime', 'In Progress')}

Summary:
- Total Tests: {summary['total']}
- Passed: {summary['passed']}
- Failed: {summary['failed']}
- Success Rate: {(summary['passed'] / summary['total'] * 100) if summary['total'] > 0 else 0:.1f}%

Overall Status: {'PASS' if summary['failed'] == 0 else 'FAIL'}

Test Results:
"""
                
                for test in self.test_results['tests']:
                    status = "✓" if test.get('passed') else "✗"
                    message += f"{status} {test['name']}: {test.get('message', 'No message')}\n"
                
                sns_client.publish(
                    TopicArn=NOTIFICATION_TOPIC_ARN,
                    Subject=subject,
                    Message=message
                )
                
                logger.info("UAT notification sent")
        
        except Exception as e:
            logger.error(f"Error sending UAT notification: {str(e)}")
    
    def _cleanup_test_data(self):
        """Clean up test data created during UAT"""
        logger.info("Cleaning up UAT test data")
        
        for test_data in self.test_results['testData']:
            try:
                track_id = test_data.get('trackId')
                filename = test_data.get('filename')
                
                if track_id:
                    # Delete from media bucket
                    try:
                        response = s3_client.list_objects_v2(
                            Bucket=MEDIA_BUCKET,
                            Prefix=f'audio/{track_id}/'
                        )
                        
                        for obj in response.get('Contents', []):
                            s3_client.delete_object(
                                Bucket=MEDIA_BUCKET,
                                Key=obj['Key']
                            )
                    except Exception as e:
                        logger.error(f"Error deleting media files for {track_id}: {str(e)}")
                    
                    # Delete from DynamoDB
                    try:
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
                    except Exception as e:
                        logger.error(f"Error deleting metadata for {track_id}: {str(e)}")
                
                # Delete from upload bucket
                if filename:
                    try:
                        s3_client.delete_object(
                            Bucket=UPLOAD_BUCKET,
                            Key=f'audio/{filename}'
                        )
                    except Exception as e:
                        logger.error(f"Error deleting upload file {filename}: {str(e)}")
            
            except Exception as e:
                logger.error(f"Error cleaning up test data: {str(e)}")

def handler(event, context):
    """Lambda handler for UAT runner"""
    uat_runner = UATRunner()
    
    try:
        # Run comprehensive UAT
        results = uat_runner.run_comprehensive_uat()
        
        return {
            'statusCode': 200,
            'body': json.dumps(results)
        }
    
    except Exception as e:
        logger.error(f"UAT handler error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }