/**
 * DynamoDB Service
 * Handles all DynamoDB operations for audio track metadata
 */

import {
  ScanCommand,
  GetItemCommand,
  QueryCommand,
  DynamoDBServiceException,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { dynamoDBClient, AWS_CONFIG } from './aws-config';
import { AudioTrack } from '../types/audio-track';

export class DynamoDBService {
  private tableName: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor() {
    this.tableName = AWS_CONFIG.dynamoDBTableName;
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Retry logic wrapper for DynamoDB operations
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
    if (error instanceof DynamoDBServiceException) {
      return (
        error.name === 'ProvisionedThroughputExceededException' ||
        error.name === 'ThrottlingException' ||
        error.name === 'InternalServerError' ||
        error.$retryable?.throttling === true
      );
    }
    return false;
  }

  /**
   * Delay utility for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get all audio tracks from DynamoDB
   */
  async getAllTracks(): Promise<AudioTrack[]> {
    return this.withRetry(async () => {
      try {
        const command = new ScanCommand({
          TableName: this.tableName,
        });

        const response = await dynamoDBClient.send(command);

        if (!response.Items) {
          return [];
        }

        return response.Items.map((item) => {
          const unmarshalled = unmarshall(item);
          return this.mapDynamoItemToAudioTrack(unmarshalled);
        });
      } catch (error) {
        console.error('Error fetching all tracks:', error);
        throw new Error(
          `Failed to fetch tracks: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Get a specific track by ID
   */
  async getTrackById(trackId: string): Promise<AudioTrack | null> {
    return this.withRetry(async () => {
      try {
        const command = new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ id: trackId }),
        });

        const response = await dynamoDBClient.send(command);

        if (!response.Item) {
          return null;
        }

        const unmarshalled = unmarshall(response.Item);
        return this.mapDynamoItemToAudioTrack(unmarshalled);
      } catch (error) {
        console.error(`Error fetching track ${trackId}:`, error);
        throw new Error(
          `Failed to fetch track: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Query tracks by genre
   */
  async getTracksByGenre(genre: string): Promise<AudioTrack[]> {
    return this.withRetry(async () => {
      try {
        // Assuming there's a GSI on genre
        const command = new QueryCommand({
          TableName: this.tableName,
          IndexName: 'genre-index', // This would need to be created in infrastructure
          KeyConditionExpression: 'genre = :genre',
          ExpressionAttributeValues: marshall({
            ':genre': genre,
          }),
        });

        const response = await dynamoDBClient.send(command);

        if (!response.Items) {
          return [];
        }

        return response.Items.map((item) => {
          const unmarshalled = unmarshall(item);
          return this.mapDynamoItemToAudioTrack(unmarshalled);
        });
      } catch (error) {
        console.error(`Error fetching tracks by genre ${genre}:`, error);
        // If GSI doesn't exist, fall back to scan with filter
        return this.getAllTracks().then((tracks) =>
          tracks.filter((track) => track.genre === genre)
        );
      }
    });
  }

  /**
   * Map DynamoDB item to AudioTrack interface
   */
  private mapDynamoItemToAudioTrack(item: any): AudioTrack {
    return {
      id: item.id || '',
      title: item.title || '',
      description: item.description || '',
      duration: item.duration || 0,
      fileUrl: item.fileUrl || '',
      thumbnailUrl: item.thumbnailUrl || '',
      createdDate: item.createdDate ? new Date(item.createdDate) : new Date(),
      genre: item.genre || '',
      tags: item.tags || [],
      streamingLinks: item.streamingLinks || [],
    };
  }

  /**
   * Health check for DynamoDB connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
        Limit: 1,
      });

      await dynamoDBClient.send(command);
      return true;
    } catch (error) {
      console.error('DynamoDB health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const dynamoDBService = new DynamoDBService();
