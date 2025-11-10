/**
 * Comprehensive Integration Test Runner
 * Run these functions in the browser console to test various aspects of the VoisLab system
 */

import { runIntegrationTests } from './utils/integration-test';
import { runE2ETests } from './utils/end-to-end-integration';
import { runDevProdValidation } from './utils/dev-prod-validation';

// Make the test functions available globally for browser console testing
(window as any).testVoisLabIntegration = runIntegrationTests;
(window as any).testVoisLabE2E = runE2ETests;
(window as any).testVoisLabDevProd = runDevProdValidation;

// Comprehensive test runner that runs all tests
(window as any).testVoisLabComplete = async () => {
  console.log('🚀 Running Complete VoisLab Test Suite...\n');

  try {
    console.log('1️⃣ Running Basic Integration Tests...');
    const basicResults = await runIntegrationTests();

    console.log('\n2️⃣ Running End-to-End Tests...');
    const e2eResults = await runE2ETests();

    console.log('\n3️⃣ Running DEV to PROD Validation...');
    const validationResults = await runDevProdValidation();

    console.log('\n🎯 Complete Test Suite Summary:');
    console.log(
      `Basic Integration: ${basicResults.passedTests}/${basicResults.totalTests} passed`
    );
    console.log(
      `End-to-End: ${e2eResults.passedTests}/${e2eResults.totalTests} passed`
    );
    console.log(
      `DEV/PROD Validation: ${validationResults.passedTests}/${validationResults.totalTests} passed`
    );

    const totalTests =
      basicResults.totalTests +
      e2eResults.totalTests +
      validationResults.totalTests;
    const totalPassed =
      basicResults.passedTests +
      e2eResults.passedTests +
      validationResults.passedTests;
    const overallSuccessRate = ((totalPassed / totalTests) * 100).toFixed(1);

    console.log(
      `\nOverall Success Rate: ${totalPassed}/${totalTests} (${overallSuccessRate}%)`
    );

    return {
      basic: basicResults,
      e2e: e2eResults,
      validation: validationResults,
      overall: {
        totalTests,
        totalPassed,
        successRate: parseFloat(overallSuccessRate),
      },
    };
  } catch (error) {
    console.error('❌ Complete test suite failed:', error);
    throw error;
  }
};

console.log('🎵 VoisLab Integration Tests Available!');
console.log('Available test functions:');
console.log('  • testVoisLabIntegration() - Basic integration tests');
console.log('  • testVoisLabE2E() - Complete end-to-end workflow tests');
console.log('  • testVoisLabDevProd() - DEV to PROD validation tests');
console.log('  • testVoisLabComplete() - Run all tests in sequence');

export { runIntegrationTests, runE2ETests, runDevProdValidation };
