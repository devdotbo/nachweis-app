/**
 * Browser run of the SP1 path with the bridge in verifier mode and PROOF_MODE=mock
 * (scripts/app-e2e-local.sh --mode sp1-mock): the investor connects with the dev signer and
 * creates the session (the bridge creates the OpenID4VP request at the verifier), the dev signer
 * signs the session; the wallet stand-in (scripts/e2e/wallet.ts) answers the verifier request with
 * a fresh PID presentation; the bridge picks it up, runs the statement, "proves" (mock) and attests.
 * The app must walk presented, verified, proving, proved, attested without the phone handoff.
 * attested is evidence only: the doors stay closed until the issuer (operator dev key) approves, then
 * the investor is permitted.
 */
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { card, clearShots, expectConnected, loadStack, runBun, shot } from './stack'

const env = loadStack()
test.beforeAll(() => clearShots(env.mode))

test.describe('investor proves through the bridge (verifier mode, PROOF_MODE=mock)', () => {
  test.skip(env.mode !== 'sp1-mock', `stack mode is ${env.mode}, this spec needs sp1-mock`)

  test('presented, proving, attested, approved by the issuer', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto('/')
    await card(page, 'Connect wallet').getByRole('button', { name: 'Connect dev signer' }).click()
    await expectConnected(page, env.investor)

    const present = card(page, 'Present your ID')
    await present.getByRole('button', { name: 'Create presentation request' }).click()
    await expect(present.getByText('signed, sent to bridge')).toBeVisible()
    // verifier mode: the bridge returned the openid4vp link for the wallet
    await expect(present.getByAltText('QR code for the openid4vp request')).toBeVisible()
    const link = (await present.locator('a.link').textContent())?.trim() ?? ''
    expect(link).toMatch(/^openid4vp:\/\//)
    const sessionId = (await present.locator('dl.kv dd').first().textContent())?.trim() ?? ''
    expect(sessionId).not.toBe('')
    await shot(page, env.mode, '01-session')

    // the wallet stand-in answers the verifier's request for this session (same id at bridge and verifier)
    const r = runBun(['run', env.walletScript, env.verifierUrl, sessionId, env.issuerKeyPem, env.issuerCertPem], env.runDir, 120_000)
    writeFileSync(resolve(env.runDir, 'wallet.log'), `${r.stdout}\n${r.stderr}`)
    expect(r.status, `wallet.ts failed:\n${r.stderr.slice(-2000)}`).toBe(0)

    // follow the state machine on the Eligibility card; record every state the 2 s poll surfaces
    const status = card(page, 'Eligibility')
    const seen: string[] = []
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const current = (await status.locator('.steps .step.current, .steps .step.failed').first().textContent().catch(() => null))?.trim()
      if (current && seen[seen.length - 1] !== current) {
        seen.push(current)
        await shot(page, env.mode, `02-state-${seen.length}-${current}`)
      }
      if (current === 'attested' || current === 'failed') break
      await page.waitForTimeout(250)
    }
    writeFileSync(resolve(env.runDir, 'states-seen.json'), JSON.stringify(seen))
    // With PROOF_MODE=mock the bridge walks presented, verified, proving, proved inside one 2 s poll
    // interval, so which intermediate states the app catches varies; states-seen.json records them.
    expect(seen[seen.length - 1], `states seen: ${seen.join(' > ')}`).toBe('attested')

    // evidence on chain, not approved: the badge says so and both doors are closed
    await expect(present.getByText('attested, awaiting issuer approval')).toBeVisible()
    await expect(status.locator('.status').first()).toHaveText('evidence on chain, awaiting issuer approval')
    await expect(status.locator('.flag.on')).toHaveText(['yes: identity evidence', 'yes: over 18'])
    await expect(status.getByText('attest tx')).toBeVisible()
    await expect(status.getByTestId('approved')).toHaveText('false')
    await expect(card(page, 'Prove on your phone').getByText('attested without the phone')).toBeVisible()
    const doors = card(page, 'Two doors, one decision')
    const subscribeDoor = doors.locator('.door', { hasText: 'Subscribe' })
    await expect(doors.getByTestId('doors-awaiting')).toBeVisible()
    await expect(subscribeDoor.locator('.status')).toHaveText('closed')
    await expect(subscribeDoor.getByRole('button', { name: 'Subscribe' })).toBeDisabled()
    await shot(page, env.mode, '03-attested-awaiting-approval')

    // the issuer approves with the operator dev key: registry.approve(subject, policyId)
    await page.getByRole('button', { name: 'Issuer' }).click()
    await expectConnected(page, env.operator)
    const pending = card(page, 'Presentations')
    const item = pending.locator('.item', { hasText: sessionId })
    await expect(item.locator('.status')).toHaveText('attested (awaiting issuer approval)')
    await item.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(item.locator('.status')).toHaveText('approved')
    await expect(pending.getByText('tx confirmed')).toBeVisible()
    await expect(card(page, 'Registry events').locator('.ev.approved').first()).toBeVisible()
    await shot(page, env.mode, '04-approved-issuer')

    // back to the investor: permitted, doors open
    await page.getByRole('button', { name: 'Investor' }).click()
    await expectConnected(page, env.investor)
    await expect(status.locator('.status').first()).toHaveText('permitted')
    await expect(status.getByTestId('approved')).toHaveText('true')
    await expect(status.locator('.steps .step.current')).toHaveText('approved')
    await expect(subscribeDoor.locator('.status')).toHaveText('open')
    await shot(page, env.mode, '05-permitted')
    expect(errors, `browser errors:\n${errors.join('\n')}`).toEqual([])
  })
})
