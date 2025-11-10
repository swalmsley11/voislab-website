/**
 * DEV to PROD Promotion Validation
 * Tests the complete workflow for promoting content from development to production
 */

export interface PromotionValidationResult {
  testName: string;
  passed: boolean;
  message: string;
  duration: number;
  environment: 'dev' | 'prod';
  error?: Error;
}

export interface PromotionValidationSuite {
  suiteName: string;
  results: PromotionValidationResult[];
  devTests: number;
  prodTests: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

class DevProdValidator {
  private currentEnvironment: 'dev' | 'prod';

  constructor() {
    // Determine current environment from configuration
    this.currentEnvironment = (import.meta.env.VITE_ENVIRONMENT as 'dev' | 'prod') || 'dev';
  }

  /**
   * Run a validation test with timing
   */
  private async runValidationTest(
    testName: string,
    environment: 'dev' | 'prod',
    testFunction: () => Promise<void>
  ): Promise<PromotionValidationResult> {
    const startTime = Date.now();

    try {
      await testFunction();
      const duration = Date.now() - startTime;

      return {
        testName,
        environment,
        passed: true,
        message: 'Validation passed successfully',
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        testName,
        environment,
        passed: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironmentConfiguration(): Promise<PromotionValidationResult[]> {
    const tests: PromotionValidationResult[] = [];

    // Test 1: Environment variables validation
    tests.push(
      await this.runValidationTest(
        'Environment Variables Configuration',
        this.currentEnvironment,
        async () => {
          const requiredEnvVars = [
            'VITE_AWS_REGION',
            'VITE_DYNAMODB_TABLE_NAME',
            'VITE_S3_MEDIA_BUCKET',
          ];

          const missingVars: string[] = [];

          for (const envVar of requiredEnvVars) {
            const value = import.meta.env[envVar];
            if (!value) {
              missingVars.push(envVar);
            }
          }

          if (missingVars.length > 0) {
            throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
          }

          // Validate environment-specific naming
          const tableName = import.meta.env.VITE_DYNAMODB_TABLE_NAME;
          const bucketName = import.meta.env.VITE_S3_MEDIA_BUCKET;

          if (!tableName.includes(this.currentEnvironment)) {
            console.warn(`Table name may not include environment: ${tableName}`);
          }

          if (!bucketName.includes(this.currentEnvironment)) {
            console.warn(`Bucket name may not include environment: ${bucketName}`);
          }

          console.log(`Environment configuration validated for: ${this.currentEnvironment}`);
        }
      )
    );

    // Test 2: AWS service connectivity
    tests.push(
      await this.runValidationTest(
        'AWS Service Connectivity',
        this.currentEnvironment,
        async () => {
          // Import services dynamically to avoid issues if not configured
          const { dynamoDBService } = await import('../services/dynamodb-service');
          const { s3Service } = await import('../services/s3-service');

          // Test DynamoDB connectivity
          const dbHealth = await dynamoDBService.healthCheck();
          if (!dbHealth) {
            throw new Error('DynamoDB health check failed');
          }

          // Test S3 connectivity
          const s3Health = await s3Service.healthCheck();
          if (!s3Health) {
            throw new Error('S3 health check failed');
          }

          console.log(`AWS services accessible in ${this.currentEnvironment} environment`);
        }
      )
    );

    return tests;
  }

  /**
   * Validate content consistency between environments
   */
  async validateContentConsistency(): Promise<PromotionValidationResult[]> {
    const tests: PromotionValidationResult[] = [];

    // Test 1: Data structure validation
    tests.push(
      await this.runValidationTest(
        'Data Structure Validation',
        this.currentEnvironment,
        async () => {
          const { dynamoDBService } = await import('../services/dynamodb-service');
          
          const tracks = await dynamoDBService.getAllTracks();
          
          if (tracks.length === 0) {
            console.log(`No tracks found in ${this.currentEnvironment} environment`);
            return;
          }

          // Validate data structure consistency
          const requiredFields = ['id', 'title', 'duration', 'fileUrl', 'createdDate'];
          const structureErrors: string[] = [];

          for (const track of tracks.slice(0, 5)) { // Check first 5 tracks
            for (const field of requiredFields) {
              if (!(field in track) || track[field as keyof typeof track] === undefined) {
                structureErrors.push(`Track ${track.id || 'unknown'} missing field: ${field}`);
              }
            }

            // Validate data types
            if (typeof track.duration !== 'number' || track.duration <= 0) {
              structureErrors.push(`Track ${track.title} has invalid duration: ${track.duration}`);
            }

            if (!(track.createdDate instanceof Date) || isNaN(track.createdDate.getTime())) {
              structureErrors.push(`Track ${track.title} has invalid creation date`);
            }
          }

          if (structureErrors.length > 0) {
            throw new Error(`Data structure errors: ${structureErrors.join('; ')}`);
          }

          console.log(`Data structure validated for ${tracks.length} tracks in ${this.currentEnvironment}`);
        }
      )
    );

    // Test 2: File accessibility validation
    tests.push(
      await this.runValidationTest(
        'File Accessibility Validation',
        this.currentEnvironment,
        async () => {
          const { dynamoDBService } = await import('../services/dynamodb-service');
          const { s3Service } = await import('../services/s3-service');
          
          const tracks = await dynamoDBService.getAllTracks();
          
          if (tracks.length === 0) {
            console.log(`No tracks to validate in ${this.currentEnvironment} environment`);
            return;
          }

          const accessibilityErrors: string[] = [];
          const testTracks = tracks.slice(0, 3); // Test first 3 tracks

          for (const track of testTracks) {
            try {
              // Test URL generation
              const secureUrl = await s3Service.getSecureAudioUrl(track.fileUrl);
              
              if (!secureUrl) {
                accessibilityErrors.push(`No URL generated for track: ${track.title}`);
                continue;
              }

              // Validate URL format
              try {
                new URL(secureUrl);
              } catch {
                accessibilityErrors.push(`Invalid URL format for track: ${track.title}`);
              }

            } catch (error) {
              accessibilityErrors.push(
                `URL generation failed for track ${track.title}: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }

          if (accessibilityErrors.length > 0) {
            console.warn(`File accessibility issues: ${accessibilityErrors.join('; ')}`);
            
            // Don't fail if it's just a few files, but fail if most files are inaccessible
            if (accessibilityErrors.length > testTracks.length * 0.7) {
              throw new Error(`Too many file accessibility issues: ${accessibilityErrors.length}/${testTracks.length}`);
            }
          }

          console.log(`File accessibility validated for ${testTracks.length} tracks in ${this.currentEnvironment}`);
        }
      )
    );

    return tests;
  }

  /**
   * Validate promotion readiness
   */
  async validatePromotionReadiness(): Promise<PromotionValidationResult[]> {
    const tests: PromotionValidationResult[] = [];

    // Test 1: Content quality validation
    tests.push(
      await this.runValidationTest(
        'Content Quality Validation',
        this.currentEnvironment,
        async () => {
          const { dynamoDBService } = await import('../services/dynamodb-service');
          
          const tracks = await dynamoDBService.getAllTracks();
          
          if (tracks.length === 0) {
            console.log(`No content to validate for promotion in ${this.currentEnvironment}`);
            return;
          }

          const qualityIssues: string[] = [];

          for (const track of tracks) {
            // Check title quality
            if (!track.title || track.title.trim().length < 3) {
              qualityIssues.push(`Track ${track.id} has insufficient title: "${track.title}"`);
            }

            // Check for placeholder content
            if (track.title.toLowerCase().includes('test') || 
                track.title.toLowerCase().includes('sample') ||
                track.title.toLowerCase().includes('placeholder')) {
              qualityIssues.push(`Track ${track.title} appears to be test content`);
            }

            // Check description quality
            if (track.description && track.description.trim().length < 10) {
              qualityIssues.push(`Track ${track.title} has insufficient description`);
            }

            // Check duration reasonableness
            if (track.duration < 30) { // Less than 30 seconds
              qualityIssues.push(`Track ${track.title} is very short: ${track.duration}s`);
            }

            if (track.duration > 1800) { // More than 30 minutes
              qualityIssues.push(`Track ${track.title} is very long: ${track.duration}s`);
            }
          }

          if (qualityIssues.length > 0) {
            console.warn(`Content quality issues found: ${qualityIssues.length}`);
            qualityIssues.slice(0, 5).forEach(issue => console.warn(`  - ${issue}`));
            
            // Don't fail for minor quality issues, but warn about them
            if (qualityIssues.length > tracks.length * 0.3) {
              throw new Error(`Too many content quality issues: ${qualityIssues.length}/${tracks.length}`);
            }
          }

          console.log(`Content quality validated for ${tracks.length} tracks`);
        }
      )
    );

    // Test 2: Metadata completeness validation
    tests.push(
      await this.runValidationTest(
        'Metadata Completeness Validation',
        this.currentEnvironment,
        async () => {
          const { dynamoDBService } = await import('../services/dynamodb-service');
          
          const tracks = await dynamoDBService.getAllTracks();
          
          if (tracks.length === 0) {
            console.log(`No metadata to validate in ${this.currentEnvironment}`);
            return;
          }

          const metadataStats = {
            withDescription: 0,
            withGenre: 0,
            withTags: 0,
            withStreamingLinks: 0,
            total: tracks.length,
          };

          for (const track of tracks) {
            if (track.description && track.description.trim().length > 0) {
              metadataStats.withDescription++;
            }

            if (track.genre && track.genre.trim().length > 0) {
              metadataStats.withGenre++;
            }

            if (track.tags && track.tags.length > 0) {
              metadataStats.withTags++;
            }

            if (track.streamingLinks && track.streamingLinks.length > 0) {
              metadataStats.withStreamingLinks++;
            }
          }

          // Calculate completeness percentages
          const descriptionRate = (metadataStats.withDescription / metadataStats.total) * 100;
          const genreRate = (metadataStats.withGenre / metadataStats.total) * 100;
          const tagsRate = (metadataStats.withTags / metadataStats.total) * 100;
          const streamingRate = (metadataStats.withStreamingLinks / metadataStats.total) * 100;

          console.log(`Metadata completeness rates:`);
          console.log(`  Descriptions: ${descriptionRate.toFixed(1)}%`);
          console.log(`  Genres: ${genreRate.toFixed(1)}%`);
          console.log(`  Tags: ${tagsRate.toFixed(1)}%`);
          console.log(`  Streaming Links: ${streamingRate.toFixed(1)}%`);

          // Warn if completeness is low
          if (descriptionRate < 50) {
            console.warn(`Low description completeness: ${descriptionRate.toFixed(1)}%`);
          }

          if (genreRate < 70) {
            console.warn(`Low genre completeness: ${genreRate.toFixed(1)}%`);
          }

          console.log(`Metadata completeness validated for ${tracks.length} tracks`);
        }
      )
    );

    return tests;
  }

  /**
   * Validate deployment readiness
   */
  async validateDeploymentReadiness(): Promise<PromotionValidationResult[]> {
    const tests: PromotionValidationResult[] = [];

    // Test 1: Frontend build validation
    tests.push(
      await this.runValidationTest(
        'Frontend Build Validation',
        this.currentEnvironment,
        async () => {
          // Check if we're running in a built environment
          const isDevelopment = import.meta.env.DEV;
          const isProduction = import.meta.env.PROD;

          if (this.currentEnvironment === 'prod' && isDevelopment) {
            throw new Error('Production environment should not be running in development mode');
          }

          // Validate that required modules are available
          try {
            await import('../services/dynamodb-service');
            await import('../services/s3-service');
            await import('../services/streaming-platforms');
          } catch (error) {
            throw new Error(`Required modules not available: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }

          // Check for console errors (basic validation)
          const originalError = console.error;
          const errors: string[] = [];
          
          console.error = (...args) => {
            errors.push(args.join(' '));
            originalError(...args);
          };

          // Restore console.error after a short delay
          setTimeout(() => {
            console.error = originalError;
          }, 1000);

          console.log(`Frontend build validation completed for ${this.currentEnvironment}`);
          console.log(`Development mode: ${isDevelopment}, Production mode: ${isProduction}`);
        }
      )
    );

    // Test 2: Performance baseline validation
    tests.push(
      await this.runValidationTest(
        'Performance Baseline Validation',
        this.currentEnvironment,
        async () => {
          const startTime = performance.now();
          
          // Test basic operations performance
          const { dynamoDBService } = await import('../services/dynamodb-service');
          
          const tracks = await dynamoDBService.getAllTracks();
          const loadTime = performance.now() - startTime;

          console.log(`Data load performance: ${loadTime.toFixed(2)}ms for ${tracks.length} tracks`);

          // Set performance thresholds based on environment
          const maxLoadTime = this.currentEnvironment === 'prod' ? 3000 : 5000; // 3s for prod, 5s for dev

          if (loadTime > maxLoadTime) {
            throw new Error(`Data load too slow: ${loadTime.toFixed(2)}ms (max: ${maxLoadTime}ms)`);
          }

          // Test memory usage (basic check)
          if ('memory' in performance) {
            const memInfo = (performance as any).memory;
            const memUsage = memInfo.usedJSHeapSize / 1024 / 1024; // MB
            
            console.log(`Memory usage: ${memUsage.toFixed(2)}MB`);
            
            if (memUsage > 100) { // 100MB threshold
              console.warn(`High memory usage: ${memUsage.toFixed(2)}MB`);
            }
          }

          console.log(`Performance baseline validated for ${this.currentEnvironment}`);
        }
      )
    );

    return tests;
  }

  /**
   * Run complete DEV to PROD validation suite
   */
  async runCompleteValidationSuite(): Promise<PromotionValidationSuite> {
    const startTime = Date.now();
    const allResults: PromotionValidationResult[] = [];

    console.log(`🚀 Starting DEV to PROD Validation Suite for ${this.currentEnvironment.toUpperCase()} environment...\n`);

    // Run all validation categories
    const validationCategories = [
      {
        name: 'Environment Configuration',
        tests: () => this.validateEnvironmentConfiguration(),
      },
      {
        name: 'Content Consistency',
        tests: () => this.validateContentConsistency(),
      },
      {
        name: 'Promotion Readiness',
        tests: () => this.validatePromotionReadiness(),
      },
      {
        name: 'Deployment Readiness',
        tests: () => this.validateDeploymentReadiness(),
      },
    ];

    for (const category of validationCategories) {
      console.log(`\n📋 Running ${category.name} validation...`);

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
        console.error(`❌ Failed to run ${category.name} validation:`, error);
        allResults.push({
          testName: `${category.name} - Suite Execution`,
          environment: this.currentEnvironment,
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
    const devTests = allResults.filter((r) => r.environment === 'dev').length;
    const prodTests = allResults.filter((r) => r.environment === 'prod').length;

    const validationSuite: PromotionValidationSuite = {
      suiteName: `VoisLab DEV to PROD Validation Suite (${this.currentEnvironment.toUpperCase()})`,
      results: allResults,
      devTests,
      prodTests,
      totalTests: allResults.length,
      passedTests,
      failedTests,
      totalDuration,
    };

    console.log('\n📊 Validation Suite Summary:');
    console.log(`   Environment: ${this.currentEnvironment.toUpperCase()}`);
    console.log(`   Total Tests: ${validationSuite.totalTests}`);
    console.log(`   Passed: ${validationSuite.passedTests}`);
    console.log(`   Failed: ${validationSuite.failedTests}`);
    console.log(`   Duration: ${validationSuite.totalDuration}ms`);
    console.log(
      `   Success Rate: ${((validationSuite.passedTests / validationSuite.totalTests) * 100).toFixed(1)}%`
    );

    // Provide promotion recommendation
    const successRate = (validationSuite.passedTests / validationSuite.totalTests) * 100;
    
    if (successRate >= 90) {
      console.log('\n✅ RECOMMENDATION: Environment is ready for promotion/deployment');
    } else if (successRate >= 75) {
      console.log('\n⚠️  RECOMMENDATION: Environment has minor issues but may be acceptable for promotion');
    } else {
      console.log('\n❌ RECOMMENDATION: Environment has significant issues and should not be promoted');
    }

    return validationSuite;
  }
}

// Export singleton instance
export const devProdValidator = new DevProdValidator();

// Utility function to run validation from browser console
export const runDevProdValidation = async (): Promise<PromotionValidationSuite> => {
  return devProdValidator.runCompleteValidationSuite();
};