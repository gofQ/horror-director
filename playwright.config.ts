import { defineConfig } from '@playwright/test'

const port = 4173

/**
 * E2E runs against the production build served by `vite preview`.
 * In environments with a pre-installed Chromium (e.g. Cloud Sessions) set
 *   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium
 * to skip the Playwright browser download; otherwise run `npx playwright install chromium` once.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'en-US',
    viewport: { width: 1400, height: 900 },
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
