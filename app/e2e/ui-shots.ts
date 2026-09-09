/**
 * Screenshots of every main screen state, taken against a mock-mode dev server (VITE_MOCK=1):
 *   VITE_MOCK=1 bun run dev --port 5199   (or vite directly)
 *   APP_URL=http://127.0.0.1:5199 bun run e2e/ui-shots.ts
 * Writes docs/ui/<name>.png (committed) so the product screens are reviewable without a stack.
 */
import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5199'
const OUT = resolve(import.meta.dirname, '../../docs/ui')
mkdirSync(OUT, { recursive: true })

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true })
  console.log(`shot ${name}`)
}

const card = (page: Page, heading: string) => page.locator('section.card', { has: page.locator('h2', { hasText: heading }) })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(APP_URL)
await shot(page, 'investor-01-connect')
await card(page, 'Connect wallet').getByRole('button', { name: 'Connect (mock wallet)' }).click()
await shot(page, 'investor-02-connected')
const present = card(page, 'Present your ID')
await present.getByRole('button', { name: 'Create presentation request' }).click()
await present.getByText('signed, sent to bridge').waitFor()
await shot(page, 'investor-03-presenting')
const status = card(page, 'Eligibility')
await status.locator('.status').first().filter({ hasText: 'evidence on chain, awaiting issuer approval' }).waitFor({ timeout: 30_000 })
await shot(page, 'investor-04-attested')

await page.getByRole('link', { name: 'Issuer', exact: true }).click()
await shot(page, 'issuer-01-locked')
await card(page, 'Connect operator wallet').getByRole('button', { name: 'Connect (mock wallet)' }).click()
await shot(page, 'issuer-02-queue')
const item = card(page, 'Presentations').locator('.item').first()
await item.getByRole('button', { name: 'Approve', exact: true }).click()
await item.locator('.status').filter({ hasText: 'approved' }).waitFor()
await card(page, 'Registry events').locator('.ev.approved').first().waitFor()
await shot(page, 'issuer-03-approved')

await page.getByRole('link', { name: 'Investor', exact: true }).click()
await status.locator('.status').first().filter({ hasText: 'permitted' }).waitFor()
await shot(page, 'investor-05-permitted')
const doors = card(page, 'Two doors, one decision')
await doors.getByRole('button', { name: 'Subscribe' }).click()
await doors.getByText('tx confirmed').waitFor()
await shot(page, 'investor-06-subscribed')

await page.getByRole('link', { name: 'Issuer', exact: true }).click()
await card(page, 'Decisions').getByRole('button', { name: 'Revoke' }).first().click()
await card(page, 'Registry events').locator('.ev.revoked').first().waitFor()
await shot(page, 'issuer-04-revoked')
await page.getByRole('link', { name: 'Investor', exact: true }).click()
await status.locator('.status').first().filter({ hasText: 'revoked' }).waitFor()
await shot(page, 'investor-07-revoked')

await page.setViewportSize({ width: 390, height: 844 })
await shot(page, 'investor-08-mobile')
await page.getByRole('link', { name: 'Issuer', exact: true }).click()
await shot(page, 'issuer-05-mobile')

await browser.close()
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'))
  process.exit(1)
}
