/**
 * Verifier-service client.
 *
 * Mode "service": the endpoints the Rust verifier-service exposes today
 * (verifier-service/src/handlers.rs): GET /zk/ creates an mso_mdoc_zk request,
 * GET /zk/result/:id returns the outcome (404 while the wallet has not answered).
 *
 * Mode "relay": the planned blind-relay endpoints. The browser holds an
 * ephemeral P-256 key; the relay only ever sees the encrypted wallet response.
 *   POST /relay/request {client_jwk, bound_address, challenge}
 *     -> {session_id, request_uri, openid4vp_uri, nonce, pickup_url, pickup_token}
 *   GET  /relay/status/:id -> {status: pending|responded|picked_up}
 *   GET  /relay/response/:id (X-Pickup-Token) -> {jwe, nonce, received_at}
 *
 * Mode "mock" (VITE_MOCK=1): in-memory sessions with fake delays.
 */
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'
import { MOCK, VERIFIER_MODE, VERIFIER_URL } from './config'

export type VerifierMode = 'service' | 'relay' | 'mock'

export interface PresentationRequest {
  sessionId: string
  /** The openid4vp:// deep link (or the service's authorization request URL). */
  openid4vpUri: string
  requestUri?: string
  mode: VerifierMode
  /** Relay mode: nonce the relay derived, and the one computed locally for display. */
  nonce?: string
  localNonce?: string
  pickupUrl?: string
  pickupToken?: string
}

export type ClaimStrength = 'bound' | 'issuer_path' | 'asserted' | 'sample' | 'encrypted'

export interface ClaimLine {
  label: string
  value: string
  strength: ClaimStrength
}

export type PresentationStatus =
  | { state: 'pending' }
  | { state: 'presented'; claims: ClaimLine[]; receivedAt?: string; note?: string }
  | { state: 'rejected'; reason: string }

export interface VerifierClient {
  readonly mode: VerifierMode
  createRequest(boundAddress: Address): Promise<PresentationRequest>
  status(request: PresentationRequest): Promise<PresentationStatus>
}

async function getJson<T>(url: string, init?: RequestInit): Promise<{ ok: true; body: T } | { ok: false; status: number; text: string }> {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } })
  if (!res.ok) return { ok: false, status: res.status, text: await res.text().catch(() => '') }
  return { ok: true, body: (await res.json()) as T }
}

// ---------------------------------------------------------------------------
// service mode: the current /zk/ endpoints
// ---------------------------------------------------------------------------

interface ZkCreated {
  session: string
  authorization_request: string
  result: string
  demo: string
  format: string
}

interface DisclosureItem {
  category: string
  field: string
  label: string
  value: string
  strength: 'bound' | 'issuer_path' | 'asserted'
}

type ZkResult =
  | { status: 'verified'; result: { timestamp?: string; bound_claims?: { element_id: string; value_cbor_hex: string }[] }; disclosure_statement: DisclosureItem[] }
  | { status: 'rejected'; reason: unknown }

const serviceClient: VerifierClient = {
  mode: 'service',
  async createRequest() {
    const r = await getJson<ZkCreated>(`${VERIFIER_URL}/zk/`)
    if (!r.ok) throw new Error(`verifier-service ${r.status}: ${r.text || 'request creation failed'}`)
    return { sessionId: r.body.session, openid4vpUri: r.body.authorization_request, mode: 'service' }
  },
  async status(request) {
    const r = await getJson<ZkResult>(`${VERIFIER_URL}/zk/result/${encodeURIComponent(request.sessionId)}`)
    if (!r.ok) {
      if (r.status === 404) return { state: 'pending' }
      throw new Error(`verifier-service ${r.status}: ${r.text}`)
    }
    if (r.body.status === 'rejected') {
      const reason = typeof r.body.reason === 'string' ? r.body.reason : JSON.stringify(r.body.reason)
      return { state: 'rejected', reason }
    }
    const claims: ClaimLine[] = r.body.disclosure_statement.map((d) => ({
      label: `${d.category}: ${d.label}`,
      value: d.value,
      strength: d.strength,
    }))
    return { state: 'presented', claims, receivedAt: r.body.result.timestamp }
  },
}

// ---------------------------------------------------------------------------
// relay mode: planned blind-relay endpoints
// ---------------------------------------------------------------------------

interface RelayCreated {
  session_id: string
  request_uri: string
  openid4vp_uri: string
  nonce: string
  pickup_url: string
  pickup_token: string
}
interface RelayStatus {
  status: 'pending' | 'responded' | 'picked_up'
}
interface RelayResponse {
  jwe: string
  nonce: string
  received_at: string
}

/** Private keys live here only, never serialised, gone on reload. */
const relayKeys = new Map<string, CryptoKey>()

async function generateClientKey(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  return { privateKey: pair.privateKey, publicJwk }
}

/** nonce = sha256(bound_address_bytes || challenge_bytes), hex without 0x. */
export async function relayNonce(boundAddress: Address, challenge: Hex): Promise<string> {
  const a = hexToBytes(boundAddress)
  const c = hexToBytes(challenge)
  const joined = new Uint8Array(a.length + c.length)
  joined.set(a, 0)
  joined.set(c, a.length)
  const digest = await crypto.subtle.digest('SHA-256', joined)
  return bytesToHex(new Uint8Array(digest)).slice(2)
}

/**
 * TODO: decrypt the JWE (ECDH-ES, A128GCM) with the session's private key.
 * Needs a compact-JWE parser, ECDH-ES key agreement with Concat KDF (alg "ECDH-ES",
 * enc "A128GCM") via crypto.subtle.deriveBits + AES-GCM decrypt. Until then the
 * response is shown as received: an opaque encrypted blob.
 */
async function decryptRelayResponse(_privateKey: CryptoKey, jwe: string): Promise<ClaimLine[] | null> {
  void jwe
  return null
}

const relayClient: VerifierClient = {
  mode: 'relay',
  async createRequest(boundAddress) {
    const { privateKey, publicJwk } = await generateClientKey()
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32))
    const challenge = bytesToHex(challengeBytes)
    const localNonce = await relayNonce(boundAddress, challenge)
    const r = await getJson<RelayCreated>(`${VERIFIER_URL}/relay/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_jwk: publicJwk, bound_address: boundAddress, challenge }),
    })
    if (!r.ok) throw new Error(`relay ${r.status}: ${r.text || 'request creation failed'}`)
    relayKeys.set(r.body.session_id, privateKey)
    return {
      sessionId: r.body.session_id,
      openid4vpUri: r.body.openid4vp_uri,
      requestUri: r.body.request_uri,
      nonce: r.body.nonce,
      localNonce,
      pickupUrl: r.body.pickup_url,
      pickupToken: r.body.pickup_token,
      mode: 'relay',
    }
  },
  async status(request) {
    const s = await getJson<RelayStatus>(`${VERIFIER_URL}/relay/status/${encodeURIComponent(request.sessionId)}`)
    if (!s.ok) throw new Error(`relay ${s.status}: ${s.text}`)
    if (s.body.status === 'pending') return { state: 'pending' }
    const r = await getJson<RelayResponse>(request.pickupUrl ?? `${VERIFIER_URL}/relay/response/${encodeURIComponent(request.sessionId)}`, {
      headers: request.pickupToken ? { 'X-Pickup-Token': request.pickupToken } : {},
    })
    if (!r.ok) throw new Error(`relay pickup ${r.status}: ${r.text}`)
    const key = relayKeys.get(request.sessionId)
    const claims = key ? await decryptRelayResponse(key, r.body.jwe) : null
    return {
      state: 'presented',
      receivedAt: r.body.received_at,
      claims: claims ?? [
        { label: 'response', value: `JWE (${r.body.jwe.length} chars), decryption not implemented yet`, strength: 'encrypted' },
        { label: 'nonce', value: r.body.nonce, strength: 'asserted' },
      ],
      note: claims ? undefined : 'Relay mode: the response is encrypted to a key that only this browser holds. Decryption is a TODO.',
    }
  },
}

// ---------------------------------------------------------------------------
// mock mode
// ---------------------------------------------------------------------------

const MOCK_PRESENT_DELAY_MS = 4000
const mockSessions = new Map<string, { createdAt: number }>()

function mockId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  const h = bytesToHex(b).slice(2)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Sample identity of the German EUDI test wallet, as the verifier would report it. Not a real person. */
const MOCK_CLAIMS: ClaimLine[] = [
  { label: 'credential: document type', value: 'eu.europa.ec.eudi.pid.1', strength: 'sample' },
  { label: 'bound claim: age_over_18', value: 'true', strength: 'sample' },
  { label: 'bound claim: issuing_country', value: 'DE', strength: 'sample' },
  { label: 'issuer path: subject', value: 'CN=PID Issuer (test), C=DE', strength: 'sample' },
  { label: 'wallet: source', value: 'German EUDI test wallet, sample identity', strength: 'sample' },
]

const mockClient: VerifierClient = {
  mode: 'mock',
  async createRequest() {
    await new Promise((r) => setTimeout(r, 500))
    const id = mockId()
    mockSessions.set(id, { createdAt: Date.now() })
    return {
      sessionId: id,
      openid4vpUri: `openid4vp://?client_id=nachweis-demo&request_uri=${encodeURIComponent(`${VERIFIER_URL}/zk/request/${id}`)}`,
      mode: 'mock',
    }
  },
  async status(request) {
    const s = mockSessions.get(request.sessionId)
    if (!s) return { state: 'rejected', reason: 'unknown session' }
    if (Date.now() - s.createdAt < MOCK_PRESENT_DELAY_MS) return { state: 'pending' }
    return { state: 'presented', claims: MOCK_CLAIMS, receivedAt: new Date(s.createdAt + MOCK_PRESENT_DELAY_MS).toISOString() }
  },
}

export const verifier: VerifierClient = MOCK ? mockClient : VERIFIER_MODE === 'relay' ? relayClient : serviceClient
