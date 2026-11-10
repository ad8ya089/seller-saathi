import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './.tmp/p4/playwright-results',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4200',
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/start.mjs',
    url: 'http://127.0.0.1:4200/api/health',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: '4200',
      HOSTNAME: '127.0.0.1',
      GEMINI_API_KEY: '',
      SARVAM_API_KEY: '',
      LOG_LEVEL: 'silent',
      DATA_DIR: resolve('.tmp/p4/browser-data'),
    },
  },
});
