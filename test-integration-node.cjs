#!/usr/bin/env node

/**
 * Node.js Integration Test Runner
 * Tests the VoisLab integration without requiring a browser
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000, // 30 seconds
  verbose: process.env.VERBOSE === 'true',
  environment: process.env.ENVIRONMENT || 'dev'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Test functions
async function testFileStructure() {
  logInfo('Testing file structure...');
  
  const requiredFiles = [
    'src/App.tsx',
    'src/main.tsx',
    'src/services/dynamodb-service.ts',
    'src/services/s3-service.ts',
    'src/services/streaming-platforms.ts',
    'src/utils/integration-test.ts',
    'src/utils/end-to-end-integration.ts',
    'src/utils/dev-prod-validation.ts',
    'src/test-integration.ts',
    'package.json',
    'vite.config.ts',
    'tsconfig.json'
  ];

  const missingFiles = [];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    logError(`Missing required files: ${missingFiles.join(', ')}`);
    return false;
  }

  logSuccess('All required files present');
  return true;
}

async function testPackageJson() {
  logInfo('Testing package.json configuration...');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Check required dependencies
    const requiredDeps = [
      'react',
      'react-dom',
      'react-router-dom',
      '@aws-sdk/client-dynamodb',
      '@aws-sdk/client-s3',
      '@aws-sdk/util-dynamodb'
    ];

    const missingDeps = [];
    
    for (const dep of requiredDeps) {
      if (!packageJson.dependencies || !packageJson.dependencies[dep]) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      logError(`Missing required dependencies: ${missingDeps.join(', ')}`);
      return false;
    }

    // Check required scripts
    const requiredScripts = ['dev', 'build', 'lint'];
    const missingScripts = [];
    
    for (const script of requiredScripts) {
      if (!packageJson.scripts || !packageJson.scripts[script]) {
        missingScripts.push(script);
      }
    }

    if (missingScripts.length > 0) {
      logError(`Missing required scripts: ${missingScripts.join(', ')}`);
      return false;
    }

    logSuccess('Package.json configuration valid');
    return true;
  } catch (error) {
    logError(`Failed to parse package.json: ${error.message}`);
    return false;
  }
}

async function testBuildOutput() {
  logInfo('Testing build output...');
  
  if (!fs.existsSync('dist')) {
    logError('Build output directory "dist" not found. Run "npm run build" first.');
    return false;
  }

  const requiredBuildFiles = [
    'dist/index.html',
    'dist/assets'
  ];

  const missingBuildFiles = [];
  
  for (const file of requiredBuildFiles) {
    if (!fs.existsSync(file)) {
      missingBuildFiles.push(file);
    }
  }

  if (missingBuildFiles.length > 0) {
    logError(`Missing build files: ${missingBuildFiles.join(', ')}`);
    return false;
  }

  // Check index.html content
  const indexHtml = fs.readFileSync('dist/index.html', 'utf8');
  
  if (!indexHtml.includes('VoisLab')) {
    logWarning('index.html may not contain VoisLab branding');
  }

  if (!indexHtml.includes('<script')) {
    logError('index.html missing JavaScript includes');
    return false;
  }

  logSuccess('Build output validation passed');
  return true;
}

async function testTypeScriptConfiguration() {
  logInfo('Testing TypeScript configuration...');
  
  try {
    // Read and strip comments from tsconfig.json (JSONC format)
    let tsConfigContent = fs.readFileSync('tsconfig.json', 'utf8');
    
    // Remove single-line comments
    tsConfigContent = tsConfigContent.replace(/\/\*[\s\S]*?\*\//g, '');
    tsConfigContent = tsConfigContent.replace(/\/\/.*$/gm, '');
    
    const tsConfig = JSON.parse(tsConfigContent);
    
    // Check for required compiler options
    const requiredOptions = {
      'target': 'ES2020',
      'lib': ['ES2020', 'DOM', 'DOM.Iterable'],
      'module': 'ESNext',
      'skipLibCheck': true,
      'moduleResolution': 'bundler',
      'allowImportingTsExtensions': true,
      'resolveJsonModule': true,
      'isolatedModules': true,
      'noEmit': true,
      'jsx': 'react-jsx',
      'strict': true
    };

    const compilerOptions = tsConfig.compilerOptions || {};
    const missingOptions = [];
    
    for (const [option, expectedValue] of Object.entries(requiredOptions)) {
      if (compilerOptions[option] !== expectedValue) {
        missingOptions.push(`${option}: ${expectedValue}`);
      }
    }

    if (missingOptions.length > 0) {
      logWarning(`TypeScript config differences: ${missingOptions.join(', ')}`);
    }

    logSuccess('TypeScript configuration valid');
    return true;
  } catch (error) {
    logError(`Failed to parse tsconfig.json: ${error.message}`);
    return false;
  }
}

async function testEnvironmentVariables() {
  logInfo('Testing environment variables...');
  
  // Check for .env files
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
  const foundEnvFiles = envFiles.filter(file => fs.existsSync(file));
  
  if (foundEnvFiles.length === 0) {
    logWarning('No environment files found. Some features may not work.');
  } else {
    logInfo(`Found environment files: ${foundEnvFiles.join(', ')}`);
  }

  // Check for required environment variable patterns in source code
  const envVarPatterns = [
    'VITE_AWS_REGION',
    'VITE_DYNAMODB_TABLE_NAME',
    'VITE_S3_MEDIA_BUCKET'
  ];

  const awsConfigFile = 'src/services/aws-config.ts';
  
  if (fs.existsSync(awsConfigFile)) {
    const awsConfigContent = fs.readFileSync(awsConfigFile, 'utf8');
    
    const missingPatterns = [];
    for (const pattern of envVarPatterns) {
      if (!awsConfigContent.includes(pattern)) {
        missingPatterns.push(pattern);
      }
    }

    if (missingPatterns.length > 0) {
      logWarning(`Environment variables not referenced: ${missingPatterns.join(', ')}`);
    } else {
      logSuccess('Environment variable configuration valid');
    }
  } else {
    logError('AWS configuration file not found');
    return false;
  }

  return true;
}

async function testIntegrationTestFiles() {
  logInfo('Testing integration test files...');
  
  const testFiles = [
    'src/utils/integration-test.ts',
    'src/utils/end-to-end-integration.ts',
    'src/utils/dev-prod-validation.ts',
    'src/test-integration.ts'
  ];

  for (const testFile of testFiles) {
    if (!fs.existsSync(testFile)) {
      logError(`Integration test file missing: ${testFile}`);
      return false;
    }

    const content = fs.readFileSync(testFile, 'utf8');
    
    // Basic validation of test file content
    if (!content.includes('export')) {
      logError(`Test file ${testFile} missing exports`);
      return false;
    }

    if (testFile.includes('integration-test.ts') && !content.includes('TestResult')) {
      logError(`Test file ${testFile} missing TestResult interface`);
      return false;
    }
  }

  logSuccess('Integration test files validation passed');
  return true;
}

async function testDocumentation() {
  logInfo('Testing documentation...');
  
  const docFiles = [
    'docs/INTEGRATION_TESTING.md',
    'README.md'
  ];

  const missingDocs = [];
  
  for (const docFile of docFiles) {
    if (!fs.existsSync(docFile)) {
      missingDocs.push(docFile);
    }
  }

  if (missingDocs.length > 0) {
    logWarning(`Missing documentation files: ${missingDocs.join(', ')}`);
  } else {
    logSuccess('Documentation files present');
  }

  // Check integration testing documentation
  if (fs.existsSync('docs/INTEGRATION_TESTING.md')) {
    const content = fs.readFileSync('docs/INTEGRATION_TESTING.md', 'utf8');
    
    const requiredSections = [
      'Overview',
      'Running Tests',
      'Test Categories',
      'DEV to PROD Validation'
    ];

    const missingSections = [];
    
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      logWarning(`Integration testing doc missing sections: ${missingSections.join(', ')}`);
    } else {
      logSuccess('Integration testing documentation complete');
    }
  }

  return true;
}

async function testScripts() {
  logInfo('Testing validation scripts...');
  
  const scriptFiles = [
    'scripts/validate-integration.sh'
  ];

  for (const scriptFile of scriptFiles) {
    if (!fs.existsSync(scriptFile)) {
      logError(`Script file missing: ${scriptFile}`);
      return false;
    }

    // Check if script is executable
    try {
      const stats = fs.statSync(scriptFile);
      const isExecutable = !!(stats.mode & parseInt('111', 8));
      
      if (!isExecutable) {
        logWarning(`Script ${scriptFile} is not executable`);
      } else {
        logSuccess(`Script ${scriptFile} is executable`);
      }
    } catch (error) {
      logError(`Failed to check script permissions: ${error.message}`);
      return false;
    }
  }

  return true;
}

// Main test runner
async function runTests() {
  log('🚀 VoisLab Node.js Integration Test Runner', 'cyan');
  log(`Environment: ${TEST_CONFIG.environment}`, 'blue');
  log(`Timeout: ${TEST_CONFIG.timeout}ms`, 'blue');
  log('', 'reset');

  const tests = [
    { name: 'File Structure', fn: testFileStructure },
    { name: 'Package.json Configuration', fn: testPackageJson },
    { name: 'Build Output', fn: testBuildOutput },
    { name: 'TypeScript Configuration', fn: testTypeScriptConfiguration },
    { name: 'Environment Variables', fn: testEnvironmentVariables },
    { name: 'Integration Test Files', fn: testIntegrationTestFiles },
    { name: 'Documentation', fn: testDocumentation },
    { name: 'Scripts', fn: testScripts }
  ];

  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const test of tests) {
    try {
      log(`\n📋 Running ${test.name}...`, 'blue');
      
      const result = await Promise.race([
        test.fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout)
        )
      ]);

      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      logError(`${test.name} failed: ${error.message}`);
      failed++;
    }
  }

  const duration = Date.now() - startTime;
  const total = passed + failed;
  const successRate = ((passed / total) * 100).toFixed(1);

  log('\n📊 Test Summary:', 'cyan');
  log(`Total Tests: ${total}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'blue');
  log(`Duration: ${duration}ms`, 'blue');
  log(`Success Rate: ${successRate}%`, successRate >= 90 ? 'green' : successRate >= 75 ? 'yellow' : 'red');

  if (successRate >= 90) {
    log('\n✅ RESULT: Integration setup is excellent!', 'green');
  } else if (successRate >= 75) {
    log('\n⚠️  RESULT: Integration setup is good with minor issues', 'yellow');
  } else {
    log('\n❌ RESULT: Integration setup has significant issues', 'red');
  }

  log('\nNext steps:', 'cyan');
  log('1. Start development server: npm run dev', 'blue');
  log('2. Open browser and run: testVoisLabComplete()', 'blue');
  log('3. Run validation script: ./scripts/validate-integration.sh', 'blue');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    logError(`Test runner failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runTests };