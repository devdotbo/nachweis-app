/**
 * The Swap door on the local permissioned pool (scripts/app-e2e-local.sh --mode sp1-mock --pool):
 * anvil forks Sepolia, scripts/pool-local.sh onboarded the Uniswap v4 permissioned pool with the
 * EudiAllowlistChecker reading this stack's registry. The investor (dev signer) is attested and
 * approved (by the sp1-mock spec before this file, else here through attestByOperator with the
 * operator key), swaps 100 mUSD for NDF through the permissioned Universal Router from the page, the
 * issuer revokes in the console, and the same Swap is refused: the page shows the decoded revert
 * (WrappedError from the PoolManager, Unauthorized inside PermissionedHooks.beforeSwap) in words and the
 * refused transaction's hash.
 */
import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { createPublicClient, http, type Hex } from 'viem'
import { card, clearShots, expectConnected, loadStack, shot } from './stack'

const env = loadStack()
// anvil's default account 0: the stack's deployer and registry operator (scripts/app-e2e-local.sh, K0).
const OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

/** The chain's own verdict on a transaction the page shows: the receipt status behind the hash in the txline. */
async function receiptStatusOf(result: import('@playwright/test').Locator): Promise<'success' | 'reverted'> {
  const hash = await result.locator('.txline code, .txline a').getAttribute('title')
  expect(hash, 'txline carries the full hash in its title').toMatch(/^0x[0-9a-f]{64}$/)
  const rpc = createPublicClient({ transport: http(env.rpcUrl) })
  return (await rpc.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30_000 })).status
}

function cast(args: string[]): string {
  const home = process.env.HOME ?? ''
  const r = spawnSync('cast', args, { encoding: 'utf8', env: { ...process.env, PATH: `${home}/.foundry/bin:${process.env.PATH ?? ''}` }, timeout: 60_000 })
  if (r.status !== 0) throw new Error(`cast ${args.slice(0, 2).join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

test.describe('swap in the permissioned pool from the investor portal', () => {
  test.skip(!env.pool, 'stack started without --pool (no permissioned pool on this anvil)')
  test.beforeAll(() => {
    if (env.mode !== 'sp1-mock') clearShots(env.mode)
  })

  test('swap goes through while eligible, is refused after the issuer revokes', async ({ page }) => {
    const pool = env.pool!
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    // The investor must be eligible: the sp1-mock spec leaves it approved; alone, attest by operator.
    const eligible = cast(['call', env.registry, 'isEligible(address,bytes32,uint256)(bool)', env.investor, env.policyId, '3', '--rpc-url', env.rpcUrl])
    if (eligible !== 'true') {
      const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
      cast(['send', env.registry, 'attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))', env.investor, `(${env.policyId},3,1,${expiry},0x${'00'.repeat(32)},false)`, '--rpc-url', env.rpcUrl, '--private-key', OPERATOR_KEY])
    }

    await page.goto('/')
    await card(page, 'Connect wallet').getByRole('button', { name: 'Connect dev signer' }).click()
    await expectConnected(page, env.investor)

    const doors = card(page, 'Two doors, one decision')
    const door = doors.getByTestId('swap-door')
    await expect(door.getByTestId('swap-status')).toHaveText('open')
    await expect(door.getByTestId('check-registry')).toHaveText('registry: eligible')
    await expect(door.getByTestId('check-checker')).toHaveText('checker: swap and liquidity allowed')
    await expect(door.getByTestId('check-adapter')).toHaveText('adapter: SWAP_ALLOWED')
    await expect(door.getByTestId('swap-quote')).toHaveText(/about \d+(\.\d+)? NDF/)
    const panel = doors.getByTestId('swap-panel')
    await expect(panel.getByTestId('pool-liquidity')).toContainText(pool.liquidity)
    await expect(panel).toContainText('PermissionedHooks')
    await expect(panel).toContainText('this app’s registry')
    await shot(page, env.mode, '06-swap-open')

    // Swap: faucet, ERC-20 approve, Permit2 allowance, UniversalRouter.execute from the dev signer.
    const fundBefore = BigInt(cast(['call', env.fundToken, 'balanceOf(address)(uint256)', env.investor, '--rpc-url', env.rpcUrl]).split(' ')[0])
    await door.getByTestId('swap-button').click()
    const result = door.getByTestId('swap-result')
    await expect(result).toHaveAttribute('data-outcome', 'done', { timeout: 90_000 })
    await expect(result.getByText('swap confirmed')).toBeVisible()
    await expect(door.getByTestId('swap-received')).toContainText(/Sent 100 mUSD, received \d+(\.\d+)? NDF/)
    expect(await receiptStatusOf(result), 'the confirmed swap is mined with status 1').toBe('success')
    const fundAfter = BigInt(cast(['call', env.fundToken, 'balanceOf(address)(uint256)', env.investor, '--rpc-url', env.rpcUrl]).split(' ')[0])
    expect(fundAfter > fundBefore, `FundToken balance did not grow: ${fundBefore} -> ${fundAfter}`).toBe(true)
    await expect(doors.getByTestId('fund-balance')).not.toContainText('…')
    await expect(page.locator('.rail li.done', { hasText: 'Swap' })).toBeVisible()
    await expect(card(page, 'History').getByText('Swapped in the permissioned pool')).toBeVisible()
    await shot(page, env.mode, '07-swap-confirmed')

    // The issuer withdraws approval (manual revocation) from the console.
    await page.getByRole('link', { name: 'Issuer', exact: true }).click()
    await expectConnected(page, env.operator)
    const revoke = card(page, 'Revoke by address')
    await revoke.getByLabel('subject address').fill(env.investor)
    await revoke.getByRole('button', { name: 'Revoke' }).click()
    await expect(revoke.getByText('tx confirmed')).toBeVisible()
    await expect(card(page, 'Registry events').locator('.ev.revoked').first()).toBeVisible()
    await shot(page, env.mode, '08-issuer-revoked-for-swap')

    // Back on the portal: the door is closed, the pool's question is answered no, the same Swap is refused.
    await page.getByRole('link', { name: 'Investor', exact: true }).click()
    await expectConnected(page, env.investor)
    await expect(door.getByTestId('swap-status')).toHaveText('closed')
    await expect(door.getByTestId('check-registry')).toHaveText('registry: not eligible')
    await expect(door.getByTestId('check-checker')).toHaveText('checker: no flags')
    await expect(door.getByTestId('check-adapter')).toHaveText('adapter: refused')
    await door.getByTestId('swap-button').click()
    await expect(result).toHaveAttribute('data-outcome', 'refused', { timeout: 90_000 })
    const refusal = door.getByTestId('swap-refusal')
    await expect(refusal).toContainText('Refused by PermissionedHooks.beforeSwap')
    await expect(refusal).toContainText('Unauthorized(): this address is not SWAP_ALLOWED')
    await expect(refusal).toContainText('isEligible(you, policy, bits) is false')
    // The refusal was sent with a fixed gas limit and mined as a reverted transaction: a hash, not "not sent".
    await expect(result.locator('.txline').getByText('not sent')).toHaveCount(0)
    await expect(result.locator('.txline code, .txline a')).toHaveText(/^0x[0-9a-f]{8}/)
    // The chain's verdict, not the simulation's: a status-1 transaction labelled refused is the defect this guards against.
    await expect(result.getByTestId('swap-outcome')).toHaveText('mined and reverted')
    expect(await receiptStatusOf(result), 'the refused swap is mined with status 0').toBe('reverted')
    await expect(card(page, 'History').getByText('Swap refused by the pool')).toBeVisible()
    await shot(page, env.mode, '09-swap-refused')
    expect(errors, `browser errors:\n${errors.join('\n')}`).toEqual([])
  })
})
