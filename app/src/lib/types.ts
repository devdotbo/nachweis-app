import type { Address, Hex } from 'viem'

/** Mirrors `struct Decision` in contracts/src/interfaces/IEligibility.sol. */
export interface Decision {
  policyId: Hex
  bits: bigint
  tier: number
  expiry: bigint
  statusRef: Hex
  revoked: boolean
}

export const EMPTY_DECISION: Decision = {
  policyId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  bits: 0n,
  tier: 0,
  expiry: 0n,
  statusRef: '0x0000000000000000000000000000000000000000000000000000000000000000',
  revoked: false,
}

export function hasDecision(d: Decision): boolean {
  return d.expiry !== 0n
}

/** Mirrors AttestationRegistry.isEligible: evidence (the decision) and issuer approval are both required. */
export function isEligibleLocally(d: Decision, approved: boolean, requiredBits: bigint, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): boolean {
  return approved && !d.revoked && d.expiry > nowSeconds && (d.bits & requiredBits) === requiredBits
}

/** Mirrors AttestationRegistry.statusOf(subject, policyId). */
export interface RegistryStatus {
  /** Evidence is stored (attestWithProof or attestByOperator). */
  hasDecision: boolean
  /** The issuer approved (approve or attestByOperator); cleared by revoke. */
  approved: boolean
  revoked: boolean
  expiry: bigint
}

export const EMPTY_STATUS: RegistryStatus = { hasDecision: false, approved: false, revoked: false, expiry: 0n }

export interface RegistryEvent {
  kind: 'Attested' | 'Approved' | 'Revoked'
  subject: Address
  policyId: Hex
  bits?: bigint
  tier?: number
  expiry?: bigint
  statusRef?: Hex
  actor: Address
  txHash: Hex
  blockNumber: bigint
}

export type TxState = { status: 'idle' } | { status: 'pending'; label: string } | { status: 'done'; hash: Hex } | { status: 'error'; message: string }
