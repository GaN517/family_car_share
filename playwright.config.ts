import fs from 'fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * E2E テスト（Firebase エミュレータ + 本番ビルドの Next.js を実ブラウザで操作）
 * 実行: npm run test:e2e
 */
const PORT = 3100;
const PROJECT_ID = 'demo-fcs';
const preinstalledChromium = '/opt/pw-browsers/chromium';

export const E2E_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: 'demo-app',
  NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  CRON_SECRET: 'e2e-cron-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'e2e-dummy-token',
  LINE_CHANNEL_SECRET: 'e2e-dummy-secret',
  APP_URL: `http://127.0.0.1:${PORT}`,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        launchOptions: fs.existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {},
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: E2E_ENV,
  },
});
