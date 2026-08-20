import { defineConfig, devices } from '@playwright/test';

// Real-browser (headless Chromium) end-to-end tests, distinct from Vitest's
// jsdom-based unit/component tests (vitest.config.ts). Runs against a
// `vite preview` build of the actual app - use this suite (not jsdom) to
// verify UI changes when a manual browser check isn't available; see
// CLAUDE.md's "UI or frontend changes" guidance.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
