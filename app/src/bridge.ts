/**
 * Bridge client. The bridge verifies the wallet's session signature, receives the
 * verifier outcome, runs the prover and sends attestWithProof with the operator
 * key. The investor never sends a transaction.
 *
 *   POST /sessions {bound_address} -> {session_id, nonce, openid4vp_uri?, request_uri?, mode, address_proof_message}
 *        (when VITE_BRIDGE_URL is set; the bridge creates the presentation request at the verifier itself)
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

/** Public values the bridge decodes from the prover output once the presentation is verified. */
export interface BridgePublicValues {
  issuer_key_hash: string
  vct_hash: string
  over18: number
  subject: string
  expiry: number
  nonce: string
}

/** The bridge's own view of a session, `GET /sessions/:id`, as far as the app reads it. */
export interface BridgeSessionRaw {
  state: BridgeState
  detail?: string
  error?: string
  address_verified?: boolean
  openid4vp_uri?: string | null
  request_uri?: string | null
  public_values?: BridgePublicValues | null
  tx_hash?: string | null
  updated_at?: string
}

export interface BridgeCreated {
  sessionId: string
  nonce: string
  openid4vpUri?: string
  requestUri?: string
  mode: 'verifier' | 'local'
}

/** `POST /sessions {bound_address}`: the bridge derives the nonce from the address, creates the verifier request (verifier mode) and binds the session to the address. */
export async function createBridgeSession(boundAddress: Address): Promise<BridgeCreated> {
  const res = await fetch(`${BRIDGE_URL}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ bound_address: boundAddress }),
  })
  if (!res.ok) throw new Error(`bridge ${res.status}: ${(await res.text().catch(() => '')) || 'session creation failed'}`)
  const body = (await res.json()) as Record<string, unknown>
  const id = String(body.session_id ?? '')
  if (!id) throw new Error('bridge: POST /sessions returned no session_id')
  return {
    sessionId: id,
    nonce: String(body.nonce ?? ''),
    openid4vpUri: typeof body.openid4vp_uri === 'string' && body.openid4vp_uri !== '' ? body.openid4vp_uri : undefined,
    requestUri: typeof body.request_uri === 'string' && body.request_uri !== '' ? body.request_uri : undefined,
    mode: body.mode === 'local' ? 'local' : 'verifier',
  }
}

/** `GET /sessions/:id` as the bridge returns it; `state: created` for an unknown id (404). */
export async function fetchBridgeSession(sessionId: string): Promise<BridgeSessionRaw> {
  const res = await fetch(`${BRIDGE_URL}/sessions/${encodeURIComponent(sessionId)}`, { headers: { accept: 'application/json' } })
  if (res.status === 404) return { state: 'created' }
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text().catch(() => '')}`)
  const body = (await res.json()) as Record<string, unknown>
  const raw = String(body.state ?? body.status ?? 'created')
  const state = (BRIDGE_STATES as readonly string[]).includes(raw) ? (raw as BridgeState) : 'created'
  return { ...(body as Omit<BridgeSessionRaw, 'state'>), state }
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
    const body = await fetchBridgeSession(sessionId)
    const tx = body.tx_hash ?? undefined
    const detail = body.detail ?? body.error ?? undefined
    return { state: body.state, txHash: tx && /^0x[0-9a-fA-F]{64}$/.test(tx) ? (tx as Hex) : undefined, detail }
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
