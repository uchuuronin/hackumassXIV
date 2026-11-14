import { defineConfig } from '@playwright/test';

// Uses the Chrome already installed on the laptop. Run with:  npm test
// To point at a different browser:  STEADY_CHROME=/path/to/chrome npm test
const custom = process.env.STEADY_CHROME;

export default defineConfig({
  testDir: 'tests',
  globalSetup: './tests/setup.ts',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 20_000,
  webServer: {
    command: 'node sites/serve.mjs',
    url: 'http://localhost:4173/shop/',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1180, height: 820 },
    channel: custom ? undefined : 'chrome',
    launchOptions: custom ? { executablePath: custom, args: ['--no-sandbox'] } : {},
  },
});
