"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoislabWebsiteStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const s3n = require("aws-cdk-lib/aws-s3-notifications");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
const lambda = require("aws-cdk-lib/aws-lambda");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
class VoislabWebsiteStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment } = props;
        // S3 bucket for audio file uploads
        const uploadBucket = new s3.Bucket(this, 'UploadBucket', {
            bucketName: `voislab-upload-${environment}-${this.account}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            lifecycleRules: [
                {
                    id: 'DeleteIncompleteMultipartUploads',
                    abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
                },
                {
                    id: 'DeleteOldVersions',
                    noncurrentVersionExpiration: cdk.Duration.days(30),
                },
            ],
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // S3 bucket for website hosting
        const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
            bucketName: `voislab-website-${environment}-${this.account}`,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'error.html',
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // S3 bucket for processed media storage
        const mediaBucket = new s3.Bucket(this, 'MediaBucket', {
            bucketName: `voislab-media-${environment}-${this.account}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            versioned: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                    maxAge: 3600,
                },
            ],
            lifecycleRules: [
                {
                    id: 'DeleteOldVersions',
                    noncurrentVersionExpiration: cdk.Duration.days(90),
                },
            ],
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // DynamoDB table for audio track metadata
        const audioMetadataTable = new dynamodb.Table(this, 'AudioMetadataTable', {
            tableName: `voislab-audio-metadata-${environment}`,
            partitionKey: {
                name: 'id',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: environment === 'prod',
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // Global Secondary Index for querying by status
        audioMetadataTable.addGlobalSecondaryIndex({
            indexName: 'StatusIndex',
            partitionKey: {
                name: 'status',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Global Secondary Index for querying by genre
        audioMetadataTable.addGlobalSecondaryIndex({
            indexName: 'GenreIndex',
            partitionKey: {
                name: 'genre',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'createdDate',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Lambda function for audio processing
        const audioProcessorFunction = new lambda.Function(this, 'AudioProcessorFunction', {
            functionName: `voislab-audio-processor-${environment}`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os
from datetime import datetime
import uuid

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    """
    Process uploaded audio files from S3 upload bucket
    Extract metadata and move to media bucket
    """
    
    table_name = os.environ['METADATA_TABLE_NAME']
    media_bucket = os.environ['MEDIA_BUCKET_NAME']
    
    table = dynamodb.Table(table_name)
    
    try:
        # Process each S3 event record
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']
            
            # Skip non-audio files
            if not any(object_key.lower().endswith(ext) for ext in ['.mp3', '.wav', '.flac', '.m4a']):
                continue
            
            # Get object metadata
            response = s3_client.head_object(Bucket=bucket_name, Key=object_key)
            file_size = response['ContentLength']
            
            # Generate unique ID for the track
            track_id = str(uuid.uuid4())
            
            # Extract basic metadata from filename
            filename = object_key.split('/')[-1]
            title = filename.rsplit('.', 1)[0].replace('_', ' ').replace('-', ' ').title()
            
            # Copy file to media bucket with new key
            media_key = f"audio/{track_id}/{filename}"
            copy_source = {'Bucket': bucket_name, 'Key': object_key}
            
            s3_client.copy_object(
                CopySource=copy_source,
                Bucket=media_bucket,
                Key=media_key,
                MetadataDirective='REPLACE',
                Metadata={
                    'track-id': track_id,
                    'original-filename': filename,
                    'processed-date': datetime.utcnow().isoformat()
                }
            )
            
            # Store metadata in DynamoDB
            created_date = datetime.utcnow().isoformat()
            
            table.put_item(
                Item={
                    'id': track_id,
                    'createdDate': created_date,
                    'title': title,
                    'filename': filename,
                    'fileUrl': f"s3://{media_bucket}/{media_key}",
                    'fileSize': file_size,
                    'status': 'processed',
                    'genre': 'unknown',
                    'duration': 0,  # Will be updated by future processing
                    'description': '',
                    'tags': []
                }
            )
            
            print(f"Successfully processed {filename} -> {track_id}")
            
        return {
            'statusCode': 200,
            'body': json.dumps('Audio processing completed successfully')
        }
        
    except Exception as e:
        print(f"Error processing audio: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error: {str(e)}')
        }
      `),
            environment: {
                'METADATA_TABLE_NAME': audioMetadataTable.tableName,
                'MEDIA_BUCKET_NAME': mediaBucket.bucketName,
                'UPLOAD_BUCKET_NAME': uploadBucket.bucketName,
            },
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
        });
        // Grant Lambda permissions to access S3 buckets
        uploadBucket.grantRead(audioProcessorFunction);
        mediaBucket.grantReadWrite(audioProcessorFunction);
        // Grant Lambda permissions to write to DynamoDB
        audioMetadataTable.grantWriteData(audioProcessorFunction);
        // Add S3 event notification to trigger Lambda
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.mp3',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.wav',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.flac',
        });
        uploadBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(audioProcessorFunction), {
            prefix: 'audio/',
            suffix: '.m4a',
        });
        // CloudFront Origin Access Identity
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
            comment: `OAI for VoisLab Website ${environment}`,
        });
        // Grant CloudFront access to the website bucket
        websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [websiteBucket.arnForObjects('*')],
            principals: [originAccessIdentity.grantPrincipal],
        }));
        // Grant CloudFront access to the media bucket
        mediaBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [mediaBucket.arnForObjects('*')],
            principals: [originAccessIdentity.grantPrincipal],
        }));
        // CloudFront distribution
        const distribution = new cloudfront.Distribution(this, 'Distribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(websiteBucket, {
                    originAccessIdentity,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
            },
            additionalBehaviors: {
                '/media/*': {
                    origin: new origins.S3Origin(mediaBucket, {
                        originAccessIdentity,
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    compress: true,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS,
                },
            },
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
            ],
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        });
        // Outputs
        new cdk.CfnOutput(this, 'UploadBucketName', {
            value: uploadBucket.bucketName,
            description: 'Name of the S3 bucket for audio file uploads',
        });
        new cdk.CfnOutput(this, 'WebsiteBucketName', {
            value: websiteBucket.bucketName,
            description: 'Name of the S3 bucket for website hosting',
        });
        new cdk.CfnOutput(this, 'MediaBucketName', {
            value: mediaBucket.bucketName,
            description: 'Name of the S3 bucket for processed media storage',
        });
        new cdk.CfnOutput(this, 'AudioMetadataTableName', {
            value: audioMetadataTable.tableName,
            description: 'Name of the DynamoDB table for audio metadata',
        });
        new cdk.CfnOutput(this, 'AudioProcessorFunctionName', {
            value: audioProcessorFunction.functionName,
            description: 'Name of the Lambda function for audio processing',
        });
        new cdk.CfnOutput(this, 'DistributionId', {
            value: distribution.distributionId,
            description: 'CloudFront Distribution ID',
        });
        new cdk.CfnOutput(this, 'DistributionDomainName', {
            value: distribution.distributionDomainName,
            description: 'CloudFront Distribution Domain Name',
        });
    }
}
exports.VoislabWebsiteStack = VoislabWebsiteStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidm9pc2xhYi13ZWJzaXRlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidm9pc2xhYi13ZWJzaXRlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUVuQyx5Q0FBeUM7QUFDekMsd0RBQXdEO0FBQ3hELHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUNqRCxxREFBcUQ7QUFNckQsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFOUIsbUNBQW1DO1FBQ25DLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSxrQkFBa0IsV0FBVyxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDM0QsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsU0FBUztZQUNqRCxTQUFTLEVBQUUsSUFBSTtZQUNmLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsa0NBQWtDO29CQUN0QyxtQ0FBbUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7aUJBQzFEO2dCQUNEO29CQUNFLEVBQUUsRUFBRSxtQkFBbUI7b0JBQ3ZCLDJCQUEyQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztpQkFDbkQ7YUFDRjtZQUNELGFBQWEsRUFBRSxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0s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QUUsc0JBQXNCLENBQUMsWUFBWTtZQUMxQyxXQUFXLEVBQUUsa0RBQWtEO1NBQ2hFLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLFlBQVksQ0FBQyxjQUFjO1lBQ2xDLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsWUFBWSxDQUFDLHNCQUFzQjtZQUMxQyxXQUFXLEVBQUUscUNBQXFDO1NBQ25ELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZWRCxrREF1VkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVm9pc2xhYldlYnNpdGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVm9pc2xhYldlYnNpdGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWb2lzbGFiV2Vic2l0ZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBhdWRpbyBmaWxlIHVwbG9hZHNcbiAgICBjb25zdCB1cGxvYWRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdVcGxvYWRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi11cGxvYWQtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZUluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nXG4gICAgY29uc3Qgd2Vic2l0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYnNpdGVCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi13ZWJzaXRlLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdlcnJvci5odG1sJyxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBwcm9jZXNzZWQgbWVkaWEgc3RvcmFnZVxuICAgIGNvbnN0IG1lZGlhQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTWVkaWFCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgdm9pc2xhYi1tZWRpYS0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgY29yczogW1xuICAgICAgICB7XG4gICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtzMy5IdHRwTWV0aG9kcy5HRVQsIHMzLkh0dHBNZXRob2RzLkhFQURdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSxcbiAgICAgICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICAgICAgbWF4QWdlOiAzNjAwLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZFZlcnNpb25zJyxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBhdWRpbyB0cmFjayBtZXRhZGF0YVxuICAgIGNvbnN0IGF1ZGlvTWV0YWRhdGFUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnQXVkaW9NZXRhZGF0YVRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgdm9pc2xhYi1hdWRpby1tZXRhZGF0YS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ2lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gR2xvYmFsIFNlY29uZGFyeSBJbmRleCBmb3IgcXVlcnlpbmcgYnkgc3RhdHVzXG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ1N0YXR1c0luZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnc3RhdHVzJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnY3JlYXRlZERhdGUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IGZvciBxdWVyeWluZyBieSBnZW5yZVxuICAgIGF1ZGlvTWV0YWRhdGFUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdHZW5yZUluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnZ2VucmUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVkRGF0ZScsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiBmb3IgYXVkaW8gcHJvY2Vzc2luZ1xuICAgIGNvbnN0IGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdWRpb1Byb2Nlc3NvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgdm9pc2xhYi1hdWRpby1wcm9jZXNzb3ItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBvc1xuZnJvbSBkYXRldGltZSBpbXBvcnQgZGF0ZXRpbWVcbmltcG9ydCB1dWlkXG5cbnMzX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnczMnKVxuZHluYW1vZGIgPSBib3RvMy5yZXNvdXJjZSgnZHluYW1vZGInKVxuXG5kZWYgaGFuZGxlcihldmVudCwgY29udGV4dCk6XG4gICAgXCJcIlwiXG4gICAgUHJvY2VzcyB1cGxvYWRlZCBhdWRpbyBmaWxlcyBmcm9tIFMzIHVwbG9hZCBidWNrZXRcbiAgICBFeHRyYWN0IG1ldGFkYXRhIGFuZCBtb3ZlIHRvIG1lZGlhIGJ1Y2tldFxuICAgIFwiXCJcIlxuICAgIFxuICAgIHRhYmxlX25hbWUgPSBvcy5lbnZpcm9uWydNRVRBREFUQV9UQUJMRV9OQU1FJ11cbiAgICBtZWRpYV9idWNrZXQgPSBvcy5lbnZpcm9uWydNRURJQV9CVUNLRVRfTkFNRSddXG4gICAgXG4gICAgdGFibGUgPSBkeW5hbW9kYi5UYWJsZSh0YWJsZV9uYW1lKVxuICAgIFxuICAgIHRyeTpcbiAgICAgICAgIyBQcm9jZXNzIGVhY2ggUzMgZXZlbnQgcmVjb3JkXG4gICAgICAgIGZvciByZWNvcmQgaW4gZXZlbnRbJ1JlY29yZHMnXTpcbiAgICAgICAgICAgIGJ1Y2tldF9uYW1lID0gcmVjb3JkWydzMyddWydidWNrZXQnXVsnbmFtZSddXG4gICAgICAgICAgICBvYmplY3Rfa2V5ID0gcmVjb3JkWydzMyddWydvYmplY3QnXVsna2V5J11cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBTa2lwIG5vbi1hdWRpbyBmaWxlc1xuICAgICAgICAgICAgaWYgbm90IGFueShvYmplY3Rfa2V5Lmxvd2VyKCkuZW5kc3dpdGgoZXh0KSBmb3IgZXh0IGluIFsnLm1wMycsICcud2F2JywgJy5mbGFjJywgJy5tNGEnXSk6XG4gICAgICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgIyBHZXQgb2JqZWN0IG1ldGFkYXRhXG4gICAgICAgICAgICByZXNwb25zZSA9IHMzX2NsaWVudC5oZWFkX29iamVjdChCdWNrZXQ9YnVja2V0X25hbWUsIEtleT1vYmplY3Rfa2V5KVxuICAgICAgICAgICAgZmlsZV9zaXplID0gcmVzcG9uc2VbJ0NvbnRlbnRMZW5ndGgnXVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIEdlbmVyYXRlIHVuaXF1ZSBJRCBmb3IgdGhlIHRyYWNrXG4gICAgICAgICAgICB0cmFja19pZCA9IHN0cih1dWlkLnV1aWQ0KCkpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgRXh0cmFjdCBiYXNpYyBtZXRhZGF0YSBmcm9tIGZpbGVuYW1lXG4gICAgICAgICAgICBmaWxlbmFtZSA9IG9iamVjdF9rZXkuc3BsaXQoJy8nKVstMV1cbiAgICAgICAgICAgIHRpdGxlID0gZmlsZW5hbWUucnNwbGl0KCcuJywgMSlbMF0ucmVwbGFjZSgnXycsICcgJykucmVwbGFjZSgnLScsICcgJykudGl0bGUoKVxuICAgICAgICAgICAgXG4gICAgICAgICAgICAjIENvcHkgZmlsZSB0byBtZWRpYSBidWNrZXQgd2l0aCBuZXcga2V5XG4gICAgICAgICAgICBtZWRpYV9rZXkgPSBmXCJhdWRpby97dHJhY2tfaWR9L3tmaWxlbmFtZX1cIlxuICAgICAgICAgICAgY29weV9zb3VyY2UgPSB7J0J1Y2tldCc6IGJ1Y2tldF9uYW1lLCAnS2V5Jzogb2JqZWN0X2tleX1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgczNfY2xpZW50LmNvcHlfb2JqZWN0KFxuICAgICAgICAgICAgICAgIENvcHlTb3VyY2U9Y29weV9zb3VyY2UsXG4gICAgICAgICAgICAgICAgQnVja2V0PW1lZGlhX2J1Y2tldCxcbiAgICAgICAgICAgICAgICBLZXk9bWVkaWFfa2V5LFxuICAgICAgICAgICAgICAgIE1ldGFkYXRhRGlyZWN0aXZlPSdSRVBMQUNFJyxcbiAgICAgICAgICAgICAgICBNZXRhZGF0YT17XG4gICAgICAgICAgICAgICAgICAgICd0cmFjay1pZCc6IHRyYWNrX2lkLFxuICAgICAgICAgICAgICAgICAgICAnb3JpZ2luYWwtZmlsZW5hbWUnOiBmaWxlbmFtZSxcbiAgICAgICAgICAgICAgICAgICAgJ3Byb2Nlc3NlZC1kYXRlJzogZGF0ZXRpbWUudXRjbm93KCkuaXNvZm9ybWF0KClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApXG4gICAgICAgICAgICBcbiAgICAgICAgICAgICMgU3RvcmUgbWV0YWRhdGEgaW4gRHluYW1vREJcbiAgICAgICAgICAgIGNyZWF0ZWRfZGF0ZSA9IGRhdGV0aW1lLnV0Y25vdygpLmlzb2Zvcm1hdCgpXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHRhYmxlLnB1dF9pdGVtKFxuICAgICAgICAgICAgICAgIEl0ZW09e1xuICAgICAgICAgICAgICAgICAgICAnaWQnOiB0cmFja19pZCxcbiAgICAgICAgICAgICAgICAgICAgJ2NyZWF0ZWREYXRlJzogY3JlYXRlZF9kYXRlLFxuICAgICAgICAgICAgICAgICAgICAndGl0bGUnOiB0aXRsZSxcbiAgICAgICAgICAgICAgICAgICAgJ2ZpbGVuYW1lJzogZmlsZW5hbWUsXG4gICAgICAgICAgICAgICAgICAgICdmaWxlVXJsJzogZlwiczM6Ly97bWVkaWFfYnVja2V0fS97bWVkaWFfa2V5fVwiLFxuICAgICAgICAgICAgICAgICAgICAnZmlsZVNpemUnOiBmaWxlX3NpemUsXG4gICAgICAgICAgICAgICAgICAgICdzdGF0dXMnOiAncHJvY2Vzc2VkJyxcbiAgICAgICAgICAgICAgICAgICAgJ2dlbnJlJzogJ3Vua25vd24nLFxuICAgICAgICAgICAgICAgICAgICAnZHVyYXRpb24nOiAwLCAgIyBXaWxsIGJlIHVwZGF0ZWQgYnkgZnV0dXJlIHByb2Nlc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgJ2Rlc2NyaXB0aW9uJzogJycsXG4gICAgICAgICAgICAgICAgICAgICd0YWdzJzogW11cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApXG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHByaW50KGZcIlN1Y2Nlc3NmdWxseSBwcm9jZXNzZWQge2ZpbGVuYW1lfSAtPiB7dHJhY2tfaWR9XCIpXG4gICAgICAgICAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKCdBdWRpbyBwcm9jZXNzaW5nIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknKVxuICAgICAgICB9XG4gICAgICAgIFxuICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3IgcHJvY2Vzc2luZyBhdWRpbzoge3N0cihlKX1cIilcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNTAwLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKGYnRXJyb3I6IHtzdHIoZSl9JylcbiAgICAgICAgfVxuICAgICAgYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAnTUVUQURBVEFfVEFCTEVfTkFNRSc6IGF1ZGlvTWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXG4gICAgICAgICdNRURJQV9CVUNLRVRfTkFNRSc6IG1lZGlhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICdVUExPQURfQlVDS0VUX05BTUUnOiB1cGxvYWRCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IExhbWJkYSBwZXJtaXNzaW9ucyB0byBhY2Nlc3MgUzMgYnVja2V0c1xuICAgIHVwbG9hZEJ1Y2tldC5ncmFudFJlYWQoYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbik7XG4gICAgbWVkaWFCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbik7XG4gICAgXG4gICAgLy8gR3JhbnQgTGFtYmRhIHBlcm1pc3Npb25zIHRvIHdyaXRlIHRvIER5bmFtb0RCXG4gICAgYXVkaW9NZXRhZGF0YVRhYmxlLmdyYW50V3JpdGVEYXRhKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pO1xuXG4gICAgLy8gQWRkIFMzIGV2ZW50IG5vdGlmaWNhdGlvbiB0byB0cmlnZ2VyIExhbWJkYVxuICAgIHVwbG9hZEJ1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oYXVkaW9Qcm9jZXNzb3JGdW5jdGlvbiksXG4gICAgICB7XG4gICAgICAgIHByZWZpeDogJ2F1ZGlvLycsXG4gICAgICAgIHN1ZmZpeDogJy5tcDMnLFxuICAgICAgfVxuICAgICk7XG5cbiAgICB1cGxvYWRCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBwcmVmaXg6ICdhdWRpby8nLFxuICAgICAgICBzdWZmaXg6ICcud2F2JyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgdXBsb2FkQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbihhdWRpb1Byb2Nlc3NvckZ1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgcHJlZml4OiAnYXVkaW8vJyxcbiAgICAgICAgc3VmZml4OiAnLmZsYWMnLFxuICAgICAgfVxuICAgICk7XG5cbiAgICB1cGxvYWRCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXG4gICAgICBuZXcgczNuLkxhbWJkYURlc3RpbmF0aW9uKGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBwcmVmaXg6ICdhdWRpby8nLFxuICAgICAgICBzdWZmaXg6ICcubTRhJyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIElkZW50aXR5XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzSWRlbnRpdHkgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NJZGVudGl0eSh0aGlzLCAnT0FJJywge1xuICAgICAgY29tbWVudDogYE9BSSBmb3IgVm9pc0xhYiBXZWJzaXRlICR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkRnJvbnQgYWNjZXNzIHRvIHRoZSB3ZWJzaXRlIGJ1Y2tldFxuICAgIHdlYnNpdGVCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbd2Vic2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgICBwcmluY2lwYWxzOiBbb3JpZ2luQWNjZXNzSWRlbnRpdHkuZ3JhbnRQcmluY2lwYWxdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRGcm9udCBhY2Nlc3MgdG8gdGhlIG1lZGlhIGJ1Y2tldFxuICAgIG1lZGlhQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICAgIHJlc291cmNlczogW21lZGlhQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgICAgIHByaW5jaXBhbHM6IFtvcmlnaW5BY2Nlc3NJZGVudGl0eS5ncmFudFByaW5jaXBhbF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDbG91ZEZyb250IGRpc3RyaWJ1dGlvblxuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4od2Vic2l0ZUJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0lkZW50aXR5LFxuICAgICAgICB9KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXG4gICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvbWVkaWEvKic6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlMzT3JpZ2luKG1lZGlhQnVja2V0LCB7XG4gICAgICAgICAgICBvcmlnaW5BY2Nlc3NJZGVudGl0eSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICAgIGNhY2hlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQ2FjaGVkTWV0aG9kcy5DQUNIRV9HRVRfSEVBRF9PUFRJT05TLFxuICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVEX0ZPUl9VTkNPTVBSRVNTRURfT0JKRUNUUyxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VwbG9hZEJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3IgYXVkaW8gZmlsZSB1cGxvYWRzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB3ZWJzaXRlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZWRpYUJ1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogbWVkaWFCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBwcm9jZXNzZWQgbWVkaWEgc3RvcmFnZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXVkaW9NZXRhZGF0YVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhdWRpb01ldGFkYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgYXVkaW8gbWV0YWRhdGEnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F1ZGlvUHJvY2Vzc29yRnVuY3Rpb25OYW1lJywge1xuICAgICAgdmFsdWU6IGF1ZGlvUHJvY2Vzc29yRnVuY3Rpb24uZnVuY3Rpb25OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBMYW1iZGEgZnVuY3Rpb24gZm9yIGF1ZGlvIHByb2Nlc3NpbmcnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rpc3RyaWJ1dGlvbklkJywge1xuICAgICAgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rpc3RyaWJ1dGlvbkRvbWFpbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIERvbWFpbiBOYW1lJyxcbiAgICB9KTtcbiAgfVxufSJdfQ==