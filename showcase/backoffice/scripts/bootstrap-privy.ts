/**
 * One-time Privy setup for the desk (privy mode): two officer keys, a 2-of-2 key quorum, the
 * operator policy, and the server wallet bound to both. Needs PRIVY_APP_ID and PRIVY_APP_SECRET
 * in the environment (the runner sources them). Prints ids and the address only, never a key.
 *
 *   bun run scripts/bootstrap-privy.ts
 *   bun run scripts/bootstrap-privy.ts --set-registry 0x...   (after a Sepolia deployment; reads .env)
 */
import { APIError, PrivyClient, generateP256KeyPair } from '@privy-io/node'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getAddress } from 'viem'
import { stripKeyPrefix } from '../src/config'
import { policyCreateParams, registryOperatorRules } from '../src/policy'

const CHAIN_IDS = [31337, 11155111]
const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url))

function need(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) {
    console.error(`missing ${name}`)
    process.exit(1)
  }
  return v
}

function apiText(e: unknown): string {
  if (e instanceof APIError) return `${e.status ?? 'no status'}: ${e.message}`
  return e instanceof Error ? e.message : String(e)
}

const privy = new PrivyClient({ appId: need('PRIVY_APP_ID'), appSecret: need('PRIVY_APP_SECRET') })

async function setRegistry(address: string): Promise<void> {
  const registry = getAddress(address)
  const policyId = need('PRIVY_POLICY_ID')
  const keys = [stripKeyPrefix(need('PRIVY_COMPLIANCE_KEY')), stripKeyPrefix(need('PRIVY_OPERATIONS_KEY'))]
  const rules = registryOperatorRules(registry, CHAIN_IDS)
  try {
    const p = await privy.policies().update(policyId, { rules, authorization_context: { authorization_private_keys: keys } })
    console.log(`policy ${p.id} updated: to = ${registry} on chains ${CHAIN_IDS.join(', ')}`)
  } catch (e) {
    console.error(`policy update refused: ${apiText(e)}`)
    process.exit(2)
  }
}

async function bootstrap(): Promise<void> {
  const registry = getAddress(process.env.REGISTRY?.trim() || '0x5FbDB2315678afecb367f032d93F642f64180aa3')
  if (existsSync(ENV_PATH)) {
    console.error(`refusing to overwrite ${ENV_PATH}; move it away first`)
    process.exit(1)
  }

  // (a) two officer keys, generated here and written only to .env
  const c = await generateP256KeyPair()
  const o = await generateP256KeyPair()
  console.log('generated two P-256 authorization key pairs (compliance, operations)')

  // (b) the 2-of-2 key quorum
  let quorumId: string
  try {
    const q = await privy.keyQuorums().create({
      public_keys: [c.publicKey, o.publicKey],
      authorization_threshold: 2,
      display_name: 'attestat-backoffice-desk',
    })
    quorumId = q.id
    console.log(`key quorum ${quorumId} (threshold ${q.authorization_threshold})`)
  } catch (e) {
    console.error(`QUORUM-REFUSED ${apiText(e)}`)
    process.exit(2)
  }

  // (c) the policy, owned by the quorum when Privy accepts that
  let policyId: string
  try {
    const p = await privy.policies().create(policyCreateParams(registry, CHAIN_IDS, quorumId))
    policyId = p.id
    console.log(`policy ${policyId} (owner ${p.owner_id ?? 'none'})`)
  } catch (e) {
    console.log(`policy create with owner refused (${apiText(e)}); retrying without owner_id`)
    const p = await privy.policies().create(policyCreateParams(registry, CHAIN_IDS))
    policyId = p.id
    console.log(`policy ${policyId} (no owner)`)
  }

  // (d) the operator wallet owned by the quorum and bound to the policy
  const bothKeys = [c.privateKey, o.privateKey]
  let walletId: string
  let address: string
  try {
    const w = await privy.wallets().create({
      chain_type: 'ethereum',
      owner_id: quorumId,
      policy_ids: [policyId],
      display_name: 'attestat-backoffice-operator',
    })
    walletId = w.id
    address = w.address
  } catch (e) {
    console.log(`wallet create with policy_ids refused (${apiText(e)}); creating without and attaching with both keys`)
    const w = await privy.wallets().create({ chain_type: 'ethereum', owner_id: quorumId, display_name: 'attestat-backoffice-operator' })
    const u = await privy.wallets().update(w.id, {
      policy_ids: [policyId],
      authorization_context: { authorization_private_keys: bothKeys },
    })
    walletId = u.id
    address = u.address
  }
  console.log(`wallet ${walletId} at ${address}`)

  // (e) .env for the desk; app credentials stay out of it
  const lines = [
    'BACKOFFICE_MODE=privy',
    'CHAIN_ID=11155111',
    `REGISTRY=${registry}`,
    `PRIVY_COMPLIANCE_KEY=${c.privateKey}`,
    `PRIVY_OPERATIONS_KEY=${o.privateKey}`,
    `PRIVY_OPERATOR_WALLET_ID=${walletId}`,
    `PRIVY_OPERATOR_ADDRESS=${address}`,
    `PRIVY_POLICY_ID=${policyId}`,
    `PRIVY_QUORUM_ID=${quorumId}`,
    '',
  ]
  writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 })
  console.log(`wrote ${ENV_PATH} (mode 600)`)

  // (f) summary
  console.log('summary:')
  console.log(`  quorum   ${quorumId}`)
  console.log(`  policy   ${policyId}`)
  console.log(`  wallet   ${walletId}`)
  console.log(`  address  ${address}`)
  console.log(`  registry ${registry}`)
}

const i = process.argv.indexOf('--set-registry')
if (i >= 0) {
  const addr = process.argv[i + 1]
  if (!addr) {
    console.error('--set-registry needs an address')
    process.exit(1)
  }
  await setRegistry(addr)
} else {
  await bootstrap()
}
