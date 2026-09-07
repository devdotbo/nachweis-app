/**
 * Browser run of the two-device flow against the local stack (scripts/app-e2e-local.sh, mode noir):
 * investor connects with the dev signer, creates the bridge session, the dev signer signs
 * nachweis:session:<id>, the "Prove on your phone" card shows the handoff QR and URI; the companion
 * plays the phone (`companion handoff … --stub-wallet`), proves with bb and posts the proof; the app
 * flips to attested with bits 0x3, Subscribe sends a tx with the dev signer and the FundToken balance
 * shows; then the issuer role (operator dev key) revokes and the investor view shows revoked with the
 * Subscribe door closed.
 */
import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { card, expectConnected, loadStack, runBun, shot } from './stack'

const env = loadStack()

test.describe('investor proves on the phone, subscribes, issuer revokes', () => {
  test.skip(env.mode !== 'noir', `stack mode is ${env.mode}, this spec needs noir`)

  test('the six beats', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    // 1. landing: real chain, bridge, dev signer badge
    await page.goto('/')
    await expect(page.locator('header .tag', { hasText: 'Anvil' })).toBeVisible()
    await expect(page.locator('header .tag', { hasText: 'bridge' })).toBeVisible()
    await expect(page.locator('header .tag', { hasText: 'dev signer, local only' })).toBeVisible()
    await expect(page.locator('header .tag', { hasText: 'mock mode' })).toHaveCount(0)
    await shot(page, env.mode, '01-landing')

    // 2. connect the investor dev signer
    await card(page, 'Connect wallet').getByRole('button', { name: 'Connect dev signer' }).click()
    await expectConnected(page, env.investor)
    await expect(card(page, 'Connect wallet').getByText('wrong network')).toHaveCount(0)
    // One run per stack: a revoked subject cannot be re-attested with a proof (DecisionRevoked), and
    // evm_revert would desync the bridge's cached tx nonce. Restart scripts/app-e2e-local.sh to rerun.
    await expect(card(page, 'Eligibility').locator('.status').first(), 'the investor already has a decision on this anvil: restart the stack').toHaveText('not permitted')
    await shot(page, env.mode, '02-connected')

    // 3. create the session: POST /sessions at the bridge, EIP-191 signature by the dev signer, address proof
    const present = card(page, 'Present your ID')
    await present.getByRole('button', { name: 'Create presentation request' }).click()
    await expect(present.getByText('signed, sent to bridge')).toBeVisible()
    const sessionId = (await present.locator('dl.kv dd').first().textContent())?.trim() ?? ''
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/)
    await expect(present.locator('code.muted')).toHaveText(`nachweis:session:${sessionId}`)
    // the bridge confirmed the signature (address_verified) before the handoff is handed out
    const bridgeSession = await (await fetch(`${env.bridgeUrl}/sessions/${sessionId}`)).json()
    expect(bridgeSession.address_verified).toBe(true)
    expect(String(bridgeSession.bound_address).toLowerCase()).toBe(env.investor.toLowerCase())

    // 4. the handoff card: QR plus URI for the phone
    const handoff = card(page, 'Prove on your phone')
    await expect(handoff.getByText("waiting for the phone's proof")).toBeVisible()
    await expect(handoff.getByAltText('QR code with the session handoff for the phone prover')).toBeVisible()
    const uri = (await handoff.locator('code.link').textContent())?.trim() ?? ''
    expect(uri).toMatch(/^nachweis:\/\/handoff\?/)
    const q = new URL(uri).searchParams
    expect(q.get('s')).toBe(sessionId)
    expect(q.get('a')?.toLowerCase()).toBe(env.investor.toLowerCase())
    expect(q.get('b')).toBe(env.bridgeUrl)
    expect(q.get('r')).toBe(env.verifierUrl)
    await shot(page, env.mode, '03-handoff')

    // 5. the phone: companion handoff with the stub wallet (request with the same challenge, prove, post the proof)
    const sessionFile = resolve(env.runDir, 'companion-handoff.json')
    const r = runBun(['run', 'src/cli.ts', 'handoff', uri, '--stub-wallet', env.issuerJson, '--session', sessionFile, '--no-qr'], env.companionDir, 180_000)
    writeFileSync(resolve(env.runDir, 'companion.log'), `${r.stdout}\n${r.stderr}`)
    expect(r.status, `companion handoff failed:\n${r.stderr.slice(-2000)}`).toBe(0)

    // 6. attested: handoff card, badge, eligibility with bits 0x3, decision on chain
    await expect(handoff.getByText('attested from the phone')).toBeVisible()
    await expect(present.getByText('presented, attested')).toBeVisible()
    const status = card(page, 'Eligibility')
    await expect(status.locator('.status').first()).toHaveText('permitted')
    await expect(status.locator('.steps .step.current')).toHaveText('attested')
    await expect(status.locator('.flag.on')).toHaveText(['yes: identity evidence', 'yes: over 18'])
    await expect(status.locator('dl.kv')).toContainText('0x3')
    await expect(status.getByText('attest tx')).toBeVisible()
    await expect(card(page, 'What the chain sees').locator('pre.raw')).toContainText('"revoked": false')
    await shot(page, env.mode, '04-attested')

    // 7. Subscribe: the dev signer sends Subscription.subscribe(), the FundToken balance shows
    const doors = card(page, 'Two doors, one decision')
    const subscribeDoor = doors.locator('.door', { hasText: 'Subscribe' })
    await expect(subscribeDoor.locator('.status')).toHaveText('open')
    const balanceText = doors.getByTestId('fund-balance').locator('code')
    await expect(balanceText).toHaveText(/^\d+(\.\d+)?$/)
    const before = Number(await balanceText.textContent())
    await subscribeDoor.getByRole('button', { name: 'Subscribe' }).click()
    await expect(doors.getByText('tx confirmed')).toBeVisible()
    await expect.poll(async () => Number(await balanceText.textContent()), { message: 'FundToken balance after subscribe' }).toBeGreaterThan(before)
    await shot(page, env.mode, '05-subscribed')

    // 8. issuer role with the operator dev key: the session from this browser, Revoke
    await page.getByRole('button', { name: 'Issuer' }).click()
    await expectConnected(page, env.operator)
    const pending = card(page, 'Presentations')
    const item = pending.locator('.item', { hasText: sessionId })
    await expect(item.locator('.status')).toHaveText('attested')
    await shot(page, env.mode, '06-issuer')
    await item.getByRole('button', { name: 'Revoke' }).click()
    await expect(item.locator('.status')).toHaveText('revoked')
    await expect(pending.getByText('tx confirmed')).toBeVisible()
    await expect(card(page, 'Registry events').locator('.ev.revoked').first()).toBeVisible()
    await shot(page, env.mode, '07-revoked-issuer')

    // 9. back to the investor: revoked, Subscribe closed
    await page.getByRole('button', { name: 'Investor' }).click()
    await expectConnected(page, env.investor)
    await expect(status.locator('.status').first()).toHaveText('revoked')
    await expect(status.locator('dl.kv')).toContainText('true')
    await expect(subscribeDoor.locator('.status')).toHaveText('closed')
    await expect(subscribeDoor.getByRole('button', { name: 'Subscribe' })).toBeDisabled()
    await expect(card(page, 'What the chain sees').locator('pre.raw')).toContainText('"revoked": true')
    await shot(page, env.mode, '08-revoked-investor')

    expect(errors, `browser errors:\n${errors.join('\n')}`).toEqual([])
  })
})
