/**
 * Screenshots of the showcase demos (WP40) against a running local stack, one demo per invocation:
 *   SHOT=backoffice APP_URL=http://localhost:5279 bun run e2e/showcase-shots.ts
 * Flows (each brings the screen into its most telling state on the local stack, class L):
 *   index          the /showcase gallery route (any stack, or a VITE_MOCK=1 dev server)
 *   backoffice     scripts/showcase-backoffice-local.sh --keep: queue after approve and revoke, one policy refusal
 *   payout-desk    scripts/showcase-payout-desk-local.sh --keep plus the app with VITE_PAYOUT_DESK_URL:
 *                  runs and log after the script, one "outside the gate" refusal
 *   investor-money scripts/showcase-investor-money-local.sh --app: permitted with receipts; then after
 *                  a revoke by cast (REVOKE_CMD) the subscribe refusal
 *   savings-plan   scripts/showcase-savings-plan-local.sh --app: attest and reopen (four doors open), then revoke
 *   standing-order scripts/standing-order-local.sh --keep plus the app with VITE_AUTOMATION_URL and the dev
 *                  signer: the card with the policy and a tick; then after a revoke by cast the refused tick
 *   zkpassport     scripts/zkpassport-local.sh --keep plus the app with VITE_ZKPASSPORT=1: the card after
 *                  "Prove with the zkPassport app" (QR, waiting for the phone), else its initial state
 * Writes docs/ui/showcase-<slug>-<state>.png at 1440 px wide, full page.
 */
import { chromium, type Page } from '@playwright/test'
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const APP_URL = (process.env.APP_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '')
const SHOT = process.env.SHOT ?? 'index'
const OUT = resolve(import.meta.dirname, '../../docs/ui')
mkdirSync(OUT, { recursive: true })

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true })
  console.log(`shot ${name}`)
}
const card = (page: Page, heading: string) => page.locator('section.card', { has: page.locator('h2', { hasText: heading }) })
const run = (cmd: string) => {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: '/bin/bash' })
}
async function connectDevSigner(page: Page, heading = 'Connect wallet') {
  const c = card(page, heading)
  const btn = c.getByRole('button', { name: /dev signer|Connect \(mock wallet\)/i }).first()
  await btn.click()
  await c.locator('.connected, dl').first().waitFor({ timeout: 20_000 })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))

switch (SHOT) {
  case 'index': {
    await page.goto(`${APP_URL}/showcase`)
    await page.locator('h1', { hasText: 'Showcase' }).waitFor()
    await shot(page, 'showcase-index')
    break
  }
  case 'backoffice': {
    await page.goto(`${APP_URL}/showcase/backoffice`)
    await card(page, 'Queue').locator('table.data tbody tr').first().waitFor({ timeout: 30_000 })
    await card(page, 'Receipts').locator('.receipts, .item, li').first().waitFor({ timeout: 30_000 }).catch(() => {})
    const refusals = card(page, 'What the operator wallet cannot do')
    await refusals.getByRole('button', { name: 'Try to send 1 wei from the operator wallet' }).click()
    await refusals.locator('.note').waitFor({ timeout: 30_000 })
    await shot(page, 'showcase-backoffice-queue-refusal')
    break
  }
  case 'payout-desk': {
    await page.goto(`${APP_URL}/showcase/payout-desk`)
    await page.getByTestId('pd-contractors').locator('tbody tr').first().waitFor({ timeout: 30_000 })
    await page.getByTestId('pd-run').first().waitFor({ timeout: 30_000 })
    await page.getByTestId('pd-bypass-transfer').click()
    await page.locator('#bypass .status, #bypass .err, #bypass .refused, #bypass p.muted').first().waitFor({ timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await shot(page, 'showcase-payout-desk-runs-refusal')
    break
  }
  case 'investor-money': {
    await page.goto(`${APP_URL}/showcase/investor-money`)
    await connectDevSigner(page, 'Sign in')
    await page.getByTestId('desk-eligibility').filter({ hasText: /eligible|permitted|open/i }).waitFor({ timeout: 30_000 })
    await page.getByTestId('bal-units').filter({ hasText: /\d/ }).waitFor({ timeout: 30_000 })
    await page.getByTestId('btn-subscribe').click()
    await page.getByTestId('desk-receipts').locator('text=/confirmed|0x/').first().waitFor({ timeout: 60_000 })
    await page.waitForTimeout(2500)
    await shot(page, 'showcase-investor-money-permitted')
    if (process.env.REVOKE_CMD) {
      run(process.env.REVOKE_CMD)
      await page.getByTestId('desk-eligibility').filter({ hasText: /revoked|closed|not eligible/i }).waitFor({ timeout: 30_000 })
      await page.getByTestId('btn-subscribe').click()
      await page.locator('text=/Refused by the chain/').first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(800)
      await shot(page, 'showcase-investor-money-refused')
    }
    break
  }
  case 'savings-plan': {
    await page.goto(`${APP_URL}/showcase/savings-plan`)
    await connectDevSigner(page, 'Investor A')
    const ops = card(page, 'Revoke, reopen, expire')
    // the script leaves investor A expired: a fresh attestByOperator for A (recipient field emptied first)
    await page.getByLabel('Recipient').fill('')
    await ops.getByRole('button', { name: 'Attest Investor A' }).click()
    await page.getByTestId('door-plan').locator('.status.open').first().waitFor({ timeout: 40_000 })
    await page.getByLabel('Recipient').fill(process.env.SECOND_WALLET ?? '')
    // the automation rewrites the policy from the new decision on its next poll; then one tick subscribes
    await page.locator('#door-plan, [data-testid="door-plan"]').locator('.status.open', { hasText: 'delegated' }).waitFor({ timeout: 40_000 }).catch(() => {})
    await page.waitForTimeout(6000)
    const runsBefore = await page.getByTestId('plan-runs').locator('li').count()
    await card(page, 'One decision, four doors').getByRole('button', { name: 'Run the month' }).click()
    await page.getByTestId('plan-runs').locator('li').nth(runsBefore).waitFor({ timeout: 40_000 }).catch(() => {})
    await page.waitForTimeout(5000)
    await shot(page, 'showcase-savings-plan-open')
    await ops.getByRole('button', { name: 'Revoke Investor A' }).click()
    await page.getByTestId('door-plan').locator('.status.closed').first().waitFor({ timeout: 40_000 })
    await page.waitForTimeout(5000)
    await shot(page, 'showcase-savings-plan-revoked')
    break
  }
  case 'standing-order': {
    await page.goto(`${APP_URL}/`)
    await connectDevSigner(page)
    const so = page.locator('#standing-order')
    await so.locator('dl.connected').waitFor({ timeout: 30_000 })
    await so.getByRole('button', { name: 'Run the month' }).click()
    await page.getByTestId('tick-results').locator('li').first().waitFor({ timeout: 40_000 })
    await page.waitForTimeout(1000)
    await so.scrollIntoViewIfNeeded()
    await shot(page, 'showcase-standing-order-subscribed')
    if (process.env.REVOKE_CMD) {
      run(process.env.REVOKE_CMD)
      await so.locator('ol.rules li.deny').nth(1).waitFor({ timeout: 40_000 }).catch(() => {})
      await page.waitForTimeout(2500)
      await so.getByRole('button', { name: 'Run the month' }).click()
      await page.getByTestId('tick-results').locator('.status.closed').first().waitFor({ timeout: 40_000 })
      await page.waitForTimeout(1000)
      await shot(page, 'showcase-standing-order-refused')
    }
    break
  }
  case 'standing-order-issuer': {
    // the issuer console's automation log (local mode); TICK_CMD and REVOKE_CMD drive one subscribed and one refused tick
    if (process.env.TICK_CMD) run(process.env.TICK_CMD)
    if (process.env.REVOKE_CMD) {
      run(process.env.REVOKE_CMD)
      await page.waitForTimeout(3000)
      if (process.env.TICK_CMD) run(process.env.TICK_CMD)
    }
    await page.goto(`${APP_URL}/issuer`)
    await connectDevSigner(page, 'Connect operator wallet')
    const log = page.locator('#automation')
    await log.locator('text=/TICK|policy|POLICY/i').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(2500)
    await shot(page, 'showcase-standing-order-issuer-log')
    break
  }
  case 'zkpassport': {
    await page.goto(`${APP_URL}/`)
    await connectDevSigner(page)
    const zk = page.locator('#zkpassport')
    await zk.scrollIntoViewIfNeeded()
    const btn = zk.getByRole('button', { name: 'Prove with the zkPassport app' })
    if (await btn.isEnabled()) {
      await btn.click()
      const ok = await zk
        .locator('.qr img')
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false)
      console.log(ok ? 'QR shown' : 'no QR (request failed or offline); initial state instead')
    }
    await page.waitForTimeout(800)
    await shot(page, 'showcase-zkpassport-card')
    break
  }
  default:
    throw new Error(`unknown SHOT ${SHOT}`)
}

await browser.close()
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'))
  process.exit(1)
}
