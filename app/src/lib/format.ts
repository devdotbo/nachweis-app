import type { Decision } from './types'
import { BIT_LABELS, TIER_LABELS } from '../config'

export function shortAddress(a?: string): string {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : ''
}

export function shortHex(h: string, n = 10): string {
  return h.length > n * 2 + 2 ? `${h.slice(0, n + 2)}...${h.slice(-n)}` : h
}

export function formatExpiry(expiry: bigint): string {
  if (expiry === 0n) return 'none'
  return new Date(Number(expiry) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export function tierLabel(tier: number): string {
  return TIER_LABELS[tier] ?? String(tier)
}

export function bitFlags(bits: bigint): { label: string; on: boolean }[] {
  const out: { label: string; on: boolean }[] = []
  const count = Math.max(BIT_LABELS.length, bits === 0n ? 0 : bits.toString(2).length)
  for (let i = 0; i < count; i++) {
    out.push({ label: BIT_LABELS[i] ?? `bit ${i}`, on: ((bits >> BigInt(i)) & 1n) === 1n })
  }
  return out
}

export function decisionJson(d: Decision): string {
  return JSON.stringify(
    {
      policyId: d.policyId,
      bits: `0x${d.bits.toString(16)}`,
      tier: d.tier,
      expiry: d.expiry.toString(),
      statusRef: d.statusRef,
      revoked: d.revoked,
    },
    null,
    2,
  )
}
