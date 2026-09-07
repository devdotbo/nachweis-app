import { keccak256, stringToBytes, type Address, type Hex } from 'viem'

const env = import.meta.env

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function addressOr(value: string | undefined, fallback: Address): Address {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : fallback
}

/** VITE_MOCK=1 runs the whole flow in memory: no verifier, no chain. */
export const MOCK = env.VITE_MOCK === '1' || env.VITE_MOCK === 'true'

export const VERIFIER_URL: string = (env.VITE_VERIFIER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
export const VERIFIER_MODE: 'service' | 'relay' = env.VITE_VERIFIER_MODE === 'relay' ? 'relay' : 'service'
/** The bridge verifies the wallet's session signature, runs the prover and sends attestWithProof with the operator key. Defaults to the verifier URL. */
export const BRIDGE_URL: string = (env.VITE_BRIDGE_URL && env.VITE_BRIDGE_URL !== '' ? env.VITE_BRIDGE_URL : VERIFIER_URL).replace(/\/+$/, '')

export const REGISTRY = addressOr(env.VITE_REGISTRY, ZERO_ADDRESS)
export const FUND_TOKEN = addressOr(env.VITE_FUND_TOKEN, ZERO_ADDRESS)
export const SUBSCRIPTION = addressOr(env.VITE_SUBSCRIPTION, ZERO_ADDRESS)
/** Optional. The Swap door stays disabled until a pool address is configured (WP7). */
export const POOL: Address | undefined = env.VITE_POOL && env.VITE_POOL !== '' ? addressOr(env.VITE_POOL, ZERO_ADDRESS) : undefined

/** Default policy: keccak256("nachweis.pid.over18.v1"). */
export const DEFAULT_POLICY_ID: Hex = keccak256(stringToBytes('nachweis.pid.over18.v1'))
export const POLICY_ID: Hex = env.VITE_POLICY_ID && /^0x[0-9a-fA-F]{64}$/.test(env.VITE_POLICY_ID) ? (env.VITE_POLICY_ID as Hex) : DEFAULT_POLICY_ID
export const REQUIRED_BITS: bigint = BigInt(env.VITE_REQUIRED_BITS ?? '3')
export const RPC_URL: string | undefined = env.VITE_RPC_URL && env.VITE_RPC_URL !== '' ? env.VITE_RPC_URL : undefined

/** Display labels for predicate bits. Decision bits: 1 = identity evidence (bit 0), 2 = over 18 (bit 1). */
export const BIT_LABELS: readonly string[] = ['identity evidence', 'over 18']
export const TIER_LABELS: Record<number, string> = { 0: 'none', 1: 'A', 2: 'B' }
export const TIER_A = 1
export const DECISION_TTL_SECONDS = 30 * 24 * 3600

export const CONFIG_WARNINGS: string[] = MOCK
  ? []
  : [
      REGISTRY === ZERO_ADDRESS ? 'VITE_REGISTRY is not set' : '',
      SUBSCRIPTION === ZERO_ADDRESS ? 'VITE_SUBSCRIPTION is not set' : '',
    ].filter(Boolean)
