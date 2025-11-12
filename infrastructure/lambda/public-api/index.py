import json
import boto3
import os
from boto3.dynamodb.types import TypeDeserializer
from decimal import Decimal

# AWS clients
dynamodb = boto3.client('dynamodb')

# Environment variables
METADATA_TABLE_NAME = os.environ['METADATA_TABLE_NAME']
CLOUDFRONT_DOMAIN = os.environ.get('CLOUDFRONT_DOMAIN', '')

# Type deserializer for DynamoDB
deserializer = TypeDeserializer()

def decimal_default(obj):
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

def deserialize_item(item):
    """Deserialize DynamoDB item to Python dict"""
    return {k: deserializer.deserialize(v) for k, v in item.items()}

def handler(event, context):
    """
    Public API for fetching audio tracks
    No authentication required - read-only access
    """
    
    # Enable CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    }
    
    # Handle OPTIONS request for CORS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    try:
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        limit = int(query_params.get('limit', 100))
        status_filter = query_params.get('status', 'processed')
        
        # Scan DynamoDB for tracks
        scan_params = {
            'TableName': METADATA_TABLE_NAME,
            'Limit': min(limit, 100),  # Cap at 100
            'FilterExpression': '#status = :status',
            'ExpressionAttributeNames': {
                '#status': 'status'
            },
            'ExpressionAttributeValues': {
                ':status': {'S': status_filter}
            }
        }
        
        response = dynamodb.scan(**scan_params)
        
        # Deserialize items
        items = [deserialize_item(item) for item in response.get('Items', [])]
        
        # Sort by createdDate descending
        items.sort(key=lambda x: x.get('createdDate', ''), reverse=True)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'tracks': items,
                'count': len(items)
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': 'Failed to fetch tracks',
                'message': str(e)
            })
        }
