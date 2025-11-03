import json
import boto3
import os
from datetime import datetime
from typing import Dict, Any, List, Optional
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Environment variables
DEV_METADATA_TABLE = os.environ.get('DEV_METADATA_TABLE_NAME')
PROD_METADATA_TABLE = os.environ.get('PROD_METADATA_TABLE_NAME')
DEV_MEDIA_BUCKET = os.environ.get('DEV_MEDIA_BUCKET_NAME')
PROD_MEDIA_BUCKET = os.environ.get('PROD_MEDIA_BUCKET_NAME')
NOTIFICATION_TOPIC_ARN = os.environ.get('NOTIFICATION_TOPIC_ARN')

class ContentPromoter:
    """Handles promotion of content from DEV to PROD environment"""
    
    def __init__(self):
        self.dev_table = dynamodb.Table(DEV_METADATA_TABLE) if DEV_METADATA_TABLE else None
        self.prod_table = dynamodb.Table(PROD_METADATA_TABLE) if PROD_METADATA_TABLE else None
    
    def validate_content_for_promotion(self, track_id: str) -> Dict[str, Any]:
        """Validate content is ready for promotion to production"""
        try:
            logger.info(f"Validating content for promotion: {track_id}")
            
            if not self.dev_table:
                raise ValueError("DEV metadata table not configured")
            
            # Get track metadata from DEV environment
            response = self.dev_table.query(
                KeyConditionExpression='id = :id',
                ExpressionAttributeValues={':id': track_id},
                Limit=1
            )
            
            if not response['Items']:
                return {
                    'valid': False,
                    'reason': f'Track {track_id} not found in DEV environment'
                }
            
            track = response['Items'][0]
            
            # Validation criteria
            validation_results = {
                'valid': True,
                'checks': [],
                'warnings': [],
                'track': track
            }
            
            # Check 1: Processing status
            if track.get('status') != 'processed':
                validation_results['checks'].append({
                    'name': 'Processing Status',
                    'passed': False,
                    'message': f"Track status is '{track.get('status')}', expected 'processed'"
                })
                validation_results['valid'] = False
            else:
                validation_results['checks'].append({
                    'name': 'Processing Status',
                    'passed': True,
                    'message': 'Track is fully processed'
                })
            
            # Check 2: Required metadata
            required_fields = ['title', 'filename', 'fileUrl', 'duration']
            for field in required_fields:
                if not track.get(field):
                    validation_results['checks'].append({
                        'name': f'Required Field: {field}',
                        'passed': False,
                        'message': f'Missing required field: {field}'
                    })
                    validation_results['valid'] = False
                else:
                    validation_results['checks'].append({
                        'name': f'Required Field: {field}',
                        'passed': True,
                        'message': f'{field} is present'
                    })
            
            # Check 3: File existence in DEV media bucket
            file_exists = self._check_file_exists_in_bucket(track_id, DEV_MEDIA_BUCKET)
            validation_results['checks'].append({
                'name': 'File Existence',
                'passed': file_exists,
                'message': 'Audio file exists in DEV bucket' if file_exists else 'Audio file not found in DEV bucket'
            })
            
            if not file_exists:
                validation_results['valid'] = False
            
            # Check 4: Audio quality validation
            quality_check = self._validate_audio_quality(track)
            validation_results['checks'].append(quality_check)
            
            if not quality_check['passed']:
                validation_results['valid'] = False
            
            # Warning checks (don't fail validation but notify)
            if not track.get('description'):
                validation_results['warnings'].append('No description provided')
            
            if not track.get('genre') or track.get('genre') == 'unknown':
                validation_results['warnings'].append('Genre not specified')
            
            if not track.get('tags') or len(track.get('tags', [])) == 0:
                validation_results['warnings'].append('No tags specified')
            
            return validation_results
            
        except Exception as e:
            logger.error(f"Error validating content: {str(e)}")
            return {
                'valid': False,
                'reason': f'Validation error: {str(e)}'
            }
    
    def promote_content_to_prod(self, track_id: str, validation_results: Dict[str, Any]) -> Dict[str, Any]:
        """Promote validated content from DEV to PROD"""
        try:
            logger.info(f"Promoting content to PROD: {track_id}")
            
            if not validation_results.get('valid'):
                raise ValueError("Content failed validation, cannot promote")
            
            track = validation_results['track']
            
            # Step 1: Copy audio files from DEV to PROD bucket
            copy_results = self._copy_audio_files(track_id, track)
            
            # Step 2: Create PROD metadata entry
            prod_metadata = self._create_prod_metadata(track)
            
            if self.prod_table:
                self.prod_table.put_item(Item=prod_metadata)
            
            # Step 3: Update DEV record with promotion status
            self._update_dev_promotion_status(track_id, track['createdDate'], 'promoted')
            
            promotion_result = {
                'status': 'success',
                'trackId': track_id,
                'promotedAt': datetime.utcnow().isoformat(),
                'copiedFiles': copy_results,
                'prodMetadata': prod_metadata
            }
            
            # Send success notification
            self._send_notification(
                'Content Promotion Successful',
                f"Track '{track['title']}' ({track_id}) has been successfully promoted to production.",
                promotion_result
            )
            
            return promotion_result
            
        except Exception as e:
            logger.error(f"Error promoting content: {str(e)}")
            
            # Send failure notification
            self._send_notification(
                'Content Promotion Failed',
                f"Failed to promote track {track_id} to production: {str(e)}",
                {'error': str(e), 'trackId': track_id}
            )
            
            raise
    
    def _check_file_exists_in_bucket(self, track_id: str, bucket_name: str) -> bool:
        """Check if audio files exist in the specified bucket"""
        try:
            # List objects with the track ID prefix
            response = s3_client.list_objects_v2(
                Bucket=bucket_name,
                Prefix=f'audio/{track_id}/',
                MaxKeys=10
            )
            
            return response.get('KeyCount', 0) > 0
            
        except Exception as e:
            logger.error(f"Error checking file existence: {str(e)}")
            return False
    
    def _validate_audio_quality(self, track: Dict[str, Any]) -> Dict[str, Any]:
        """Validate audio quality metrics"""
        try:
            duration = track.get('duration', 0)
            file_size = track.get('fileSize', 0)
            
            # Basic quality checks
            if duration < 1:
                return {
                    'name': 'Audio Quality',
                    'passed': False,
                    'message': 'Duration is too short (less than 1 second)'
                }
            
            if duration > 600:  # 10 minutes
                return {
                    'name': 'Audio Quality',
                    'passed': False,
                    'message': 'Duration is too long (over 10 minutes)'
                }
            
            if file_size < 10000:  # 10KB
                return {
                    'name': 'Audio Quality',
                    'passed': False,
                    'message': 'File size is too small (likely corrupted)'
                }
            
            if file_size > 50 * 1024 * 1024:  # 50MB
                return {
                    'name': 'Audio Quality',
                    'passed': False,
                    'message': 'File size is too large (over 50MB)'
                }
            
            return {
                'name': 'Audio Quality',
                'passed': True,
                'message': 'Audio quality checks passed'
            }
            
        except Exception as e:
            return {
                'name': 'Audio Quality',
                'passed': False,
                'message': f'Quality validation error: {str(e)}'
            }
    
    def _copy_audio_files(self, track_id: str, track: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Copy audio files from DEV to PROD bucket"""
        copied_files = []
        
        try:
            # List all files for this track in DEV bucket
            response = s3_client.list_objects_v2(
                Bucket=DEV_MEDIA_BUCKET,
                Prefix=f'audio/{track_id}/'
            )
            
            for obj in response.get('Contents', []):
                source_key = obj['Key']
                dest_key = source_key  # Keep same key structure
                
                # Copy file from DEV to PROD
                copy_source = {
                    'Bucket': DEV_MEDIA_BUCKET,
                    'Key': source_key
                }
                
                s3_client.copy_object(
                    CopySource=copy_source,
                    Bucket=PROD_MEDIA_BUCKET,
                    Key=dest_key,
                    MetadataDirective='REPLACE',
                    Metadata={
                        'track-id': track_id,
                        'promoted-from': 'dev',
                        'promotion-date': datetime.utcnow().isoformat(),
                        'original-filename': track.get('filename', '')
                    }
                )
                
                copied_files.append({
                    'sourceKey': source_key,
                    'destKey': dest_key,
                    'size': obj['Size']
                })
                
                logger.info(f"Copied {source_key} to PROD bucket")
            
            return copied_files
            
        except Exception as e:
            logger.error(f"Error copying files: {str(e)}")
            raise
    
    def _create_prod_metadata(self, dev_track: Dict[str, Any]) -> Dict[str, Any]:
        """Create production metadata from DEV track"""
        prod_metadata = dev_track.copy()
        
        # Update environment-specific fields
        prod_metadata['promotedFrom'] = 'dev'
        prod_metadata['promotedAt'] = datetime.utcnow().isoformat()
        prod_metadata['environment'] = 'prod'
        
        # Update file URLs to point to PROD bucket
        if 'fileUrl' in prod_metadata:
            prod_metadata['fileUrl'] = prod_metadata['fileUrl'].replace(
                DEV_MEDIA_BUCKET, PROD_MEDIA_BUCKET
            )
        
        return prod_metadata
    
    def _update_dev_promotion_status(self, track_id: str, created_date: str, status: str):
        """Update DEV record with promotion status"""
        try:
            if self.dev_table:
                self.dev_table.update_item(
                    Key={
                        'id': track_id,
                        'createdDate': created_date
                    },
                    UpdateExpression='SET promotionStatus = :status, promotedAt = :promoted_at',
                    ExpressionAttributeValues={
                        ':status': status,
                        ':promoted_at': datetime.utcnow().isoformat()
                    }
                )
        except Exception as e:
            logger.error(f"Error updating DEV promotion status: {str(e)}")
    
    def _send_notification(self, subject: str, message: str, details: Dict[str, Any]):
        """Send notification via SNS"""
        try:
            if NOTIFICATION_TOPIC_ARN:
                notification_message = {
                    'subject': subject,
                    'message': message,
                    'details': details,
                    'timestamp': datetime.utcnow().isoformat()
                }
                
                sns_client.publish(
                    TopicArn=NOTIFICATION_TOPIC_ARN,
                    Subject=subject,
                    Message=json.dumps(notification_message, indent=2)
                )
                
                logger.info(f"Notification sent: {subject}")
        except Exception as e:
            logger.error(f"Error sending notification: {str(e)}")

def handler(event, context):
    """Lambda handler for content promotion"""
    promoter = ContentPromoter()
    
    try:
        # Handle different event types
        if 'trackId' in event:
            # Direct invocation
            track_id = event['trackId']
            auto_promote = event.get('autoPromote', False)
            
            # Validate content
            validation_results = promoter.validate_content_for_promotion(track_id)
            
            if validation_results['valid']:
                if auto_promote:
                    # Automatically promote if validation passes
                    promotion_result = promoter.promote_content_to_prod(track_id, validation_results)
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'message': 'Content promoted successfully',
                            'validation': validation_results,
                            'promotion': promotion_result
                        })
                    }
                else:
                    # Return validation results for manual approval
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'message': 'Content validation passed - ready for promotion',
                            'validation': validation_results,
                            'readyForPromotion': True
                        })
                    }
            else:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'message': 'Content validation failed',
                        'validation': validation_results,
                        'readyForPromotion': False
                    })
                }
        
        elif 'Records' in event:
            # Handle SQS or other event sources
            results = []
            
            for record in event['Records']:
                if 'body' in record:
                    message = json.loads(record['body'])
                    track_id = message.get('trackId')
                    
                    if track_id:
                        validation_results = promoter.validate_content_for_promotion(track_id)
                        
                        if validation_results['valid'] and message.get('autoPromote', False):
                            promotion_result = promoter.promote_content_to_prod(track_id, validation_results)
                            results.append({
                                'trackId': track_id,
                                'status': 'promoted',
                                'result': promotion_result
                            })
                        else:
                            results.append({
                                'trackId': track_id,
                                'status': 'validation_failed' if not validation_results['valid'] else 'pending_approval',
                                'validation': validation_results
                            })
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Content promotion processing completed',
                    'results': results
                })
            }
        
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Invalid event format'
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