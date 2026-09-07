import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The stack comes from scripts/app-e2e-local.sh, which writes .e2e/app/env.json (or APP_E2E_ENV).
const envPath = process.env.APP_E2E_ENV ?? resolve(import.meta.dirname, '../.e2e/app/env.json')
let appUrl = 'http://127.0.0.1:5173'
try {
  appUrl = JSON.parse(readFileSync(envPath, 'utf8')).appUrl
} catch {
  /* the specs fail with a clear message */
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '_preview/e2e/test-results',
  use: {
    baseURL: appUrl,
    headless: true,
    viewport: { width: 1280, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
