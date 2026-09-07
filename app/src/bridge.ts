/**
 * Bridge client. The bridge verifies the wallet's session signature, receives the
 * verifier outcome, runs the prover and sends attestWithProof with the operator
 * key. The investor never sends a transaction.
 *
 *   POST /sessions/:id/address-proof {signature}   EIP-191 signature of "nachweis:session:<id>"
 *   GET  /sessions/:id -> {state: created|presented|verified|proving|proved|attested|failed, tx_hash?, detail?}
 *
 * Mock mode walks the state machine on a timer and writes the decision into the mock registry.
 */
import type { Address, Hex } from 'viem'
import { BRIDGE_URL, MOCK } from './config'
import { demoDecision } from './lib/decision'
import { MOCK_OPERATOR, mockAttest } from './lib/mockChain'
import { getSession } from './lib/sessions'

export const BRIDGE_STATES = ['created', 'presented', 'verified', 'proving', 'proved', 'attested', 'failed'] as const
export type BridgeState = (typeof BRIDGE_STATES)[number]

export interface BridgeSession {
  state: BridgeState
  txHash?: Hex
  detail?: string
}

export interface BridgeClient {
  submitAddressProof(sessionId: string, signature: Hex): Promise<void>
  getSession(sessionId: string): Promise<BridgeSession>
}

export function sessionMessage(sessionId: string): string {
  return `nachweis:session:${sessionId}`
}

export function isTerminal(state: BridgeState): boolean {
  return state === 'attested' || state === 'failed'
}

// ---------------------------------------------------------------------------

const httpClient: BridgeClient = {
  async submitAddressProof(sessionId, signature) {
    const res = await fetch(`${BRIDGE_URL}/sessions/${encodeURIComponent(sessionId)}/address-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ signature }),
    })
    if (!res.ok) throw new Error(`bridge ${res.status}: ${(await res.text().catch(() => '')) || 'address proof rejected'}`)
  },
  async getSession(sessionId) {
    const res = await fetch(`${BRIDGE_URL}/sessions/${encodeURIComponent(sessionId)}`, { headers: { accept: 'application/json' } })
    if (res.status === 404) return { state: 'created' }
    if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text().catch(() => '')}`)
    const body = (await res.json()) as Record<string, unknown>
    const raw = String(body.state ?? body.status ?? 'created')
    const state = (BRIDGE_STATES as readonly string[]).includes(raw) ? (raw as BridgeState) : 'created'
    const tx = (body.tx_hash ?? body.txHash ?? body.attest_tx) as string | undefined
    const detail = (body.detail ?? body.message ?? body.error) as string | undefined
    return { state, txHash: tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? (tx as Hex) : undefined, detail }
  },
}

// ---------------------------------------------------------------------------
// mock: presented at t0 (set by the mock verifier), then verified, proving (3 s), proved, attested
// ---------------------------------------------------------------------------

const MOCK_PROVING_MS = 3000
interface MockBridgeSession {
  boundAddress: Address
  proofSubmitted: boolean
  presentedAt?: number
  txHash?: Hex
  attesting?: Promise<Hex>
}
const mockBridge = new Map<string, MockBridgeSession>()

function mockEntry(sessionId: string): MockBridgeSession | undefined {
  const known = mockBridge.get(sessionId)
  if (known) return known
  const s = getSession(sessionId)
  if (!s) return undefined
  const fresh: MockBridgeSession = { boundAddress: s.boundAddress, proofSubmitted: false }
  mockBridge.set(sessionId, fresh)
  return fresh
}

const mockClient: BridgeClient = {
  async submitAddressProof(sessionId) {
    await new Promise((r) => setTimeout(r, 300))
    const e = mockEntry(sessionId)
    if (!e) throw new Error('unknown session')
    e.proofSubmitted = true
  },
  async getSession(sessionId) {
    const e = mockEntry(sessionId)
    const s = getSession(sessionId)
    if (!e || !s) return { state: 'created' }
    if (s.state === 'pending') return { state: 'created', detail: 'waiting for the wallet' }
    if (s.state === 'rejected') return { state: 'failed', detail: s.reason }
    if (!e.proofSubmitted) return { state: 'presented', detail: 'waiting for the wallet signature of the session' }
    e.presentedAt ??= Date.now()
    const t = Date.now() - e.presentedAt
    if (t < 1000) return { state: 'verified', detail: 'presentation verified, nonce binds the address' }
    if (t < 1000 + MOCK_PROVING_MS) return { state: 'proving', detail: 'generating proof, 430k cycles' }
    if (t < 1500 + MOCK_PROVING_MS) return { state: 'proved', detail: 'Groth16 proof ready, sending attestWithProof' }
    if (!e.txHash) {
      e.attesting ??= mockAttest(e.boundAddress, demoDecision(sessionId), MOCK_OPERATOR)
      e.txHash = await e.attesting
    }
    return { state: 'attested', txHash: e.txHash, detail: 'attestWithProof confirmed' }
  },
}

export const bridge: BridgeClient = MOCK ? mockClient : httpClient
