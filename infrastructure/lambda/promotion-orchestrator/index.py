import json
import boto3
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
sns_client = boto3.client('sns')
eventbridge_client = boto3.client('events')

# Environment variables
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'dev')
DEV_METADATA_TABLE = os.environ.get('DEV_METADATA_TABLE_NAME')
CONTENT_PROMOTER_FUNCTION = os.environ.get('CONTENT_PROMOTER_FUNCTION_NAME')
PIPELINE_TESTER_FUNCTION = os.environ.get('PIPELINE_TESTER_FUNCTION_NAME')
NOTIFICATION_TOPIC_ARN = os.environ.get('NOTIFICATION_TOPIC_ARN')

class PromotionOrchestrator:
    """Orchestrates the DEV to PROD content promotion workflow"""
    
    def __init__(self):
        self.dev_table = dynamodb.Table(DEV_METADATA_TABLE) if DEV_METADATA_TABLE else None
    
    def scan_for_promotion_candidates(self) -> List[Dict[str, Any]]:
        """Scan DEV environment for content ready for promotion"""
        logger.info("Scanning for promotion candidates")
        
        if not self.dev_table:
            logger.error("DEV metadata table not configured")
            return []
        
        candidates = []
        
        try:
            # Scan for processed tracks that haven't been promoted
            response = self.dev_table.scan(
                FilterExpression='#status = :status AND attribute_not_exists(promotionStatus)',
                ExpressionAttributeNames={
                    '#status': 'status'
                },
                ExpressionAttributeValues={
                    ':status': 'processed'
                }
            )
            
            for item in response['Items']:
                # Check if track is old enough for promotion (e.g., 1 hour)
                created_date = datetime.fromisoformat(item['createdDate'].replace('Z', '+00:00'))
                age_hours = (datetime.now().replace(tzinfo=created_date.tzinfo) - created_date).total_seconds() / 3600
                
                if age_hours >= 1:  # At least 1 hour old
                    candidates.append({
                        'trackId': item['id'],
                        'title': item.get('title', 'Unknown'),
                        'createdDate': item['createdDate'],
                        'ageHours': age_hours,
                        'fileSize': item.get('fileSize', 0),
                        'duration': item.get('duration', 0)
                    })
            
            logger.info(f"Found {len(candidates)} promotion candidates")
            return candidates
            
        except Exception as e:
            logger.error(f"Error scanning for candidates: {str(e)}")
            return []
    
    def validate_promotion_candidate(self, track_id: str) -> Dict[str, Any]:
        """Validate a single track for promotion"""
        logger.info(f"Validating promotion candidate: {track_id}")
        
        try:
            # Invoke content promoter for validation
            payload = {
                'trackId': track_id,
                'autoPromote': False  # Just validate, don't promote yet
            }
            
            response = lambda_client.invoke(
                FunctionName=CONTENT_PROMOTER_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                return {
                    'valid': body.get('readyForPromotion', False),
                    'validation': body.get('validation', {}),
                    'trackId': track_id
                }
            else:
                return {
                    'valid': False,
                    'error': result.get('body', 'Unknown error'),
                    'trackId': track_id
                }
                
        except Exception as e:
            logger.error(f"Error validating candidate {track_id}: {str(e)}")
            return {
                'valid': False,
                'error': str(e),
                'trackId': track_id
            }
    
    def execute_promotion(self, track_id: str) -> Dict[str, Any]:
        """Execute promotion for a validated track"""
        logger.info(f"Executing promotion for track: {track_id}")
        
        try:
            # Invoke content promoter for actual promotion
            payload = {
                'trackId': track_id,
                'autoPromote': True
            }
            
            response = lambda_client.invoke(
                FunctionName=CONTENT_PROMOTER_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                body = json.loads(result['body'])
                return {
                    'success': True,
                    'promotion': body.get('promotion', {}),
                    'trackId': track_id
                }
            else:
                return {
                    'success': False,
                    'error': result.get('body', 'Unknown error'),
                    'trackId': track_id
                }
                
        except Exception as e:
            logger.error(f"Error executing promotion for {track_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'trackId': track_id
            }
    
    def run_post_promotion_tests(self, track_id: str) -> Dict[str, Any]:
        """Run validation tests after promotion"""
        logger.info(f"Running post-promotion tests for track: {track_id}")
        
        try:
            # Run validation tests
            payload = {
                'testType': 'validation',
                'specificTrack': track_id
            }
            
            response = lambda_client.invoke(
                FunctionName=PIPELINE_TESTER_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            
            result = json.loads(response['Payload'].read())
            
            if result.get('statusCode') == 200:
                return {
                    'success': True,
                    'testResults': json.loads(result['body']),
                    'trackId': track_id
                }
            else:
                return {
                    'success': False,
                    'error': result.get('body', 'Test execution failed'),
                    'trackId': track_id
                }
                
        except Exception as e:
            logger.error(f"Error running post-promotion tests: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'trackId': track_id
            }
    
    def process_promotion_workflow(self, track_id: str) -> Dict[str, Any]:
        """Execute complete promotion workflow for a single track"""
        workflow_result = {
            'trackId': track_id,
            'startTime': datetime.utcnow().isoformat(),
            'steps': [],
            'success': False
        }
        
        try:
            # Step 1: Validate candidate
            logger.info(f"Step 1: Validating {track_id}")
            validation_result = self.validate_promotion_candidate(track_id)
            workflow_result['steps'].append({
                'step': 'validation',
                'success': validation_result['valid'],
                'result': validation_result
            })
            
            if not validation_result['valid']:
                workflow_result['error'] = 'Validation failed'
                return workflow_result
            
            # Step 2: Execute promotion
            logger.info(f"Step 2: Promoting {track_id}")
            promotion_result = self.execute_promotion(track_id)
            workflow_result['steps'].append({
                'step': 'promotion',
                'success': promotion_result['success'],
                'result': promotion_result
            })
            
            if not promotion_result['success']:
                workflow_result['error'] = 'Promotion failed'
                return workflow_result
            
            # Step 3: Run post-promotion tests
            logger.info(f"Step 3: Testing {track_id}")
            test_result = self.run_post_promotion_tests(track_id)
            workflow_result['steps'].append({
                'step': 'testing',
                'success': test_result['success'],
                'result': test_result
            })
            
            # Workflow is successful if all steps pass
            workflow_result['success'] = all(step['success'] for step in workflow_result['steps'])
            
            if not workflow_result['success']:
                workflow_result['error'] = 'Post-promotion tests failed'
            
        except Exception as e:
            logger.error(f"Workflow error for {track_id}: {str(e)}")
            workflow_result['error'] = str(e)
        
        workflow_result['endTime'] = datetime.utcnow().isoformat()
        return workflow_result
    
    def process_batch_promotion(self, max_promotions: int = 5) -> Dict[str, Any]:
        """Process a batch of promotions"""
        logger.info(f"Starting batch promotion (max: {max_promotions})")
        
        batch_result = {
            'startTime': datetime.utcnow().isoformat(),
            'maxPromotions': max_promotions,
            'candidates': [],
            'promotions': [],
            'summary': {
                'scanned': 0,
                'validated': 0,
                'promoted': 0,
                'failed': 0
            }
        }
        
        try:
            # Find promotion candidates
            candidates = self.scan_for_promotion_candidates()
            batch_result['candidates'] = candidates
            batch_result['summary']['scanned'] = len(candidates)
            
            # Process up to max_promotions
            for i, candidate in enumerate(candidates[:max_promotions]):
                track_id = candidate['trackId']
                
                logger.info(f"Processing promotion {i+1}/{min(len(candidates), max_promotions)}: {track_id}")
                
                workflow_result = self.process_promotion_workflow(track_id)
                batch_result['promotions'].append(workflow_result)
                
                if workflow_result['success']:
                    batch_result['summary']['promoted'] += 1
                else:
                    batch_result['summary']['failed'] += 1
            
            # Send batch summary notification
            self.send_batch_notification(batch_result)
            
        except Exception as e:
            logger.error(f"Batch promotion error: {str(e)}")
            batch_result['error'] = str(e)
        
        batch_result['endTime'] = datetime.utcnow().isoformat()
        return batch_result
    
    def send_batch_notification(self, batch_result: Dict[str, Any]):
        """Send notification about batch promotion results"""
        try:
            if not NOTIFICATION_TOPIC_ARN:
                return
            
            summary = batch_result['summary']
            
            subject = f"VoisLab Content Promotion Batch - {summary['promoted']} Promoted"
            
            message = f"""
Content Promotion Batch Results

Environment: {ENVIRONMENT.upper()}
Start Time: {batch_result['startTime']}
End Time: {batch_result.get('endTime', 'In Progress')}

Summary:
- Candidates Scanned: {summary['scanned']}
- Successfully Promoted: {summary['promoted']}
- Failed Promotions: {summary['failed']}
- Max Batch Size: {batch_result['maxPromotions']}

Status: {'SUCCESS' if summary['failed'] == 0 and summary['promoted'] > 0 else 'PARTIAL' if summary['promoted'] > 0 else 'FAILED'}

Promoted Tracks:
"""
            
            for promotion in batch_result['promotions']:
                if promotion['success']:
                    message += f"✓ {promotion['trackId']}\n"
                else:
                    message += f"✗ {promotion['trackId']} - {promotion.get('error', 'Unknown error')}\n"
            
            sns_client.publish(
                TopicArn=NOTIFICATION_TOPIC_ARN,
                Subject=subject,
                Message=message
            )
            
            logger.info("Batch notification sent")
            
        except Exception as e:
            logger.error(f"Error sending batch notification: {str(e)}")
    
    def schedule_next_batch(self, delay_minutes: int = 60):
        """Schedule the next batch promotion"""
        try:
            # Create EventBridge rule for next execution
            rule_name = f'voislab-promotion-batch-{int(datetime.utcnow().timestamp())}'
            
            # Schedule for delay_minutes from now
            schedule_time = datetime.utcnow() + timedelta(minutes=delay_minutes)
            
            # Create one-time rule
            eventbridge_client.put_rule(
                Name=rule_name,
                ScheduleExpression=f"at({schedule_time.strftime('%Y-%m-%dT%H:%M:%S')})",
                Description=f'One-time promotion batch scheduled for {schedule_time}',
                State='ENABLED'
            )
            
            # Add Lambda target
            eventbridge_client.put_targets(
                Rule=rule_name,
                Targets=[
                    {
                        'Id': '1',
                        'Arn': f"arn:aws:lambda:{os.environ.get('AWS_REGION')}:{os.environ.get('AWS_ACCOUNT_ID')}:function:{os.environ.get('AWS_LAMBDA_FUNCTION_NAME')}",
                        'Input': json.dumps({
                            'action': 'batch_promotion',
                            'scheduledBy': 'auto',
                            'scheduledAt': schedule_time.isoformat()
                        })
                    }
                ]
            )
            
            logger.info(f"Scheduled next batch promotion for {schedule_time}")
            
        except Exception as e:
            logger.error(f"Error scheduling next batch: {str(e)}")

def handler(event, context):
    """Lambda handler for promotion orchestration"""
    orchestrator = PromotionOrchestrator()
    
    try:
        action = event.get('action', 'batch_promotion')
        
        if action == 'batch_promotion':
            # Process batch promotion
            max_promotions = event.get('maxPromotions', 5)
            result = orchestrator.process_batch_promotion(max_promotions)
            
            # Schedule next batch if there are more candidates
            if result['summary']['scanned'] > result['summary']['promoted'] + result['summary']['failed']:
                orchestrator.schedule_next_batch(delay_minutes=60)
            
            return {
                'statusCode': 200,
                'body': json.dumps(result)
            }
        
        elif action == 'single_promotion':
            # Process single track promotion
            track_id = event.get('trackId')
            if not track_id:
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'trackId is required for single promotion'})
                }
            
            result = orchestrator.process_promotion_workflow(track_id)
            
            return {
                'statusCode': 200,
                'body': json.dumps(result)
            }
        
        elif action == 'scan_candidates':
            # Just scan and return candidates
            candidates = orchestrator.scan_for_promotion_candidates()
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'candidates': candidates,
                    'count': len(candidates)
                })
            }
        
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': f'Unknown action: {action}',
                    'supportedActions': ['batch_promotion', 'single_promotion', 'scan_candidates']
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