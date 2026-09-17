import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4318',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : ['--enable-webgl'] },
  },
  webServer: {
    command: 'npm run preview -- --port 4318 --strictPort',
    url: 'http://127.0.0.1:4318',
    reuseExistingServer: false,
  },
});
