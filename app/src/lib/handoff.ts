/**
 * Two-device handoff: the browser bound the bridge session to the wallet (EIP-191 address
 * proof); the phone prover, which holds no Ethereum key, joins that session. It needs the
 * session id, the bound address and the SAME challenge (so the KB-JWT nonce it requests from
 * the relay equals the bridge session's nonce), plus the verifier and bridge URLs.
 *
 * Wire forms, produced here and parsed by prover-android (Handoff.kt) and the companion
 * (`companion handoff`):
 *   compact JSON, for the QR:  {"v":1,"s":"<session_id>","a":"0x<address>","c":"<challenge_hex>","r":"<verifier_url>","b":"<bridge_url>"}
 *   URI, for copy and paste:   nachweis://handoff?v=1&s=...&a=...&c=...&r=...&b=...
 */
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'

export interface Handoff {
  sessionId: string
  boundAddress: Address
  /** 64 lowercase hex chars, no 0x. */
  challengeHex: string
  /** sha256(address20 || challenge32), 64 lowercase hex chars, as the bridge and the relay compute it. */
  nonce: string
  verifierUrl?: string
  bridgeUrl: string
  /** Unix seconds; the bridge stops answering GET /sessions/:id/handoff afterwards. */
  expiresAt: number
}

export interface HandoffCompact {
  v: 1
  s: string
  a: string
  c: string
  r?: string
  b: string
}

export function handoffCompact(h: Handoff): HandoffCompact {
  const c: HandoffCompact = { v: 1, s: h.sessionId, a: h.boundAddress.toLowerCase(), c: h.challengeHex, b: h.bridgeUrl }
  if (h.verifierUrl) c.r = h.verifierUrl
  return c
}

/** The QR payload: compact JSON with the keys in a fixed order. */
export function handoffJson(h: Handoff): string {
  return JSON.stringify(handoffCompact(h))
}

export function handoffUri(h: Handoff): string {
  const c = handoffCompact(h)
  const q = new URLSearchParams()
  q.set('v', '1')
  q.set('s', c.s)
  q.set('a', c.a)
  q.set('c', c.c)
  if (c.r) q.set('r', c.r)
  q.set('b', c.b)
  return `nachweis://handoff?${q.toString()}`
}

/** `GET /sessions/:id/handoff` as the bridge returns it. */
export interface HandoffRaw {
  session_id: string
  bound_address: string
  challenge_hex: string
  nonce: string
  verifier_url?: string | null
  bridge_url: string
  expires_at: number
}

export function handoffFromRaw(r: HandoffRaw): Handoff {
  return {
    sessionId: r.session_id,
    boundAddress: r.bound_address.toLowerCase() as Address,
    challengeHex: r.challenge_hex.replace(/^0x/, '').toLowerCase(),
    nonce: r.nonce.replace(/^0x/, '').toLowerCase(),
    verifierUrl: r.verifier_url ?? undefined,
    bridgeUrl: r.bridge_url,
    expiresAt: r.expires_at,
  }
}

/** nonce = sha256(bound_address_bytes || challenge_bytes), lowercase hex, 64 chars (mock mode computes it itself). */
export async function handoffNonce(boundAddress: Address, challengeHex: string): Promise<string> {
  const a = hexToBytes(boundAddress)
  const c = hexToBytes(`0x${challengeHex.replace(/^0x/, '')}` as Hex)
  const joined = new Uint8Array(a.length + c.length)
  joined.set(a, 0)
  joined.set(c, a.length)
  const digest = await crypto.subtle.digest('SHA-256', joined)
  return bytesToHex(new Uint8Array(digest)).slice(2)
}
