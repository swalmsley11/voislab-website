/**
 * DynamoDB Service - DEPRECATED
 * 
 * WARNING: This service is deprecated and should not be used.
 * Direct DynamoDB access from frontend has been removed for security reasons.
 * 
 * Use public-api-service.ts instead for all data fetching.
 */

console.warn('dynamodb-service.ts is deprecated. Use public-api-service.ts instead.');

// Dummy export to prevent breaking changes
export class DynamoDBService {
  constructor() {
    throw new Error('DynamoDBService is deprecated. Use public-api-service.ts instead.');
  }
}

export const dynamoDBService = {
  getAllTracks: () => {
    throw new Error('DynamoDBService is deprecated. Use public-api-service.ts instead.');
  },
  getTrackById: () => {
    throw new Error('DynamoDBService is deprecated. Use public-api-service.ts instead.');
  },
  healthCheck: () => {
    throw new Error('DynamoDBService is deprecated. Use public-api-service.ts instead.');
  },
};
