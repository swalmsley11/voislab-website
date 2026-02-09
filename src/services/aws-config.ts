/**
 * AWS Configuration - DEPRECATED
 * 
 * WARNING: This file is deprecated and should not be used.
 * Direct AWS SDK usage in frontend has been removed for security reasons.
 * 
 * Use public-api-service.ts instead for all data fetching.
 * 
 * SECURITY LESSON LEARNED:
 * - Never put AWS credentials in frontend code
 * - Use public APIs with proper CORS instead of direct AWS SDK calls
 * - Frontend should only access public endpoints
 */

// This file is kept for reference but should not be imported
console.warn('aws-config.ts is deprecated. Use public-api-service.ts instead.');

// Environment variables for reference only (no AWS clients created)
export const AWS_CONFIG = {
  region: import.meta.env.VITE_AWS_REGION || 'us-west-2',
  // Removed: dynamoDBTableName, s3MediaBucket, cloudfrontDomain
  // These are now handled by the backend API
} as const;
