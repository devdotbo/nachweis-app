/**
 * zkPassport route (WP33): configuration mirrored from ZkPassportVerifier's immutables. Every value
 * here is checked on chain by the adapter; a mismatch shows up as a typed revert, never as a silent
 * acceptance. Shared config stays in src/config.ts; this file only reads VITE_ZKPASSPORT_*.
 */
import { keccak256, stringToBytes, type Hex } from 'viem'

const env = import.meta.env

function flag(v: string | undefined): boolean {
  return v === '1' || v === 'true'
}

function seconds(v: string | undefined, fallback: number): number {
  return v && /^\d+$/.test(v) ? Number(v) : fallback
}

/** VITE_ZKPASSPORT=1 renders the passport card. */
export const ZKPASSPORT: boolean = flag(env.VITE_ZKPASSPORT)
export const ZKPASSPORT_DOMAIN: string | undefined = env.VITE_ZKPASSPORT_DOMAIN && env.VITE_ZKPASSPORT_DOMAIN !== '' ? env.VITE_ZKPASSPORT_DOMAIN : undefined
export const ZKPASSPORT_SCOPE: string = env.VITE_ZKPASSPORT_SCOPE && env.VITE_ZKPASSPORT_SCOPE !== '' ? env.VITE_ZKPASSPORT_SCOPE : 'attestat-over18'
export const ZKPASSPORT_DEV_MODE: boolean = flag(env.VITE_ZKPASSPORT_DEV_MODE)
export const ZKPASSPORT_VALIDITY_SECONDS: number = seconds(env.VITE_ZKPASSPORT_VALIDITY, 7 * 24 * 3600)
export const ZKPASSPORT_DECISION_TTL_SECONDS: number = seconds(env.VITE_ZKPASSPORT_DECISION_TTL, 30 * 24 * 3600)

/** First 32 bytes of the proof argument; ZkPassportVerifier.ROUTE_TAG and EvidenceRouter dispatch on it. */
export const ZKPASSPORT_ROUTE_TAG: Hex = keccak256(stringToBytes('nachweis.zkpassport.v1'))
/** Decision.bits the adapter derives: identity evidence (1) | over 18 (2) | passport chip route (4). */
export const ZKPASSPORT_BITS = 7n
export const ZKPASSPORT_MIN_AGE = 18

/** zkPassport chain names the SDK's bind("chain", ...) accepts, by chain id. Other chains cannot be bound. */
export const ZKPASSPORT_CHAIN_NAMES: Record<number, string> = { 1: 'ethereum', 11155111: 'ethereum_sepolia', 8453: 'base' }
