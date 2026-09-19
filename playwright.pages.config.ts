import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig(config, {
  testDir: './tests/pages',
  use: { baseURL: 'http://127.0.0.1:4319/CLOUD-ROADS/' },
  webServer: {
    command: 'npm run preview -- --port 4319 --strictPort --base /CLOUD-ROADS/',
    url: 'http://127.0.0.1:4319/CLOUD-ROADS/',
    reuseExistingServer: false,
  },
});
