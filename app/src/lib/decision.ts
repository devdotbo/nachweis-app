import { keccak256, stringToBytes, type Hex } from 'viem'
import { DECISION_TTL_SECONDS, POLICY_ID, REQUIRED_BITS, TIER_A } from '../config'
import type { Decision } from './types'

/** statusRef = keccak256(utf8 session id). Opaque on chain, traceable by the issuer. */
export function statusRefFor(sessionId: string): Hex {
  return keccak256(stringToBytes(sessionId))
}

/** The decision the demo policy writes: env bits, tier A, 30 days. */
export function demoDecision(sessionId: string): Decision {
  return {
    policyId: POLICY_ID,
    bits: REQUIRED_BITS,
    tier: TIER_A,
    expiry: BigInt(Math.floor(Date.now() / 1000) + DECISION_TTL_SECONDS),
    statusRef: statusRefFor(sessionId),
    revoked: false,
  }
}
