/**
 * Simple Integration Test Runner
 * Run this in the browser console to test data integration functionality
 */

import { runIntegrationTests } from './utils/integration-test';

// Make the test function available globally for browser console testing
(window as any).testVoisLabIntegration = runIntegrationTests;

console.log('🎵 VoisLab Integration Test Available!');
console.log('Run testVoisLabIntegration() in the browser console to test data integration.');

export { runIntegrationTests };