/**
 * zkPassport route (WP33): turns the SDK's Solidity parameters into the registry call. Pure functions,
 * no React, so the encoding is testable and the card stays small.
 */
import { concatHex, encodeAbiParameters, type Address, type Hex } from 'viem'
import type { Decision } from '../../lib/types'
import { ZKPASSPORT_BITS, ZKPASSPORT_DECISION_TTL_SECONDS, ZKPASSPORT_ROUTE_TAG } from './config'

/** Shape of getSolidityVerifierParameters' result (struct ProofVerificationParams in Solidity). */
export interface SolidityParams {
  version: Hex
  proofVerificationData: { vkeyHash: Hex; proof: Hex; publicInputs: Hex[] }
  committedInputs: Hex
  serviceConfig: { validityPeriodInSeconds: number | bigint; domain: string; scope: string; devMode: boolean }
}

export const PARAMS_ABI = [
  {
    type: 'tuple',
    name: 'params',
    components: [
      { name: 'version', type: 'bytes32' },
      {
        name: 'proofVerificationData',
        type: 'tuple',
        components: [
          { name: 'vkeyHash', type: 'bytes32' },
          { name: 'proof', type: 'bytes' },
          { name: 'publicInputs', type: 'bytes32[]' },
        ],
      },
      { name: 'committedInputs', type: 'bytes' },
      {
        name: 'serviceConfig',
        type: 'tuple',
        components: [
          { name: 'validityPeriodInSeconds', type: 'uint256' },
          { name: 'domain', type: 'string' },
          { name: 'scope', type: 'string' },
          { name: 'devMode', type: 'bool' },
        ],
      },
    ],
  },
] as const

/** Proof argument for attestWithProof: ROUTE_TAG || abi.encode(params). */
export function encodeProofArgument(params: SolidityParams): Hex {
  const encoded = encodeAbiParameters(PARAMS_ABI, [
    {
      version: params.version,
      proofVerificationData: params.proofVerificationData,
      committedInputs: params.committedInputs,
      serviceConfig: { ...params.serviceConfig, validityPeriodInSeconds: BigInt(params.serviceConfig.validityPeriodInSeconds) },
    },
  ])
  return concatHex([ZKPASSPORT_ROUTE_TAG, encoded])
}

/** publicInputs[2] of every zkPassport proof is the date the phone generated it (unix seconds). */
export function proofTimestamp(params: SolidityParams): bigint {
  return BigInt(params.proofVerificationData.publicInputs[2])
}

/** Mirrors ZkPassportVerifier.expiryOf. */
export function decisionExpiry(params: SolidityParams): bigint {
  return proofTimestamp(params) + BigInt(ZKPASSPORT_DECISION_TTL_SECONDS)
}

/** The scoped nullifier of the document, public input [length-2]; the chain sees it in calldata. */
export function uniqueIdentifier(params: SolidityParams): Hex {
  const pi = params.proofVerificationData.publicInputs
  return pi[pi.length - 2]
}

export interface AttestCall {
  subject: Address
  decision: Decision
  proof: Hex
  publicInputs: [Hex, Hex, Hex, Hex]
}

/** Arguments of AttestationRegistry.attestWithProof(subject, decision, proof, publicInputs). */
export function attestCall(subject: Address, policyId: Hex, params: SolidityParams): AttestCall {
  const expiry = decisionExpiry(params)
  const decision: Decision = { policyId, bits: ZKPASSPORT_BITS, tier: 1, expiry, statusRef: `0x${'0'.repeat(64)}`, revoked: false }
  const word = (v: bigint): Hex => `0x${v.toString(16).padStart(64, '0')}`
  return {
    subject,
    decision,
    proof: encodeProofArgument(params),
    publicInputs: [word(BigInt(subject)), policyId, word(ZKPASSPORT_BITS), word(expiry)],
  }
}
