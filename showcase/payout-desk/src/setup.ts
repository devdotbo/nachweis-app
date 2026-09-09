/**
 * One-time Privy setup for the payout desk (PAYOUT_SIGNER=privy). Prints identifiers only, never a secret.
 *
 *   bun run src/setup.ts create [--officer-b-out <path>]
 *       Creates officer B's P-256 key (private key written to <path>, mode 600; skipped when
 *       PRIVY_AUTHORIZATION_KEY_B is already set), the 2-of-2 key quorum of both officers (falls back to 1-of-1
 *       with officer A when the API refuses), the policy (owner: the quorum) and the treasury server wallet
 *       (owner: the quorum, policy attached). GATED_PAYOUT and PAYOUT_TOKEN from the env are written into the
 *       rules; unset, the zero address stands in until `update-rules` after the Sepolia deployment.
 *   bun run src/setup.ts update-rules
 *       Replaces the rules of PRIVY_POLICY_ID with the current env (needs the owner keys).
 *   bun run src/setup.ts check
 *       Live checks without funds: sign a payout to the gate (allowed), a transfer on the stablecoin (denied),
 *       a payout with one officer key only (denied when 2-of-2), a personal_sign (denied by default).
 */
import { APIError, generateP256KeyPair, type PrivyClient } from '@privy-io/node'
import { createPrivateKey, createPublicKey } from 'node:crypto'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { encodeFunctionData, getAddress, type Address } from 'viem'
import { loadConfig, type Config } from './config'
import { buildRules, ERC20_APPROVE_ABI, GATED_PAYOUT_ABI, type PolicyRule } from './policy'
import { authorizationContext, privyClient } from './privy'

const ZERO: Address = '0x0000000000000000000000000000000000000000'

function envForSetup(): Config {
  // create and update-rules tolerate missing contract addresses (zero placeholders); the server does not.
  const env: NodeJS.ProcessEnv = { ...process.env, PAYOUT_SIGNER: 'privy' }
  for (const k of ['REGISTRY', 'GATED_PAYOUT', 'PAYOUT_TOKEN']) if (!env[k] || env[k] === ZERO) env[k] = '0x0000000000000000000000000000000000000001'
  if (!env.PRIVY_WALLET_ID) env.PRIVY_WALLET_ID = 'unset'
  return loadConfig(env)
}

function publicKeyOf(privateKeyB64: string): string {
  const key = createPrivateKey({ key: Buffer.from(privateKeyB64, 'base64'), format: 'der', type: 'pkcs8' })
  return createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64')
}

function apiText(e: unknown): string {
  if (e instanceof APIError) return `${e.status} ${String(e.message).split('\n')[0].slice(0, 300)}`
  return String((e as Error).message ?? e).split('\n')[0].slice(0, 300)
}

function rulesFor(cfg: Config): PolicyRule[] {
  const gate = process.env.GATED_PAYOUT && process.env.GATED_PAYOUT !== ZERO ? getAddress(process.env.GATED_PAYOUT) : ZERO
  const token = process.env.PAYOUT_TOKEN && process.env.PAYOUT_TOKEN !== ZERO ? getAddress(process.env.PAYOUT_TOKEN) : ZERO
  return buildRules({ chainId: cfg.chainId, gate, token, cap: cfg.cap })
}

async function create(cfg: Config, officerBOut?: string) {
  const privy = privyClient(cfg)
  const pubA = publicKeyOf(cfg.privy!.keyA)
  let keyB = cfg.privy!.keyB
  if (!keyB) {
    if (!officerBOut) throw new Error('PRIVY_AUTHORIZATION_KEY_B is unset; pass --officer-b-out <path> to create officer B (the private key is written there, mode 600)')
    if (existsSync(officerBOut)) throw new Error(`${officerBOut} exists; refusing to overwrite`)
    const kp = await generateP256KeyPair()
    writeFileSync(officerBOut, `PRIVY_AUTHORIZATION_KEY_B=${kp.privateKey}\n`, { mode: 0o600 })
    chmodSync(officerBOut, 0o600)
    keyB = kp.privateKey
    console.log(`officer B key created; private key written to ${officerBOut} (mode 600). Public key: ${kp.publicKey}`)
  }
  const pubB = publicKeyOf(keyB)

  let quorumId: string
  let threshold: number
  try {
    const q = await privy.keyQuorums().create({ display_name: 'attestat-payout-officers', public_keys: [pubA, pubB], authorization_threshold: 2 })
    quorumId = q.id
    threshold = q.authorization_threshold ?? 2
    console.log(`key quorum created: ${q.id} (threshold ${threshold} of ${q.authorization_keys.length})`)
  } catch (e) {
    console.log(`2-of-2 key quorum refused: ${apiText(e)}; falling back to 1-of-1 with officer A`)
    const q = await privy.keyQuorums().create({ display_name: 'attestat-payout-officer-a', public_keys: [pubA], authorization_threshold: 1 })
    quorumId = q.id
    threshold = 1
    console.log(`key quorum created: ${q.id} (threshold 1 of 1)`)
  }

  const rules = rulesFor(cfg)
  const policy = await privy.policies().create({ name: 'attestat-payout-treasury', version: '1.0', chain_type: 'ethereum', owner_id: quorumId, rules: rules as never })
  console.log(`policy created: ${policy.id} (${rules.length} ALLOW rules, default DENY, owner ${quorumId})`)

  const wallet = await privy.wallets().create({ chain_type: 'ethereum', display_name: 'attestat-payout-treasury', owner_id: quorumId, policy_ids: [policy.id] })
  console.log(`treasury wallet created: ${wallet.id} at ${wallet.address}`)
  console.log('')
  console.log('Add to showcase/payout-desk/.env:')
  console.log(`PRIVY_WALLET_ID=${wallet.id}`)
  console.log(`PRIVY_POLICY_ID=${policy.id}`)
  console.log(`PRIVY_KEY_QUORUM_ID=${quorumId}`)
  if (threshold === 2) console.log('(and PRIVY_AUTHORIZATION_KEY_B from the officer B file)')
}

async function updateRules(cfg: Config) {
  const privy = privyClient(cfg)
  const policyId = cfg.privy!.policyId
  if (!policyId) throw new Error('PRIVY_POLICY_ID is unset')
  const rules = rulesFor(cfg)
  const p = await privy.policies().update(policyId, { rules: rules as never, authorization_context: authorizationContext(cfg) })
  console.log(`policy ${p.id} rules replaced (${rules.length} ALLOW rules): gate ${process.env.GATED_PAYOUT}, token ${process.env.PAYOUT_TOKEN}, cap ${cfg.cap}`)
}

async function trySign(privy: PrivyClient, cfg: Config, label: string, to: Address, data: `0x${string}`, officers: ('A' | 'B')[], chainId = cfg.chainId) {
  try {
    const r = await privy
      .wallets()
      .ethereum()
      .signTransaction(cfg.privy!.walletId, {
        params: { transaction: { to, data, value: '0x0', chain_id: chainId, nonce: 0, gas_limit: 300000, max_fee_per_gas: '0x3b9aca00', max_priority_fee_per_gas: '0x3b9aca00', type: 2 } },
        authorization_context: authorizationContext(cfg, officers),
      })
    console.log(`${label}: SIGNED (${r.signed_transaction.length / 2 - 1} bytes)`)
    return 'signed'
  } catch (e) {
    console.log(`${label}: REFUSED ${apiText(e)}`)
    return 'refused'
  }
}

async function check(cfg: Config) {
  const privy = privyClient(cfg)
  const w = await privy.wallets().get(cfg.privy!.walletId)
  console.log(`wallet ${w.id} at ${w.address}, owner ${w.owner_id ?? '(none)'}, policies ${JSON.stringify(w.policy_ids ?? [])}`)
  const gate = getAddress(process.env.GATED_PAYOUT && process.env.GATED_PAYOUT !== ZERO ? process.env.GATED_PAYOUT : ZERO)
  const token = getAddress(process.env.PAYOUT_TOKEN && process.env.PAYOUT_TOKEN !== ZERO ? process.env.PAYOUT_TOKEN : ZERO)
  const contractor = getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
  const payoutUnderCap = encodeFunctionData({ abi: GATED_PAYOUT_ABI, functionName: 'payout', args: [[contractor], [100_000_000n], 100_000_000n, `0x${'11'.repeat(32)}`] })
  const payoutOverCap = encodeFunctionData({ abi: GATED_PAYOUT_ABI, functionName: 'payout', args: [[contractor], [cfg.cap + 1n], cfg.cap + 1n, `0x${'22'.repeat(32)}`] })
  const approveGate = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [gate, 2n ** 256n - 1n] })
  const transfer = encodeFunctionData({ abi: [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [contractor, 100_000_000n] })
  const both: ('A' | 'B')[] = cfg.privy!.keyB ? ['A', 'B'] : ['A']
  const results = {
    payoutUnderCap: await trySign(privy, cfg, `1. payout(100 mUSD) to the gate on chain ${cfg.chainId}, ${both.length} officer key(s)`, gate, payoutUnderCap, both),
    payoutOverCap: await trySign(privy, cfg, `2. payout(cap + 1) to the gate`, gate, payoutOverCap, both),
    approveGate: await trySign(privy, cfg, `3. approve(gate) on the stablecoin`, token, approveGate, both),
    transfer: await trySign(privy, cfg, `4. transfer(contractor, 100 mUSD) on the stablecoin, bypassing the gate`, token, transfer, both),
    otherContract: await trySign(privy, cfg, `5. payout calldata to another contract`, contractor, payoutUnderCap, both),
    oneOfficer: cfg.privy!.keyB ? await trySign(privy, cfg, `6. payout(100 mUSD) to the gate with officer A only`, gate, payoutUnderCap, ['A']) : 'skipped (no officer B key)',
    wrongChain: await trySign(privy, cfg, `7. payout(100 mUSD) to the gate on chain 1`, gate, payoutUnderCap, both, 1),
  }
  let personal = 'refused'
  try {
    await privy.wallets().ethereum().signMessage(cfg.privy!.walletId, { message: 'attestat payout desk check', authorization_context: authorizationContext(cfg, both) })
    personal = 'signed'
    console.log('8. personal_sign: SIGNED (unexpected under default DENY)')
  } catch (e) {
    console.log(`8. personal_sign: REFUSED ${apiText(e)}`)
  }
  console.log(JSON.stringify({ ...results, personalSign: personal }))
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2)
  const flag = (name: string) => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : undefined
  }
  const cfg = envForSetup()
  if (cmd === 'create') await create(cfg, flag('--officer-b-out'))
  else if (cmd === 'update-rules') await updateRules(cfg)
  else if (cmd === 'check') {
    if (!cfg.privy?.walletId || cfg.privy.walletId === 'unset') throw new Error('PRIVY_WALLET_ID is unset')
    await check(cfg)
  } else {
    console.log('usage: bun run src/setup.ts create [--officer-b-out <path>] | update-rules | check')
    process.exit(2)
  }
}
