/** Environment of the payout desk (showcase/payout-desk/.env.example documents every name). Secrets are never logged. */
import { getAddress, keccak256, stringToBytes, type Address, type Hex } from 'viem'

export type SignerMode = 'privy' | 'local'

export interface Config {
  signer: SignerMode
  rpcUrl: string
  chainId: number
  registry: Address
  gate: Address
  token: Address
  policyId: Hex
  requiredBits: bigint
  /** Per-run cap in token units, enforced by the policy on `payout.total`. */
  cap: bigint
  port: number
  privy?: {
    appId: string
    appSecret: string
    walletId: string
    policyId?: string
    keyQuorumId?: string
    /** Officer A's authorization private key (base64 PKCS8). */
    keyA: string
    /** Officer B's authorization private key; present means the quorum is 2-of-2 and both sign every request. */
    keyB?: string
  }
  localTreasuryKey?: Hex
  officerTokens: { A: string; B: string }
  contractors: { label: string; address: Address }[]
}

const ZERO = '0x0000000000000000000000000000000000000000'

function address(env: NodeJS.ProcessEnv, name: string): Address {
  const v = env[name]?.trim()
  if (!v || v === ZERO) throw new Error(`${name} is not set`)
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not an address`)
  return getAddress(v)
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim()
  if (!v) throw new Error(`${name} is not set (PAYOUT_SIGNER=privy needs it)`)
  return v
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name]?.trim()
  return v ? v : undefined
}

function stripPrefix(key: string): string {
  return key.replace(/^wallet-auth:/, '')
}

export function parseContractors(spec: string | undefined): { label: string; address: Address }[] {
  if (!spec?.trim()) return []
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.lastIndexOf(':')
      const label = i > 0 ? entry.slice(0, i).trim() : ''
      const addr = i > 0 ? entry.slice(i + 1).trim() : entry
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error(`CONTRACTORS entry "${entry}" holds no address`)
      return { label: label || addr.slice(0, 10), address: getAddress(addr) }
    })
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const signer: SignerMode = env.PAYOUT_SIGNER === 'privy' ? 'privy' : 'local'
  const chainId = env.CHAIN_ID && /^\d+$/.test(env.CHAIN_ID) ? Number(env.CHAIN_ID) : signer === 'privy' ? 11155111 : 31337
  const policyId: Hex = env.POLICY_ID && /^0x[0-9a-fA-F]{64}$/.test(env.POLICY_ID) ? (env.POLICY_ID as Hex) : keccak256(stringToBytes('nachweis.pid.over18.v1'))
  const cfg: Config = {
    signer,
    rpcUrl: env.RPC_URL?.trim() || 'http://127.0.0.1:8545',
    chainId,
    registry: address(env, 'REGISTRY'),
    gate: address(env, 'GATED_PAYOUT'),
    token: address(env, 'PAYOUT_TOKEN'),
    policyId,
    requiredBits: env.REQUIRED_BITS && /^\d+$/.test(env.REQUIRED_BITS) ? BigInt(env.REQUIRED_BITS) : 3n,
    cap: env.PAYOUT_CAP && /^\d+$/.test(env.PAYOUT_CAP) ? BigInt(env.PAYOUT_CAP) : 1_000_000_000n,
    port: env.PORT && /^\d+$/.test(env.PORT) ? Number(env.PORT) : 8792,
    officerTokens: { A: env.OFFICER_A_TOKEN?.trim() || 'officer-a', B: env.OFFICER_B_TOKEN?.trim() || 'officer-b' },
    contractors: parseContractors(env.CONTRACTORS),
  }
  if (cfg.officerTokens.A === cfg.officerTokens.B) throw new Error('OFFICER_A_TOKEN and OFFICER_B_TOKEN must differ')
  if (signer === 'privy') {
    const keyB = optional(env, 'PRIVY_AUTHORIZATION_KEY_B')
    cfg.privy = {
      appId: required(env, 'PRIVY_APP_ID'),
      appSecret: required(env, 'PRIVY_APP_SECRET'),
      walletId: required(env, 'PRIVY_WALLET_ID'),
      policyId: optional(env, 'PRIVY_POLICY_ID'),
      keyQuorumId: optional(env, 'PRIVY_KEY_QUORUM_ID'),
      keyA: stripPrefix(required(env, 'PRIVY_AUTHORIZATION_KEY')),
      keyB: keyB ? stripPrefix(keyB) : undefined,
    }
  } else {
    const k = env.LOCAL_TREASURY_KEY?.trim() || '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
    if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('LOCAL_TREASURY_KEY is not a 32-byte hex key')
    cfg.localTreasuryKey = k as Hex
  }
  return cfg
}
