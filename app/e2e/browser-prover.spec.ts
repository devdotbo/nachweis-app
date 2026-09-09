/**
 * Browser run of the "Prove in this browser" path against the local stack (scripts/app-e2e-local.sh
 * --mode browser): investor connects with the dev signer, creates the bridge session, the dev signer
 * signs nachweis:session:<id>; card 2b defaults to the browser path on the isolated page; the tab
 * creates the relay request and shows the wallet QR; `companion mint-test-presentation` answers the
 * relay as the wallet; the tab picks up, decrypts, proves with bb.js (up to 120 s), verifies and posts
 * the proof; the bridge dry-runs NoirPidVerifier and sends attestWithProof; the app shows attested
 * with the doors closed; the issuer (operator dev key) approves; the investor is permitted and
 * Subscribe raises the FundToken balance. Every request the page made between the click and attested
 * is checked against the allowlist of docs/spec-browser-prover.md (K3), and the attest transaction
 * receipt is read from anvil (K2). Timings land in .e2e/app/browser-timings.json (K1).
 */
import { expect, test, type Request } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { card, clearShots, expectConnected, loadStack, runBun, shot } from './stack'

const env = loadStack()
const PROOF_TIMEOUT_MS = 120_000
test.beforeAll(() => clearShots(env.mode))

test.describe('investor proves in the browser, issuer approves, subscribes', () => {
  test.skip(env.mode !== 'browser', `stack mode is ${env.mode}, this spec needs browser`)

  test('the browser path', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    // 1. landing, connect the investor dev signer
    await page.goto('/')
    await expect(page.locator('header .tag', { hasText: 'bridge' })).toBeVisible()
    await card(page, 'Connect wallet').getByRole('button', { name: 'Connect dev signer' }).click()
    await expectConnected(page, env.investor)
    await expect(card(page, 'Eligibility').locator('.status').first(), 'the investor already has a decision on this anvil: restart the stack').toHaveText('not permitted')
    const isolated = await page.evaluate(() => ({ crossOriginIsolated, threads: navigator.hardwareConcurrency, sab: typeof SharedArrayBuffer !== 'undefined' }))
    expect(isolated.crossOriginIsolated, 'the dev server must send COOP same-origin and COEP require-corp').toBe(true)
    expect(isolated.sab).toBe(true)

    // 2. the bridge session, signed by the dev signer
    const present = card(page, 'Present your ID')
    await present.getByRole('button', { name: 'Create presentation request' }).click()
    await expect(present.getByText('signed, sent to bridge')).toBeVisible()
    const sessionId = (await present.locator('dl.kv dd').first().textContent())?.trim() ?? ''
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/)
    const before = await (await fetch(`${env.bridgeUrl}/sessions/${sessionId}`)).json()
    expect(before.address_verified).toBe(true)

    // 3. card 2b: the browser path is the default on an isolated page
    const prove = card(page, 'Prove in this browser')
    await expect(prove).toBeVisible()
    await expect(prove.getByRole('button', { name: 'In this browser', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(prove.getByRole('button', { name: 'On your phone' })).toBeEnabled()
    await expect(prove.getByRole('button', { name: 'Desktop companion' })).toBeEnabled()
    await shot(page, env.mode, '01-ready')

    // K3: every request the page makes from here until attested
    const requests: { method: string; url: string }[] = []
    const record = (r: Request) => requests.push({ method: r.method(), url: r.url() })
    page.on('request', record)

    // 4. start: relay request, wallet QR
    const t0 = Date.now()
    await prove.getByTestId('browser-start').click()
    await expect(prove.getByTestId('browser-phase')).toHaveText('waiting')
    await expect(prove.getByAltText('QR code for the openid4vp request from this browser')).toBeVisible()
    const requestUri = (await prove.getByTestId('browser-request-uri').textContent())?.trim() ?? ''
    expect(requestUri).toMatch(/^https?:\/\//)
    const relayHost = env.verifierPublicUrl || env.verifierUrl
    expect(requestUri.startsWith(relayHost), `request_uri ${requestUri} is not under ${relayHost}`).toBe(true)
    await shot(page, env.mode, '02-wallet-qr')

    // 5. the stub wallet answers the relay request (mints a presentation for the request's nonce, encrypts to the tab's key)
    const wallet = runBun(['run', 'src/cli.ts', 'mint-test-presentation', '--issuer-key', env.issuerJson, '--request-uri', requestUri], env.companionDir, 60_000)
    writeFileSync(resolve(env.runDir, 'stub-wallet.log'), `${wallet.stdout}\n${wallet.stderr}`)
    expect(wallet.status, `stub wallet failed:\n${wallet.stderr.slice(-2000)}`).toBe(0)
    expect(wallet.stdout).toContain('"posted":200')

    // 6. pickup, decrypt, check, witness, bb.js init, prove, verify, submit: K1 allows 120 s for the proof
    await expect(prove.getByTestId('browser-phase')).toHaveText(/pickup|checking|witness|init|proving/, { timeout: 30_000 })
    await expect(prove.getByTestId('browser-phase'), 'the proof did not complete').toHaveText(/submitted|attested from this browser/, { timeout: PROOF_TIMEOUT_MS + 30_000 })
    const proofMs = Date.now() - t0
    const timings = JSON.parse((await prove.getByTestId('browser-timings').textContent()) ?? '{}') as Record<string, number | boolean>
    expect(timings.cross_origin_isolated).toBe(true)
    expect(Number(timings.prove)).toBeGreaterThan(0)
    expect(proofMs, 'K1: click to submitted').toBeLessThan(PROOF_TIMEOUT_MS + 30_000)
    await expect(prove.locator('dl.kv dd', { hasText: 'verified in tab true' })).toBeVisible()
    const txHash = (await prove.getByTestId('browser-tx').textContent())?.trim() ?? ''
    expect(txHash).toMatch(/^0x[0-9a-f]{64}$/)
    // the log holds phase names, sizes and milliseconds, never a claim value
    const log = (await prove.getByTestId('browser-log').textContent()) ?? ''
    expect(log).toContain('statement holds')
    expect(log).not.toMatch(/given_name|family_name|eyJ/)
    await shot(page, env.mode, '03-proved')

    // 7. attested: evidence on chain, awaiting the issuer
    await expect(prove.getByText('attested from this browser')).toBeVisible()
    await expect(present.getByText('attested, awaiting issuer approval')).toBeVisible()
    const status = card(page, 'Eligibility')
    await expect(status.locator('.status').first()).toHaveText('evidence on chain, awaiting issuer approval')
    await expect(status.locator('.steps .step.current')).toHaveText('attested')
    await expect(status.locator('.flag.on')).toHaveText(['yes: identity evidence', 'yes: over 18'])
    await expect(status.getByTestId('approved')).toHaveText('false')
    page.off('request', record)
    const totalMs = Date.now() - t0
    const after = await (await fetch(`${env.bridgeUrl}/sessions/${sessionId}`)).json()
    expect(after.state).toBe('attested')
    expect(after.proof_system).toBe('noir-ultrahonk')
    expect(String(after.tx_hash).toLowerCase()).toBe(txHash.toLowerCase())

    // K2: the attest transaction is mined against the registry (the bridge dry-ran NoirPidVerifier before sending)
    const receipt = (await (
      await fetch(env.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }) })
    ).json()) as { result: { status: string; to: string; logs: unknown[] } }
    expect(receipt.result.status).toBe('0x1')
    expect(receipt.result.to.toLowerCase()).toBe(env.registry.toLowerCase())
    expect(receipt.result.logs.length).toBeGreaterThan(0)

    // K3: only the relay, the bridge session, the RPC, the app's own files and the Aztec CRS
    const appOrigin = new URL(env.appUrl).origin
    const allow = [
      { name: 'relay request', re: new RegExp(`^${env.verifierUrl}/relay/request$`), methods: ['POST'] },
      { name: 'request object, status, pickup', re: new RegExp(`^${relayHost}/`), methods: ['GET'] },
      { name: 'bridge session', re: new RegExp(`^${env.bridgeUrl}/sessions/${sessionId}$`), methods: ['GET'] },
      { name: 'noir-proof', re: new RegExp(`^${env.bridgeUrl}/sessions/${sessionId}/noir-proof$`), methods: ['POST'] },
      { name: 'rpc', re: new RegExp(`^${env.rpcUrl}/?$`), methods: ['POST'] },
      { name: 'crs', re: /^https:\/\/crs\.aztec-cdn\.foundation\//, methods: ['GET'] },
    ]
    const offList = requests.filter((r) => !r.url.startsWith(appOrigin) && !allow.some((a) => a.re.test(r.url) && a.methods.includes(r.method)))
    expect(offList, `requests outside the allowlist:\n${offList.map((r) => `${r.method} ${r.url}`).join('\n')}`).toEqual([])
    const posts = requests.filter((r) => r.method === 'POST' && !r.url.startsWith(appOrigin) && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(r.url))
    expect(posts.map((r) => r.url.replace(env.verifierUrl, '{verifier}').replace(env.bridgeUrl, '{bridge}'))).toEqual(['{verifier}/relay/request', `{bridge}/sessions/${sessionId}/noir-proof`])
    writeFileSync(
      resolve(env.runDir, 'browser-timings.json'),
      JSON.stringify({ browser: test.info().project.use.channel ?? 'chromium', ua: await page.evaluate(() => navigator.userAgent), click_to_submitted_ms: proofMs, click_to_attested_ms: totalMs, worker: timings, requests: requests.filter((r) => !r.url.startsWith(appOrigin)) }, null, 2),
    )
    await shot(page, env.mode, '04-attested-awaiting-approval')

    // 8. the issuer approves with the operator dev key, the investor is permitted
    await page.getByRole('link', { name: 'Issuer', exact: true }).click()
    await expectConnected(page, env.operator)
    const item = card(page, 'Presentations').locator('.item', { hasText: sessionId })
    await expect(item.locator('.status')).toHaveText('attested (awaiting issuer approval)')
    await item.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(item.locator('.status')).toHaveText('approved')
    await shot(page, env.mode, '05-approved-issuer')
    await page.getByRole('link', { name: 'Investor', exact: true }).click()
    await expectConnected(page, env.investor)
    await expect(status.locator('.status').first()).toHaveText('permitted')
    await expect(status.getByTestId('approved')).toHaveText('true')

    // 9. Subscribe with the dev signer, the FundToken balance rises
    const doors = card(page, 'Two doors, one decision')
    const subscribeDoor = doors.locator('.door', { hasText: 'Subscribe' })
    await expect(subscribeDoor.locator('.status')).toHaveText('open')
    const balanceText = doors.getByTestId('fund-balance').locator('code')
    await expect(balanceText).toHaveText(/^\d+(\.\d+)?$/)
    const balanceBefore = Number(await balanceText.textContent())
    await subscribeDoor.getByRole('button', { name: 'Subscribe' }).click()
    await expect(doors.getByText('tx confirmed')).toBeVisible()
    await expect.poll(async () => Number(await balanceText.textContent()), { message: 'FundToken balance after subscribe' }).toBeGreaterThan(balanceBefore)
    await shot(page, env.mode, '06-subscribed')

    expect(errors, `browser errors:\n${errors.join('\n')}`).toEqual([])
  })
})
