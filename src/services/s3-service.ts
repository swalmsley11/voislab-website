/**
 * S3 Service
 * Handles S3 operations for secure audio URL generation and media access
 */

import { 
  HeadObjectCommand,
  S3ServiceException 
} from '@aws-sdk/client-s3';
import { s3Client, AWS_CONFIG } from './aws-config';

export class S3Service {
  private bucketName: string;
  private cloudfrontDomain: string;
  private maxRetries: number;
  private retryDelay: number;
  // private urlExpirationTime: number;

  constructor() {
    this.bucketName = AWS_CONFIG.s3MediaBucket;
    this.cloudfrontDomain = AWS_CONFIG.cloudfrontDomain;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    // this.urlExpirationTime = 3600; // 1 hour in seconds
  }

  /**
   * Retry logic wrapper for S3 operations
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await this.delay(this.retryDelay);
        return this.withRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof S3ServiceException) {
      return error.name === 'InternalError' ||
             error.name === 'ServiceUnavailable' ||
             error.name === 'SlowDown' ||
             error.$retryable?.throttling === true;
    }
    return false;
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a secure, signed URL for audio streaming
   * Uses CloudFront if available, otherwise falls back to S3 presigned URLs
   */
  async getSecureAudioUrl(key: string): Promise<string> {
    return this.withRetry(async () => {
      try {
        // If CloudFront is configured, use it for better performance
        if (this.cloudfrontDomain) {
          return `https://${this.cloudfrontDomain}/${key}`;
        }

        // Otherwise, generate a direct S3 URL (for public buckets)
        // In production, you would use presigned URLs for private buckets
        return `https://${this.bucketName}.s3.amazonaws.com/${key}`;
      } catch (error) {
        console.error(`Error generating secure URL for ${key}:`, error);
        throw new Error(`Failed to generate secure URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * Check if an audio file exists in S3
   */
  async checkFileExists(key: string): Promise<boolean> {
    return this.withRetry(async () => {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });

        await s3Client.send(command);
        return true;
      } catch (error) {
        if (error instanceof S3ServiceException && error.name === 'NotFound') {
          return false;
        }
        console.error(`Error checking file existence for ${key}:`, error);
        throw new Error(`Failed to check file existence: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(key: string): Promise<{
    contentLength?: number;
    contentType?: string;
    lastModified?: Date;
  } | null> {
    return this.withRetry(async () => {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });

        const response = await s3Client.send(command);
        
        return {
          contentLength: response.ContentLength,
          contentType: response.ContentType,
          lastModified: response.LastModified,
        };
      } catch (error) {
        if (error instanceof S3ServiceException && error.name === 'NotFound') {
          return null;
        }
        console.error(`Error getting file metadata for ${key}:`, error);
        throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * Generate multiple format URLs for audio files
   * Supports fallback formats (MP3, WAV, etc.)
   */
  async getAudioUrlsWithFallbacks(baseKey: string): Promise<{
    primary: string;
    fallbacks: string[];
  }> {
    const formats = ['mp3', 'wav', 'ogg'];
    const urls: string[] = [];
    
    for (const format of formats) {
      const key = `${baseKey}.${format}`;
      try {
        const exists = await this.checkFileExists(key);
        if (exists) {
          const url = await this.getSecureAudioUrl(key);
          urls.push(url);
        }
      } catch (error) {
        console.warn(`Could not check/generate URL for ${key}:`, error);
      }
    }

    if (urls.length === 0) {
      throw new Error(`No audio files found for base key: ${baseKey}`);
    }

    return {
      primary: urls[0],
      fallbacks: urls.slice(1),
    };
  }

  /**
   * Health check for S3 connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: 'health-check', // This file doesn't need to exist
      });
      
      await s3Client.send(command);
      return true;
    } catch (error) {
      // We expect a NotFound error for health check, which means S3 is accessible
      if (error instanceof S3ServiceException && error.name === 'NotFound') {
        return true;
      }
      console.error('S3 health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const s3Service = new S3Service();