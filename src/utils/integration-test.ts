/**
 * Integration Test Utilities
 * Comprehensive testing for data integration and API functionality
 */

import { dynamoDBService } from '../services/dynamodb-service';
import { s3Service } from '../services/s3-service';
import { streamingPlatformsService } from '../services/streaming-platforms';
// import { AudioError } from '../types/audio-track';

export interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  error?: Error;
}

export interface TestSuite {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

class IntegrationTester {

  /**
   * Run a single test with timing
   */
  private async runTest(
    testName: string,
    testFunction: () => Promise<void>
  ): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      
      return {
        testName,
        passed: true,
        message: 'Test passed successfully',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        testName,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Test DynamoDB connection and basic operations
   */
  async testDynamoDBIntegration(): Promise<TestResult[]> {
    const tests: TestResult[] = [];

    // Test 1: Health check
    tests.push(await this.runTest('DynamoDB Health Check', async () => {
      const isHealthy = await dynamoDBService.healthCheck();
      if (!isHealthy) {
        throw new Error('DynamoDB health check failed');
      }
    }));

    // Test 2: Get all tracks
    tests.push(await this.runTest('DynamoDB Get All Tracks', async () => {
      const tracks = await dynamoDBService.getAllTracks();
      if (!Array.isArray(tracks)) {
        throw new Error('getAllTracks did not return an array');
      }
      console.log(`Retrieved ${tracks.length} tracks from DynamoDB`);
    }));

    // Test 3: Get track by ID (if tracks exist)
    tests.push(await this.runTest('DynamoDB Get Track By ID', async () => {
      const tracks = await dynamoDBService.getAllTracks();
      if (tracks.length > 0) {
        const firstTrack = tracks[0];
        const retrievedTrack = await dynamoDBService.getTrackById(firstTrack.id);
        if (!retrievedTrack) {
          throw new Error(`Could not retrieve track with ID: ${firstTrack.id}`);
        }
        if (retrievedTrack.id !== firstTrack.id) {
          throw new Error('Retrieved track ID does not match requested ID');
        }
      } else {
        console.log('No tracks available for ID test - this is expected for empty database');
      }
    }));

    // Test 4: Error handling for non-existent track
    tests.push(await this.runTest('DynamoDB Non-existent Track Handling', async () => {
      const nonExistentTrack = await dynamoDBService.getTrackById('non-existent-id');
      if (nonExistentTrack !== null) {
        throw new Error('Expected null for non-existent track, but got a result');
      }
    }));

    return tests;
  }

  /**
   * Test S3 integration and URL generation
   */
  async testS3Integration(): Promise<TestResult[]> {
    const tests: TestResult[] = [];

    // Test 1: Health check
    tests.push(await this.runTest('S3 Health Check', async () => {
      const isHealthy = await s3Service.healthCheck();
      if (!isHealthy) {
        throw new Error('S3 health check failed');
      }
    }));

    // Test 2: Generate secure URL
    tests.push(await this.runTest('S3 Secure URL Generation', async () => {
      const testKey = 'test-audio-file.mp3';
      const secureUrl = await s3Service.getSecureAudioUrl(testKey);
      
      if (!secureUrl || typeof secureUrl !== 'string') {
        throw new Error('Failed to generate secure URL');
      }
      
      // Validate URL format
      try {
        new URL(secureUrl);
      } catch {
        throw new Error('Generated URL is not valid');
      }
      
      console.log(`Generated secure URL: ${secureUrl.substring(0, 50)}...`);
    }));

    // Test 3: Check file existence (expect false for test file)
    tests.push(await this.runTest('S3 File Existence Check', async () => {
      const testKey = 'non-existent-file.mp3';
      const exists = await s3Service.checkFileExists(testKey);
      
      // We expect this to be false, but the test should not throw an error
      console.log(`File existence check for ${testKey}: ${exists}`);
    }));

    // Test 4: Get file metadata (expect null for non-existent file)
    tests.push(await this.runTest('S3 File Metadata Retrieval', async () => {
      const testKey = 'non-existent-file.mp3';
      const metadata = await s3Service.getFileMetadata(testKey);
      
      // We expect this to be null for non-existent file
      if (metadata !== null) {
        console.log(`Unexpected metadata for non-existent file: ${JSON.stringify(metadata)}`);
      }
    }));

    // Test 5: Audio URLs with fallbacks
    tests.push(await this.runTest('S3 Audio URLs with Fallbacks', async () => {
      const baseKey = 'test-track';
      
      try {
        const urls = await s3Service.getAudioUrlsWithFallbacks(baseKey);
        
        if (!urls.primary) {
          throw new Error('No primary URL generated');
        }
        
        console.log(`Generated ${urls.fallbacks.length} fallback URLs`);
      } catch (error) {
        // This is expected if no files exist, but we should handle it gracefully
        if (error instanceof Error && error.message.includes('No audio files found')) {
          console.log('No audio files found for fallback test - this is expected for empty bucket');
        } else {
          throw error;
        }
      }
    }));

    return tests;
  }

  /**
   * Test streaming platform integration
   */
  async testStreamingPlatformIntegration(): Promise<TestResult[]> {
    const tests: TestResult[] = [];

    // Test 1: Get active platforms
    tests.push(await this.runTest('Streaming Platforms - Get Active Platforms', async () => {
      const activePlatforms = streamingPlatformsService.getActivePlatforms();
      
      if (!Array.isArray(activePlatforms)) {
        throw new Error('getActivePlatforms did not return an array');
      }
      
      if (activePlatforms.length === 0) {
        throw new Error('No active platforms found');
      }
      
      console.log(`Found ${activePlatforms.length} active platforms`);
    }));

    // Test 2: URL validation
    tests.push(await this.runTest('Streaming Platforms - URL Validation', async () => {
      const testCases = [
        { platform: 'spotify' as const, url: 'https://open.spotify.com/track/test', expected: true },
        { platform: 'spotify' as const, url: 'https://invalid-domain.com/track/test', expected: false },
        { platform: 'apple-music' as const, url: 'https://music.apple.com/us/album/test', expected: true },
        { platform: 'youtube' as const, url: 'https://youtube.com/watch?v=test', expected: true },
        { platform: 'soundcloud' as const, url: 'https://soundcloud.com/artist/track', expected: true },
        { platform: 'bandcamp' as const, url: 'https://artist.bandcamp.com/track/test', expected: true },
      ];
      
      for (const testCase of testCases) {
        const isValid = streamingPlatformsService.validateUrl(testCase.platform, testCase.url);
        if (isValid !== testCase.expected) {
          throw new Error(
            `URL validation failed for ${testCase.platform}: ${testCase.url} ` +
            `(expected ${testCase.expected}, got ${isValid})`
          );
        }
      }
      
      console.log(`Validated ${testCases.length} URL test cases`);
    }));

    // Test 3: Search URL generation
    tests.push(await this.runTest('Streaming Platforms - Search URL Generation', async () => {
      const testQuery = 'Test Track Artist';
      const platforms: Array<'spotify' | 'apple-music' | 'youtube' | 'soundcloud' | 'bandcamp'> = [
        'spotify', 'apple-music', 'youtube', 'soundcloud', 'bandcamp'
      ];
      
      for (const platform of platforms) {
        const searchUrl = streamingPlatformsService.generateSearchUrl(platform, testQuery);
        
        if (!searchUrl) {
          throw new Error(`Failed to generate search URL for ${platform}`);
        }
        
        // Validate URL format
        try {
          new URL(searchUrl);
        } catch {
          throw new Error(`Invalid search URL generated for ${platform}: ${searchUrl}`);
        }
      }
      
      console.log(`Generated search URLs for ${platforms.length} platforms`);
    }));

    // Test 4: Platform suggestions
    tests.push(await this.runTest('Streaming Platforms - Genre Suggestions', async () => {
      const testGenres = ['electronic', 'ambient', 'rock', 'unknown-genre'];
      
      for (const genre of testGenres) {
        const suggestions = streamingPlatformsService.getSuggestedPlatforms(genre);
        
        if (!Array.isArray(suggestions)) {
          throw new Error(`getSuggestedPlatforms returned non-array for genre: ${genre}`);
        }
        
        if (suggestions.length === 0) {
          throw new Error(`No platform suggestions for genre: ${genre}`);
        }
      }
      
      console.log(`Generated platform suggestions for ${testGenres.length} genres`);
    }));

    return tests;
  }

  /**
   * Test error handling scenarios
   */
  async testErrorHandling(): Promise<TestResult[]> {
    const tests: TestResult[] = [];

    // Test 1: Network error simulation (invalid AWS config)
    tests.push(await this.runTest('Error Handling - Network Errors', async () => {
      // This test validates that our error handling works correctly
      // We expect certain operations to fail gracefully with proper error messages
      
      try {
        // Try to get a track with an invalid ID format
        await dynamoDBService.getTrackById('');
        console.log('Empty ID handled gracefully');
      } catch (error) {
        // This is expected - we should handle empty IDs gracefully
        if (!(error instanceof Error)) {
          throw new Error('Error handling did not return proper Error object');
        }
      }
    }));

    // Test 2: Invalid streaming platform URLs
    tests.push(await this.runTest('Error Handling - Invalid URLs', async () => {
      const invalidUrls = [
        'not-a-url',
        'http://',
        'https://invalid-domain',
        '',
      ];
      
      for (const url of invalidUrls) {
        const isValid = streamingPlatformsService.validateUrl('spotify', url);
        if (isValid) {
          throw new Error(`Invalid URL was incorrectly validated as valid: ${url}`);
        }
      }
      
      console.log(`Correctly rejected ${invalidUrls.length} invalid URLs`);
    }));

    return tests;
  }

  /**
   * Run complete integration test suite
   */
  async runCompleteTestSuite(): Promise<TestSuite> {
    const startTime = Date.now();
    const allResults: TestResult[] = [];

    console.log('🚀 Starting VoisLab Data Integration Test Suite...\n');

    // Run all test categories
    const testCategories = [
      { name: 'DynamoDB Integration', tests: () => this.testDynamoDBIntegration() },
      { name: 'S3 Integration', tests: () => this.testS3Integration() },
      { name: 'Streaming Platform Integration', tests: () => this.testStreamingPlatformIntegration() },
      { name: 'Error Handling', tests: () => this.testErrorHandling() },
    ];

    for (const category of testCategories) {
      console.log(`\n📋 Running ${category.name} tests...`);
      
      try {
        const categoryResults = await category.tests();
        allResults.push(...categoryResults);
        
        const passed = categoryResults.filter(r => r.passed).length;
        const failed = categoryResults.filter(r => !r.passed).length;
        
        console.log(`✅ ${category.name}: ${passed} passed, ${failed} failed`);
        
        // Log failed tests
        categoryResults.filter(r => !r.passed).forEach(result => {
          console.log(`   ❌ ${result.testName}: ${result.message}`);
        });
        
      } catch (error) {
        console.error(`❌ Failed to run ${category.name} tests:`, error);
        allResults.push({
          testName: `${category.name} - Suite Execution`,
          passed: false,
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const passedTests = allResults.filter(r => r.passed).length;
    const failedTests = allResults.filter(r => !r.passed).length;

    const testSuite: TestSuite = {
      suiteName: 'VoisLab Data Integration Test Suite',
      results: allResults,
      totalTests: allResults.length,
      passedTests,
      failedTests,
      totalDuration,
    };

    console.log('\n📊 Test Suite Summary:');
    console.log(`   Total Tests: ${testSuite.totalTests}`);
    console.log(`   Passed: ${testSuite.passedTests}`);
    console.log(`   Failed: ${testSuite.failedTests}`);
    console.log(`   Duration: ${testSuite.totalDuration}ms`);
    console.log(`   Success Rate: ${((testSuite.passedTests / testSuite.totalTests) * 100).toFixed(1)}%`);

    return testSuite;
  }
}

// Export singleton instance
export const integrationTester = new IntegrationTester();

// Utility function to run tests from browser console
export const runIntegrationTests = async (): Promise<TestSuite> => {
  return integrationTester.runCompleteTestSuite();
};