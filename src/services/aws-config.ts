/**
 * AWS Configuration and Client Setup
 * Provides centralized configuration for AWS services
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

// Environment-based configuration
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = import.meta.env.VITE_AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY;

// AWS Client configuration
const awsConfig = {
  region: AWS_REGION,
  ...(AWS_ACCESS_KEY_ID &&
    AWS_SECRET_ACCESS_KEY && {
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    }),
};

// DynamoDB Client
export const dynamoDBClient = new DynamoDBClient(awsConfig);

// S3 Client
export const s3Client = new S3Client(awsConfig);

// Environment variables for service configuration
export const AWS_CONFIG = {
  region: AWS_REGION,
  dynamoDBTableName:
    import.meta.env.VITE_DYNAMODB_TABLE_NAME || 'voislab-tracks',
  s3MediaBucket: import.meta.env.VITE_S3_MEDIA_BUCKET || 'voislab-media',
  cloudfrontDomain: import.meta.env.VITE_CLOUDFRONT_DOMAIN || '',
} as const;
