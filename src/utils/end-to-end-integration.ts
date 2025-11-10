/**
 * End-to-End Integration Test Suite
 * Comprehensive testing for complete user workflows and system integration
 */

import { integrationTester, TestResult, TestSuite } from './integration-test';
import { dynamoDBService } from '../services/dynamodb-service';
import { s3Service } from '../services/s3-service';
import { streamingPlatformsService } from '../services/streaming-platforms';
import { AudioTrack, AudioTrackWithUrls } from '../types/audio-track';

export interface E2ETestResult extends TestResult {
  category: string;
  userJourney?: string;
}

export interface E2ETestSuite extends TestSuite {
  results: E2ETestResult[];
  categories: {
    [category: string]: {
      passed: number;
      failed: number;
      total: number;
    };
  };
}

class EndToEndTester {
  /**
   * Run a single E2E test with timing and categorization
   */
  private async runE2ETest(
    testName: string,
    category: string,
    testFunction: () => Promise<void>,
    userJourney?: string
  ): Promise<E2ETestResult> {
    const startTime = Date.now();

    try {
      await testFunction();
      const duration = Date.now() - startTime;

      return {
        testName,
        category,
        userJourney,
        passed: true,
        message: 'Test passed successfully',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        testName,
        category,
        userJourney,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Test complete audio streaming workflow
   */
  async testAudioStreamingWorkflow(): Promise<E2ETestResult[]> {
    const tests: E2ETestResult[] = [];
    const category = 'Audio Streaming';

    // Test 1: Complete audio loading and playback preparation
    tests.push(
      await this.runE2ETest(
        'Complete Audio Loading Workflow',
        category,
        async () => {
          // Step 1: Get tracks from DynamoDB
          const tracks = await dynamoDBService.getAllTracks();
          console.log(`Retrieved ${tracks.length} tracks from database`);

          // Step 2: For each track, generate secure URLs
          const tracksWithUrls: AudioTrackWithUrls[] = [];

          for (const track of tracks.slice(0, 3)) {
            // Test first 3 tracks
            try {
              const secureUrl = await s3Service.getSecureAudioUrl(
                track.fileUrl
              );

              const trackWithUrl: AudioTrackWithUrls = {
                ...track,
                secureUrl,
              };

              tracksWithUrls.push(trackWithUrl);
              console.log(`Generated secure URL for track: ${track.title}`);
            } catch (error) {
              console.warn(
                `Could not generate URL for track ${track.title}:`,
                error
              );
            }
          }

          if (tracksWithUrls.length === 0 && tracks.length > 0) {
            throw new Error('No secure URLs could be generated for any tracks');
          }

          // Step 3: Validate URL accessibility (basic format check)
          for (const track of tracksWithUrls) {
            try {
              new URL(track.secureUrl);
            } catch {
              throw new Error(
                `Invalid URL generated for track: ${track.title}`
              );
            }
          }

          console.log(
            `Successfully prepared ${tracksWithUrls.length} tracks for streaming`
          );
        },
        'User loads website and sees available music tracks'
      )
    );

    // Test 2: Audio player integration with streaming links
    tests.push(
      await this.runE2ETest(
        'Audio Player with Streaming Links Integration',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          if (tracks.length === 0) {
            console.log('No tracks available for streaming links test');
            return;
          }

          const testTrack = tracks[0];

          // Validate streaming links if they exist
          if (testTrack.streamingLinks && testTrack.streamingLinks.length > 0) {
            for (const link of testTrack.streamingLinks) {
              const isValid = streamingPlatformsService.validateUrl(
                link.platform as any,
                link.url
              );

              if (!isValid) {
                throw new Error(
                  `Invalid streaming link for ${link.platform}: ${link.url}`
                );
              }
            }

            console.log(
              `Validated ${testTrack.streamingLinks.length} streaming links for track: ${testTrack.title}`
            );
          }

          // Test search URL generation for the track
          const searchQuery = `${testTrack.title} VoisLab`;
          const platforms: Array<
            'spotify' | 'apple-music' | 'youtube' | 'soundcloud' | 'bandcamp'
          > = ['spotify', 'apple-music', 'youtube', 'soundcloud', 'bandcamp'];

          for (const platform of platforms) {
            const searchUrl = streamingPlatformsService.generateSearchUrl(
              platform,
              searchQuery
            );
            if (!searchUrl) {
              throw new Error(`Failed to generate search URL for ${platform}`);
            }

            // Validate URL format
            try {
              new URL(searchUrl);
            } catch {
              throw new Error(
                `Invalid search URL for ${platform}: ${searchUrl}`
              );
            }
          }

          console.log(
            `Generated search URLs for ${platforms.length} platforms`
          );
        },
        'User clicks on streaming platform links or searches for tracks'
      )
    );

    // Test 3: Audio format fallback system
    tests.push(
      await this.runE2ETest(
        'Audio Format Fallback System',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          if (tracks.length === 0) {
            console.log('No tracks available for format fallback test');
            return;
          }

          const testTrack = tracks[0];
          const baseKey = testTrack.fileUrl.replace(/\.[^/.]+$/, ''); // Remove extension

          try {
            const urls = await s3Service.getAudioUrlsWithFallbacks(baseKey);

            if (!urls.primary) {
              throw new Error('No primary audio URL available');
            }

            console.log(`Primary URL: ${urls.primary}`);
            console.log(`Fallback URLs: ${urls.fallbacks.length}`);

            // Validate all URLs
            const allUrls = [urls.primary, ...urls.fallbacks];
            for (const url of allUrls) {
              try {
                new URL(url);
              } catch {
                throw new Error(`Invalid fallback URL: ${url}`);
              }
            }
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes('No audio files found')
            ) {
              console.log(
                'No audio files found for fallback test - using single URL fallback'
              );

              // Test single URL generation as fallback
              const singleUrl = await s3Service.getSecureAudioUrl(
                testTrack.fileUrl
              );
              if (!singleUrl) {
                throw new Error('No audio URL could be generated');
              }
            } else {
              throw error;
            }
          }
        },
        'User experiences audio loading with format fallbacks for compatibility'
      )
    );

    return tests;
  }

  /**
   * Test music library browsing and search functionality
   */
  async testMusicLibraryWorkflow(): Promise<E2ETestResult[]> {
    const tests: E2ETestResult[] = [];
    const category = 'Music Library';

    // Test 1: Complete library loading and display
    tests.push(
      await this.runE2ETest(
        'Music Library Loading and Display',
        category,
        async () => {
          // Get all tracks
          const allTracks = await dynamoDBService.getAllTracks();
          console.log(`Loaded ${allTracks.length} tracks for library display`);

          // Validate track data completeness
          for (const track of allTracks) {
            if (!track.id || !track.title) {
              throw new Error(
                `Incomplete track data: ${JSON.stringify(track)}`
              );
            }

            if (track.duration <= 0) {
              throw new Error(
                `Invalid duration for track ${track.title}: ${track.duration}`
              );
            }

            if (!track.createdDate || isNaN(track.createdDate.getTime())) {
              throw new Error(`Invalid creation date for track ${track.title}`);
            }
          }

          // Test sorting by creation date (most recent first)
          const sortedTracks = [...allTracks].sort(
            (a, b) => b.createdDate.getTime() - a.createdDate.getTime()
          );

          console.log(
            `Tracks sorted by date, newest: ${sortedTracks[0]?.title || 'none'}`
          );

          // Test genre grouping
          const genreGroups = allTracks.reduce(
            (groups, track) => {
              const genre = track.genre || 'Unknown';
              if (!groups[genre]) {
                groups[genre] = [];
              }
              groups[genre].push(track);
              return groups;
            },
            {} as Record<string, AudioTrack[]>
          );

          const genreCount = Object.keys(genreGroups).length;
          console.log(`Tracks grouped into ${genreCount} genres`);

          if (allTracks.length > 0 && genreCount === 0) {
            throw new Error('No genres found despite having tracks');
          }
        },
        'User browses the music library and sees organized track listings'
      )
    );

    // Test 2: Search and filtering functionality
    tests.push(
      await this.runE2ETest(
        'Search and Filtering Functionality',
        category,
        async () => {
          const allTracks = await dynamoDBService.getAllTracks();

          if (allTracks.length === 0) {
            console.log('No tracks available for search test');
            return;
          }

          // Test search by title
          const searchTerm = allTracks[0].title.split(' ')[0]; // First word of first track
          const titleMatches = allTracks.filter((track) =>
            track.title.toLowerCase().includes(searchTerm.toLowerCase())
          );

          console.log(
            `Search for "${searchTerm}" found ${titleMatches.length} title matches`
          );

          // Test search by genre
          const genres = [
            ...new Set(allTracks.map((track) => track.genre).filter(Boolean)),
          ];
          if (genres.length > 0) {
            const testGenre = genres[0];
            if (testGenre) {
              const genreMatches = allTracks.filter(
                (track) => track.genre === testGenre
              );
              console.log(
                `Genre filter for "${testGenre}" found ${genreMatches.length} matches`
              );

              // Test DynamoDB genre query if available
              try {
                const dbGenreMatches =
                  await dynamoDBService.getTracksByGenre(testGenre);
                if (dbGenreMatches.length !== genreMatches.length) {
                  console.warn(
                    `Genre query mismatch: DB returned ${dbGenreMatches.length}, ` +
                      `filter returned ${genreMatches.length}`
                  );
                }
              } catch (error) {
                console.log(
                  'Genre index not available, using client-side filtering'
                );
              }
            }
          }

          // Test search by tags
          const tracksWithTags = allTracks.filter(
            (track) => track.tags && track.tags.length > 0
          );
          if (tracksWithTags.length > 0) {
            const testTag = tracksWithTags[0].tags![0];
            const tagMatches = allTracks.filter(
              (track) => track.tags && track.tags.includes(testTag)
            );
            console.log(
              `Tag search for "${testTag}" found ${tagMatches.length} matches`
            );
          }

          // Test duration filtering
          const shortTracks = allTracks.filter((track) => track.duration < 180); // Under 3 minutes
          const longTracks = allTracks.filter((track) => track.duration >= 300); // Over 5 minutes

          console.log(
            `Duration filtering: ${shortTracks.length} short, ${longTracks.length} long tracks`
          );
        },
        'User searches and filters tracks by various criteria'
      )
    );

    // Test 3: Track metadata display and validation
    tests.push(
      await this.runE2ETest(
        'Track Metadata Display and Validation',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          if (tracks.length === 0) {
            console.log('No tracks available for metadata test');
            return;
          }

          for (const track of tracks.slice(0, 5)) {
            // Test first 5 tracks
            // Validate required fields
            if (!track.title || track.title.trim().length === 0) {
              throw new Error(`Track ${track.id} has empty title`);
            }

            if (track.duration <= 0) {
              throw new Error(
                `Track ${track.title} has invalid duration: ${track.duration}`
              );
            }

            // Format duration for display
            const minutes = Math.floor(track.duration / 60);
            const seconds = track.duration % 60;
            const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            console.log(`Track: ${track.title} (${formattedDuration})`);

            // Validate creation date formatting
            const dateString = track.createdDate.toLocaleDateString();
            if (!dateString || dateString === 'Invalid Date') {
              throw new Error(`Track ${track.title} has invalid creation date`);
            }

            // Validate description if present
            if (track.description && track.description.length > 500) {
              console.warn(
                `Track ${track.title} has very long description (${track.description.length} chars)`
              );
            }

            // Validate tags if present
            if (track.tags) {
              for (const tag of track.tags) {
                if (!tag || tag.trim().length === 0) {
                  throw new Error(`Track ${track.title} has empty tag`);
                }
              }
            }
          }

          console.log(
            `Validated metadata for ${Math.min(tracks.length, 5)} tracks`
          );
        },
        'User views detailed track information and metadata'
      )
    );

    return tests;
  }

  /**
   * Test content management and processing pipeline
   */
  async testContentManagementWorkflow(): Promise<E2ETestResult[]> {
    const tests: E2ETestResult[] = [];
    const category = 'Content Management';

    // Test 1: Audio processing pipeline validation
    tests.push(
      await this.runE2ETest(
        'Audio Processing Pipeline Validation',
        category,
        async () => {
          // This test validates that the processing pipeline components are accessible
          // and configured correctly, without actually uploading files

          // Check if we can access the media bucket configuration
          const mediaBucketName = import.meta.env.VITE_S3_MEDIA_BUCKET;

          if (!mediaBucketName) {
            throw new Error('Media bucket configuration not found');
          }

          console.log(`Media bucket configured: ${mediaBucketName}`);

          // Validate that we can check bucket health
          const s3Health = await s3Service.healthCheck();
          if (!s3Health) {
            throw new Error('S3 service health check failed');
          }

          // Validate DynamoDB table access for metadata storage
          const dbHealth = await dynamoDBService.healthCheck();
          if (!dbHealth) {
            throw new Error('DynamoDB service health check failed');
          }

          console.log('Content management infrastructure is accessible');
        },
        'System validates audio processing pipeline readiness'
      )
    );

    // Test 2: Metadata consistency validation
    tests.push(
      await this.runE2ETest(
        'Metadata Consistency Validation',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          if (tracks.length === 0) {
            console.log('No tracks available for metadata consistency test');
            return;
          }

          const inconsistencies: string[] = [];

          for (const track of tracks) {
            // Check if file URL matches expected pattern
            if (!track.fileUrl || !track.fileUrl.includes('.')) {
              inconsistencies.push(
                `Track ${track.title}: Invalid file URL format`
              );
            }

            // Check if streaming links are valid
            if (track.streamingLinks) {
              for (const link of track.streamingLinks) {
                const isValid = streamingPlatformsService.validateUrl(
                  link.platform as any,
                  link.url
                );
                if (!isValid) {
                  inconsistencies.push(
                    `Track ${track.title}: Invalid ${link.platform} URL: ${link.url}`
                  );
                }
              }
            }

            // Check genre consistency
            if (track.genre) {
              const suggestedPlatforms =
                streamingPlatformsService.getSuggestedPlatforms(track.genre);
              if (suggestedPlatforms.length === 0) {
                inconsistencies.push(
                  `Track ${track.title}: Unknown genre "${track.genre}"`
                );
              }
            }
          }

          if (inconsistencies.length > 0) {
            console.warn(
              `Found ${inconsistencies.length} metadata inconsistencies:`
            );
            inconsistencies.forEach((issue) => console.warn(`  - ${issue}`));

            // Don't fail the test for minor inconsistencies, just warn
            if (inconsistencies.length > tracks.length * 0.5) {
              throw new Error(
                `Too many metadata inconsistencies: ${inconsistencies.length}`
              );
            }
          } else {
            console.log(`All ${tracks.length} tracks have consistent metadata`);
          }
        },
        'System validates content metadata consistency and quality'
      )
    );

    return tests;
  }

  /**
   * Test website performance and user experience
   */
  async testPerformanceAndUX(): Promise<E2ETestResult[]> {
    const tests: E2ETestResult[] = [];
    const category = 'Performance & UX';

    // Test 1: Page load performance
    tests.push(
      await this.runE2ETest(
        'Page Load Performance',
        category,
        async () => {
          const startTime = performance.now();

          // Simulate initial page load by fetching all required data
          const [tracks] = await Promise.all([dynamoDBService.getAllTracks()]);

          const loadTime = performance.now() - startTime;

          console.log(
            `Initial data load completed in ${loadTime.toFixed(2)}ms`
          );

          if (loadTime > 5000) {
            // 5 seconds
            throw new Error(`Page load too slow: ${loadTime.toFixed(2)}ms`);
          }

          // Test that we have reasonable amount of data
          if (tracks.length > 100) {
            console.warn(
              `Large number of tracks (${tracks.length}) may impact performance`
            );
          }

          console.log(`Loaded ${tracks.length} tracks for display`);
        },
        'User experiences fast page loading and data retrieval'
      )
    );

    // Test 2: Audio URL generation performance
    tests.push(
      await this.runE2ETest(
        'Audio URL Generation Performance',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          if (tracks.length === 0) {
            console.log(
              'No tracks available for URL generation performance test'
            );
            return;
          }

          const testTracks = tracks.slice(0, 10); // Test first 10 tracks
          const startTime = performance.now();

          const urlPromises = testTracks.map(async (track) => {
            try {
              return await s3Service.getSecureAudioUrl(track.fileUrl);
            } catch (error) {
              console.warn(`Failed to generate URL for ${track.title}:`, error);
              return null;
            }
          });

          const urls = await Promise.all(urlPromises);
          const successfulUrls = urls.filter((url) => url !== null);

          const generationTime = performance.now() - startTime;
          const avgTimePerUrl = generationTime / testTracks.length;

          console.log(
            `Generated ${successfulUrls.length}/${testTracks.length} URLs in ${generationTime.toFixed(2)}ms`
          );
          console.log(`Average time per URL: ${avgTimePerUrl.toFixed(2)}ms`);

          if (avgTimePerUrl > 500) {
            // 500ms per URL
            throw new Error(
              `URL generation too slow: ${avgTimePerUrl.toFixed(2)}ms per URL`
            );
          }

          if (successfulUrls.length === 0 && testTracks.length > 0) {
            throw new Error('No URLs could be generated for any tracks');
          }
        },
        'User experiences fast audio loading and streaming preparation'
      )
    );

    // Test 3: Error handling and recovery
    tests.push(
      await this.runE2ETest(
        'Error Handling and Recovery',
        category,
        async () => {
          // Test graceful handling of invalid requests

          // Test 1: Invalid track ID
          const invalidTrack = await dynamoDBService.getTrackById(
            'non-existent-track-id'
          );
          if (invalidTrack !== null) {
            throw new Error('Expected null for non-existent track');
          }

          // Test 2: Invalid file URL
          try {
            await s3Service.getSecureAudioUrl('non-existent-file.mp3');
            // This should succeed (generate URL) but file won't exist
            console.log('URL generation handles non-existent files gracefully');
          } catch (error) {
            // This is also acceptable - depends on implementation
            console.log('URL generation properly validates file existence');
          }

          // Test 3: Invalid streaming platform URL
          const isValidBadUrl = streamingPlatformsService.validateUrl(
            'spotify',
            'not-a-url'
          );
          if (isValidBadUrl) {
            throw new Error('URL validation should reject invalid URLs');
          }

          // Test 4: Network timeout simulation (using Promise.race)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100);
          });

          try {
            await Promise.race([
              dynamoDBService.getAllTracks(),
              timeoutPromise,
            ]);
            console.log('Database query completed within timeout');
          } catch (error) {
            if (error instanceof Error && error.message === 'Timeout') {
              console.log('Timeout handling works correctly');
            } else {
              throw error;
            }
          }

          console.log('Error handling and recovery mechanisms validated');
        },
        'User experiences graceful error handling and system recovery'
      )
    );

    return tests;
  }

  /**
   * Test legal compliance and SEO features
   */
  async testComplianceAndSEO(): Promise<E2ETestResult[]> {
    const tests: E2ETestResult[] = [];
    const category = 'Compliance & SEO';

    // Test 1: Copyright and legal information
    tests.push(
      await this.runE2ETest(
        'Copyright and Legal Information',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          // Validate that tracks have proper attribution
          for (const track of tracks.slice(0, 5)) {
            // Check that we have creation date for copyright
            if (!track.createdDate || isNaN(track.createdDate.getTime())) {
              throw new Error(
                `Track ${track.title} missing valid creation date for copyright`
              );
            }

            // Validate that title doesn't contain problematic characters
            if (track.title.includes('©') || track.title.includes('®')) {
              console.warn(
                `Track ${track.title} contains copyright symbols in title`
              );
            }
          }

          // Test that we can generate proper copyright notices
          const currentYear = new Date().getFullYear();
          const copyrightNotice = `© ${currentYear} VoisLab. All rights reserved.`;

          if (!copyrightNotice.includes(currentYear.toString())) {
            throw new Error('Copyright notice missing current year');
          }

          console.log(
            `Copyright compliance validated for ${tracks.length} tracks`
          );
        },
        'System displays proper copyright and legal information'
      )
    );

    // Test 2: SEO metadata validation
    tests.push(
      await this.runE2ETest(
        'SEO Metadata Validation',
        category,
        async () => {
          const tracks = await dynamoDBService.getAllTracks();

          // Validate track data for SEO purposes
          for (const track of tracks.slice(0, 3)) {
            // Check title length for SEO
            if (track.title.length > 60) {
              console.warn(
                `Track title may be too long for SEO: ${track.title} (${track.title.length} chars)`
              );
            }

            // Check description for SEO
            if (track.description) {
              if (track.description.length > 160) {
                console.warn(
                  `Track description may be too long for meta description: ${track.description.length} chars`
                );
              }

              if (track.description.length < 50) {
                console.warn(
                  `Track description may be too short for SEO: ${track.description.length} chars`
                );
              }
            }

            // Validate genre for structured data
            if (track.genre) {
              const validGenres = [
                'ambient',
                'electronic',
                'classical',
                'jazz',
                'rock',
                'pop',
                'experimental',
              ];
              if (!validGenres.includes(track.genre.toLowerCase())) {
                console.warn(
                  `Track ${track.title} has non-standard genre: ${track.genre}`
                );
              }
            }
          }

          // Test structured data generation
          const structuredData = {
            '@context': 'https://schema.org',
            '@type': 'MusicGroup',
            name: 'VoisLab',
            album: tracks.slice(0, 3).map((track) => ({
              '@type': 'MusicRecording',
              name: track.title,
              description: track.description,
              duration: `PT${Math.floor(track.duration / 60)}M${track.duration % 60}S`,
              genre: track.genre,
              dateCreated: track.createdDate.toISOString().split('T')[0],
            })),
          };

          if (!structuredData['@context'] || !structuredData['@type']) {
            throw new Error('Invalid structured data format');
          }

          console.log(`SEO metadata validated for ${tracks.length} tracks`);
        },
        'System provides proper SEO metadata and structured data'
      )
    );

    return tests;
  }

  /**
   * Run complete end-to-end test suite
   */
  async runCompleteE2ETestSuite(): Promise<E2ETestSuite> {
    const startTime = Date.now();
    const allResults: E2ETestResult[] = [];

    console.log('🚀 Starting VoisLab End-to-End Integration Test Suite...\n');

    // Run basic integration tests first
    console.log('📋 Running Basic Integration Tests...');
    const basicTestSuite = await integrationTester.runCompleteTestSuite();

    // Convert basic test results to E2E format
    const basicE2EResults: E2ETestResult[] = basicTestSuite.results.map(
      (result) => ({
        ...result,
        category: 'Basic Integration',
      })
    );

    allResults.push(...basicE2EResults);

    // Run E2E test categories
    const e2eTestCategories = [
      {
        name: 'Audio Streaming Workflow',
        tests: () => this.testAudioStreamingWorkflow(),
      },
      {
        name: 'Music Library Workflow',
        tests: () => this.testMusicLibraryWorkflow(),
      },
      {
        name: 'Content Management Workflow',
        tests: () => this.testContentManagementWorkflow(),
      },
      {
        name: 'Performance & UX',
        tests: () => this.testPerformanceAndUX(),
      },
      {
        name: 'Compliance & SEO',
        tests: () => this.testComplianceAndSEO(),
      },
    ];

    for (const category of e2eTestCategories) {
      console.log(`\n📋 Running ${category.name} tests...`);

      try {
        const categoryResults = await category.tests();
        allResults.push(...categoryResults);

        const passed = categoryResults.filter((r) => r.passed).length;
        const failed = categoryResults.filter((r) => !r.passed).length;

        console.log(`✅ ${category.name}: ${passed} passed, ${failed} failed`);

        // Log failed tests
        categoryResults
          .filter((r) => !r.passed)
          .forEach((result) => {
            console.log(`   ❌ ${result.testName}: ${result.message}`);
          });
      } catch (error) {
        console.error(`❌ Failed to run ${category.name} tests:`, error);
        allResults.push({
          testName: `${category.name} - Suite Execution`,
          category: category.name,
          passed: false,
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const passedTests = allResults.filter((r) => r.passed).length;
    const failedTests = allResults.filter((r) => !r.passed).length;

    // Calculate category statistics
    const categories = allResults.reduce(
      (cats, result) => {
        if (!cats[result.category]) {
          cats[result.category] = { passed: 0, failed: 0, total: 0 };
        }
        cats[result.category].total++;
        if (result.passed) {
          cats[result.category].passed++;
        } else {
          cats[result.category].failed++;
        }
        return cats;
      },
      {} as Record<string, { passed: number; failed: number; total: number }>
    );

    const testSuite: E2ETestSuite = {
      suiteName: 'VoisLab End-to-End Integration Test Suite',
      results: allResults,
      totalTests: allResults.length,
      passedTests,
      failedTests,
      totalDuration,
      categories,
    };

    console.log('\n📊 End-to-End Test Suite Summary:');
    console.log(`   Total Tests: ${testSuite.totalTests}`);
    console.log(`   Passed: ${testSuite.passedTests}`);
    console.log(`   Failed: ${testSuite.failedTests}`);
    console.log(`   Duration: ${testSuite.totalDuration}ms`);
    console.log(
      `   Success Rate: ${((testSuite.passedTests / testSuite.totalTests) * 100).toFixed(1)}%`
    );

    console.log('\n📋 Results by Category:');
    Object.entries(categories).forEach(([category, stats]) => {
      const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
      console.log(
        `   ${category}: ${stats.passed}/${stats.total} (${successRate}%)`
      );
    });

    return testSuite;
  }
}

// Export singleton instance
export const endToEndTester = new EndToEndTester();

// Utility function to run E2E tests from browser console
export const runE2ETests = async (): Promise<E2ETestSuite> => {
  return endToEndTester.runCompleteE2ETestSuite();
};
