/**
 * S3 Service - DEPRECATED
 * 
 * WARNING: This service is deprecated and should not be used.
 * Direct S3 access from frontend has been removed for security reasons.
 * 
 * Use public-api-service.ts instead for all audio URL generation.
 * 
 * SECURITY LESSON LEARNED:
 * - Never use AWS SDK directly in frontend code
 * - Audio URLs should come from secure backend APIs
 * - Frontend should only consume public endpoints
 */

console.warn('s3-service.ts is deprecated. Use public-api-service.ts instead.');

// This class is kept for reference but should not be used
export class S3Service {
  constructor() {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  }
}

// Export a dummy instance to prevent breaking changes
export const s3Service = {
  getSecureAudioUrl: () => {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  },
  checkFileExists: () => {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  },
  getFileMetadata: () => {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  },
  getAudioUrlsWithFallbacks: () => {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  },
  healthCheck: () => {
    throw new Error('S3Service is deprecated. Use public-api-service.ts instead.');
  },
};
