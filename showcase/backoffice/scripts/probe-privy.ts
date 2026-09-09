/**
 * Live checks against Privy for the desk wallet (privy mode), no funds needed. Each check prints
 * PASS or FAIL with Privy's verbatim error text. Reads .env (bun loads it) plus PRIVY_APP_ID and
 * PRIVY_APP_SECRET from the environment. Always exits 0; the runner reads the output.
 */
import { APIError } from '@privy-io/node'
import { encodeApprove } from '../src/chain'
import { loadConfig } from '../src/config'
import { parsePrivyError } from '../src/operator'
import { privyClient } from '../src/privy'

const cfg = loadConfig({ ...process.env, BACKOFFICE_MODE: 'privy' })
const p = cfg.privy!
const privy = privyClient(cfg)
const both = { authorization_private_keys: [p.complianceKey, p.operationsKey] }
const one = { authorization_private_keys: [p.complianceKey] }
const CHAIN = 11155111
const DEAD = '0x000000000000000000000000000000000000dEaD'

function apiText(e: unknown): string {
  if (e instanceof APIError) return `${e.status ?? 'no status'}: ${e.message}`
  return e instanceof Error ? e.message : String(e)
}
function isRefusal(e: unknown): boolean {
  return e instanceof APIError && typeof e.status === 'number' && e.status >= 400 && e.status < 500
}
function codeOf(e: unknown): string | undefined {
  return e instanceof APIError ? parsePrivyError(e.message).code : undefined
}
const line = (n: number, verdict: string, text: string) => console.log(`[${n}] ${verdict} ${text}`)

// (1) wallet ownership and policy binding
try {
  const w = await privy.wallets().get(p.walletId)
  const ownerOk = !p.quorumId || w.owner_id === p.quorumId
  const policyOk = w.policy_ids.includes(p.policyId)
  line(1, ownerOk && policyOk ? 'PASS' : 'FAIL', `wallet ${w.id} owner_id=${w.owner_id ?? 'none'} policy_ids=[${w.policy_ids.join(', ')}] address=${w.address}`)
} catch (e) {
  line(1, 'FAIL', `wallets().get: ${apiText(e)}`)
}

// (2) personal_sign with both keys: no expectation enforced; the policy has no personal_sign rule
try {
  const r = await privy.wallets().ethereum().signMessage(p.walletId, { message: 'attestat backoffice probe', authorization_context: both })
  line(2, 'INFO', `signMessage went through (signature ${r.signature.slice(0, 18)}...), the policy did not block personal_sign`)
} catch (e) {
  line(2, codeOf(e) === 'policy_violation' ? 'PASS' : 'INFO', `signMessage refused: ${apiText(e)}`)
}

// (3) update with one key: the 2-of-2 quorum must refuse
try {
  await privy.wallets().update(p.walletId, { display_name: 'attestat-backoffice-operator', authorization_context: one })
  line(3, 'FAIL', 'update with one key was accepted; the quorum did not enforce 2 of 2')
} catch (e) {
  line(3, isRefusal(e) ? 'PASS' : 'FAIL', `update with one key: ${apiText(e)}`)
}

// (4) the same update with both keys: quorum met
try {
  const w = await privy.wallets().update(p.walletId, { display_name: 'attestat-backoffice-operator', authorization_context: both })
  line(4, 'PASS', `update with both keys accepted (display_name ${w.display_name ?? 'none'})`)
} catch (e) {
  line(4, 'FAIL', `update with both keys: ${apiText(e)}`)
}

// (5) approve on the registry with both keys: the policy passes; any failure should be gas, funds or contract
try {
  const r = await privy.wallets().ethereum().sendTransaction(p.walletId, {
    caip2: `eip155:${CHAIN}`,
    params: { transaction: { to: cfg.registry, data: encodeApprove('0x0000000000000000000000000000000000000001', cfg.policyId), chain_id: CHAIN } },
    authorization_context: both,
  })
  line(5, 'PASS', `approve accepted by the policy and sent: ${r.hash}`)
} catch (e) {
  const t = apiText(e)
  const policyish = /policy|not allowed|denied/i.test(t)
  line(5, policyish ? 'FAIL' : 'PASS', `approve with both keys: ${t} (expected: not a policy refusal)`)
}

// (6) 1 wei to a burn address with both keys: the policy must refuse
try {
  const r = await privy.wallets().ethereum().sendTransaction(p.walletId, {
    caip2: `eip155:${CHAIN}`,
    params: { transaction: { to: DEAD, value: '0x1', chain_id: CHAIN } },
    authorization_context: both,
  })
  line(6, 'FAIL', `transfer was NOT refused, tx ${r.hash}`)
} catch (e) {
  const code = codeOf(e)
  line(6, code === 'policy_violation' ? 'PASS' : code === 'transaction_broadcast_failure' ? 'INCONCLUSIVE' : isRefusal(e) ? 'PASS' : 'FAIL', `transfer with both keys: ${apiText(e)}${code === 'transaction_broadcast_failure' ? ' (Privy checked funds before the policy; fund the wallet to get the policy verdict)' : ''}`)
}

process.exit(0)
