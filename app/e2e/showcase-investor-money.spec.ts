/**
 * Browser run of the fund desk (showcase, investor money; scripts/showcase-investor-money-local.sh --test):
 * a fresh investor with the dev signer clicks the beats on /showcase/investor-money, the operator pays the
 * distribution on /issuer, and the operator's registry actions (attest, revoke, approve) are cast sends from
 * this spec, captioned as the operator route (simulated presentation). Evidence class L; no Privy app.
 */
import { expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { card, clearShots, shot } from './stack'

interface DeskEnv {
  mode: string
  appUrl: string
  rpcUrl: string
  registry: string
  desk: string
  policyId: string
  investor: string
  operator: string
  operatorKey: string
}

const MODE = 'showcase-investor-money'
const ENV_PATH = process.env.APP_E2E_ENV ?? resolve(import.meta.dirname, '../../.e2e/showcase-investor-money/env.json')
const env: DeskEnv | undefined = existsSync(ENV_PATH) ? (JSON.parse(readFileSync(ENV_PATH, 'utf8')) as DeskEnv) : undefined

/** The operator's registry actions, sent with anvil key 0 the way the shell script does. */
function operator(sig: string, ...args: string[]): string {
  if (!env) throw new Error('no stack')
  const home = process.env.HOME ?? ''
  const r = spawnSync('cast', ['send', '--rpc-url', env.rpcUrl, '--private-key', env.operatorKey, env.registry, sig, ...args, '--json'], {
    env: { ...process.env, PATH: `${home}/.foundry/bin:${process.env.PATH ?? ''}` },
    encoding: 'utf8',
    timeout: 60_000,
  })
  if (r.status !== 0) throw new Error(`cast send ${sig} failed: ${r.stderr}`)
  return (JSON.parse(r.stdout) as { transactionHash: string }).transactionHash
}

function money(page: Page) {
  return card(page, 'Your money')
}
async function expectBalances(page: Page, stable: string, units: string, claimable: string) {
  await expect(page.getByTestId('bal-stable')).toHaveText(stable)
  await expect(page.getByTestId('bal-units')).toHaveText(units)
  await expect(page.getByTestId('bal-claimable')).toHaveText(`${claimable} mUSD`)
}

test.beforeAll(() => clearShots(MODE))

test.describe('fund desk for an email investor (dev signer stands in for the embedded wallet)', () => {
  test.skip(env?.mode !== MODE, `stack mode is ${env?.mode ?? 'none'}, this spec needs ${MODE} (scripts/showcase-investor-money-local.sh --test)`)

  test('refused before approval; subscribe, distribute, claim, redeem; refused after revoke; reopened by approve', async ({ page }) => {
    if (!env) throw new Error('no stack')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const ZERO32 = `0x${'0'.repeat(64)}`

    await page.goto('/showcase/investor-money')
    await card(page, 'Sign in').getByRole('button', { name: 'Connect dev signer' }).click()
    await expect(page.locator('header .chip')).toContainText(env.investor.slice(0, 6))
    await expect(page.getByTestId('desk-eligibility')).toHaveText('no decision')
    await expectBalances(page, '0', '0', '0')

    // 1. Before any decision: the click is taken, the desk refuses in simulation, nothing is signed.
    await money(page).getByTestId('btn-subscribe').click()
    await expect(page.getByTestId('desk-refused')).toContainText('no eligibility decision on chain')
    await shot(page, MODE, '01-refused-no-decision')

    // 2. The operator attests and approves (operator route, simulated presentation).
    const expiry = Math.floor(Date.now() / 1000) + 3600
    operator('attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))', env.investor, `(${env.policyId},3,1,${expiry},${ZERO32},false)`)
    await expect(page.getByTestId('desk-eligibility')).toHaveText('eligible')

    // 3. Test stablecoin, then subscribe (allowance and subscribe: two dev-signer transactions).
    await money(page).getByTestId('btn-mint').click()
    await expectBalances(page, '1,000', '0', '0')
    await money(page).getByTestId('btn-subscribe').click()
    await expectBalances(page, '900', '100', '0')
    await shot(page, MODE, '02-subscribed')

    // 4. The issuer pays a distribution from the operator wallet on the issuer console (the dev signer follows the role:
    //    a connected dev signer switches to the operator key on /issuer without a click, src/lib/wallet.ts).
    await page.goto('/issuer')
    await expect(page.locator('header .chip')).toContainText(env.operator.slice(0, 6))
    const desk = card(page, 'Fund desk')
    await expect(desk.getByTestId('desk-outstanding')).toHaveText('100 NDF')
    await desk.getByTestId('btn-distribute').click()
    await expect(desk.getByTestId('desk-distributions')).toHaveText('1')
    await expect(desk.getByText('tx confirmed')).toBeVisible()
    await shot(page, MODE, '03-distribution-paid')

    // 5. Back on the desk: claim, then redeem.
    await page.goto('/showcase/investor-money')
    await expect(page.locator('header .chip')).toContainText(env.investor.slice(0, 6))
    await expectBalances(page, '900', '100', '10')
    await money(page).getByTestId('btn-claim').click()
    await expectBalances(page, '910', '100', '0')
    await money(page).getByTestId('btn-redeem').click()
    await expectBalances(page, '960', '50', '0')
    await shot(page, MODE, '04-claimed-redeemed')

    // 6. Revoke: every door refuses with the reason in plain words; balances unchanged.
    operator('revoke(address,bytes32)', env.investor, env.policyId)
    await expect(page.getByTestId('desk-eligibility')).toHaveText('revoked')
    for (const btn of ['btn-subscribe', 'btn-claim', 'btn-redeem']) {
      await money(page).getByTestId(btn).click()
      await expect(page.getByTestId('desk-refused')).toContainText('the issuer revoked the decision')
    }
    await expectBalances(page, '960', '50', '0')
    await shot(page, MODE, '05-refused-after-revoke')

    // 7. Approve again: subscribe reopens (50 NDF from the desk's inventory, 50 minted).
    operator('approve(address,bytes32)', env.investor, env.policyId)
    await expect(page.getByTestId('desk-eligibility')).toHaveText('eligible')
    await money(page).getByTestId('btn-subscribe').click()
    await expectBalances(page, '860', '150', '0')
    // Receipts live in memory per page load (like the product's receipts); the goto to /issuer and back dropped
    // the first three (mint, allowance, subscribe). Since then: claim, allowance, redeem, subscribe.
    const receipts = page.getByTestId('desk-receipts').locator('.receipt')
    await expect(receipts).toHaveCount(4)
    await expect(receipts.first()).toContainText('Subscribed 100 mUSD into the desk')
    await shot(page, MODE, '06-reopened')

    expect(errors, 'page errors').toEqual([])
  })
})
