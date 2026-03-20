import { defineConfig, devices } from '@playwright/test';

/**
 * 🔐 TATAME E2E Test Configuration
 * 
 * Run with: npx playwright test
 * Debug with: npx playwright test --debug
 * UI Mode: npx playwright test --ui
 * 
 * Security Matrix: npx playwright test security-matrix
 * 
 * ENVIRONMENT VARIABLES:
 * - PLAYWRIGHT_BASE_URL: Override base URL
 * - E2E_TEST_TENANT_SLUG: Test tenant slug (default: demo-bjj)
 * - E2E_*_EMAIL / E2E_*_PASSWORD: Override test user credentials
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  // P4.3.D: Enhanced reporting
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  // Global timeout for each test
  timeout: 60 * 1000,
  
  // Expect timeout
  expect: {
    timeout: 10 * 1000,
  },
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Start each test without any stored state
    storageState: undefined,
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
    // P4.3.B: Resilience tests (no auto-retry to detect flakiness)
    {
      name: 'resilience',
      testDir: './e2e/resilience',
      use: { ...devices['Desktop Chrome'] },
      retries: 0,
    },
    // P4.3.C: Contract tests
    {
      name: 'contract',
      testDir: './e2e/contract',
      use: { ...devices['Desktop Chrome'] },
    },
    // P4.3.A: Observability UI tests
    {
      name: 'observability',
      testDir: './e2e/observability',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
