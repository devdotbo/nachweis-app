/**
 * Environment to Config. Local mode needs no Privy credentials at all; privy mode needs the
 * app credentials plus the two officer authorization keys. Secret values are never logged.
 */
import { getAddress, keccak256, stringToBytes, type Address, type Hex } from 'viem'
import type { DeskMode } from './types'

export interface Config {
  mode: DeskMode
  rpcUrl: string
  chainId: number
  registry: Address
  /** Optional transfer probe target (the fund token); a burn address is used when unset. */
  fundToken?: Address
  policyId: Hex
  startBlock?: number
  pollMs: number
  port: number
  local?: { operatorKey: Hex }
  privy?: {
    appId: string
    appSecret: string
    complianceKey: string
    operationsKey: string
    walletId: string
    operatorAddress: Address
    policyId: string
    quorumId?: string
  }
}

/** Anvil account 3: the registry operator in the local showcase. */
export const ANVIL_OPERATOR_KEY: Hex = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'
export const DEFAULT_POLICY_ID: Hex = keccak256(stringToBytes('nachweis.pid.over18.v1'))

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim()
  if (!v) throw new Error(`missing environment variable ${name}`)
  return v
}

function intOr(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback
  const n = Number(v)
  if (!Number.isInteger(n)) throw new Error(`not an integer: ${v}`)
  return n
}

/** Privy prints authorization keys as "wallet-auth:<base64>"; the SDK wants the base64 alone. */
export function stripKeyPrefix(key: string): string {
  return key.trim().replace(/^wallet-auth:/, '')
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode: DeskMode = env.BACKOFFICE_MODE === 'privy' ? 'privy' : 'local'
  const cfg: Config = {
    mode,
    rpcUrl: env.RPC_URL?.trim() || 'http://127.0.0.1:8545',
    chainId: intOr(env.CHAIN_ID, mode === 'privy' ? 11155111 : 31337),
    registry: getAddress(required(env, 'REGISTRY')),
    fundToken: env.FUND_TOKEN?.trim() ? getAddress(env.FUND_TOKEN.trim()) : undefined,
    policyId: (env.POLICY_ID?.trim() || DEFAULT_POLICY_ID) as Hex,
    startBlock: env.START_BLOCK?.trim() ? intOr(env.START_BLOCK, 0) : undefined,
    pollMs: intOr(env.POLL_MS, 3000),
    port: intOr(env.PORT, 8794),
  }
  if (mode === 'local') {
    cfg.local = { operatorKey: (env.OPERATOR_PRIVATE_KEY?.trim() || ANVIL_OPERATOR_KEY) as Hex }
  } else {
    cfg.privy = {
      appId: required(env, 'PRIVY_APP_ID'),
      appSecret: required(env, 'PRIVY_APP_SECRET'),
      complianceKey: stripKeyPrefix(required(env, 'PRIVY_COMPLIANCE_KEY')),
      operationsKey: stripKeyPrefix(required(env, 'PRIVY_OPERATIONS_KEY')),
      walletId: required(env, 'PRIVY_OPERATOR_WALLET_ID'),
      operatorAddress: getAddress(required(env, 'PRIVY_OPERATOR_ADDRESS')),
      policyId: required(env, 'PRIVY_POLICY_ID'),
      quorumId: env.PRIVY_QUORUM_ID?.trim() || undefined,
    }
  }
  return cfg
}
