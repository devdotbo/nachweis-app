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

export function isEligibleLocally(d: Decision, requiredBits: bigint, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): boolean {
  return !d.revoked && d.expiry > nowSeconds && (d.bits & requiredBits) === requiredBits
}

export interface RegistryEvent {
  kind: 'Attested' | 'Revoked'
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
