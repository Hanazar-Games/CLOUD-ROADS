import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig(config, {
  testDir: './tests/pages',
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4319/CLOUD-ROADS/',
    viewport: { width: 640, height: 360 },
  },
  webServer: {
    command: 'npm run preview -- --port 4319 --strictPort --base /CLOUD-ROADS/',
    url: 'http://127.0.0.1:4319/CLOUD-ROADS/',
    reuseExistingServer: false,
  },
});
