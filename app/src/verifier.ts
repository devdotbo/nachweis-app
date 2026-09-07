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
 * Mode "bridge" (VITE_BRIDGE_URL set, the real-mode default): the session is
 * created at the bridge, POST /sessions {bound_address}. The bridge derives the
 * nonce from the address, creates the OpenID4VP request at the verifier itself
 * (its verifier mode) or waits for a posted presentation (its local mode), and
 * GET /sessions/:id reports the outcome. The app never talks to the verifier.
 * "service" and "relay" are only used when VITE_BRIDGE_URL is unset.
 *
 * Mode "mock" (VITE_MOCK=1): in-memory sessions with fake delays.
 */
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem'
import { createBridgeSession, fetchBridgeSession } from './bridge'
import { BRIDGE_CONFIGURED, MOCK, VERIFIER_MODE, VERIFIER_URL } from './config'

export type VerifierMode = 'bridge' | 'service' | 'relay' | 'mock'

export interface PresentationRequest {
  sessionId: string
  /** The openid4vp:// deep link (or the service's authorization request URL). */
  openid4vpUri: string
  requestUri?: string
  mode: VerifierMode
  /** Relay and bridge mode: nonce the server derived (relay: also the one computed locally, for display). */
  nonce?: string
  localNonce?: string
  /** Bridge mode: the 32-byte challenge behind the nonce (64 hex chars, no 0x), for the two-device handoff. */
  challengeHex?: string
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
// relay mode: blind-relay endpoints (verifier branch nachweis-relay)
// ---------------------------------------------------------------------------

interface RelayCreated {
  session_id: string
  request_uri: string
  openid4vp_uri: string
  nonce: string
  bound_address: string
  pickup_url: string
  pickup_token: string
  status_url?: string
  response_code?: string
}
interface RelayStatus {
  session_id: string
  status: 'pending' | 'responded' | 'picked_up'
  pickup_once?: boolean
}
interface RelayResponse {
  session_id: string
  jwe: string
  nonce: string
  bound_address: string
  received_at: string
}

/** Private keys live here only, never serialised, gone on reload. */
const relayKeys = new Map<string, CryptoKey>()
/** The relay hands out a response once (410 afterwards), so the pickup is kept in memory. */
const relayResponses = new Map<string, RelayResponse>()

async function generateClientKey(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey)
  const publicJwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, alg: 'ECDH-ES', use: 'enc' }
  return { privateKey: pair.privateKey, publicJwk }
}

/** nonce = sha256(bound_address_bytes || challenge_bytes), lowercase hex, 64 chars. */
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
    const challenge = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
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
    const cached = relayResponses.get(request.sessionId)
    if (!cached) {
      const s = await getJson<RelayStatus>(`${VERIFIER_URL}/relay/status/${encodeURIComponent(request.sessionId)}`)
      if (!s.ok) throw new Error(`relay ${s.status}: ${s.text}`)
      if (s.body.status === 'pending') return { state: 'pending' }
      const r = await getJson<RelayResponse>(request.pickupUrl ?? `${VERIFIER_URL}/relay/response/${encodeURIComponent(request.sessionId)}`, {
        headers: request.pickupToken ? { 'X-Pickup-Token': request.pickupToken } : {},
      })
      if (!r.ok) {
        if (r.status === 404) return { state: 'pending' }
        if (r.status === 410) return { state: 'presented', claims: [], note: 'The relay already handed this response out once (410). Nothing is cached in this browser.' }
        throw new Error(`relay pickup ${r.status}: ${r.text}`)
      }
      relayResponses.set(request.sessionId, r.body)
    }
    const body = relayResponses.get(request.sessionId)!
    const key = relayKeys.get(request.sessionId)
    const claims = key ? await decryptRelayResponse(key, body.jwe) : null
    return {
      state: 'presented',
      receivedAt: body.received_at,
      claims: claims ?? [
        { label: 'response', value: `JWE (${body.jwe.length} chars), decryption not implemented yet`, strength: 'encrypted' },
        { label: 'nonce', value: body.nonce, strength: 'asserted' },
        { label: 'bound address', value: body.bound_address, strength: 'asserted' },
      ],
      note: claims ? undefined : 'Relay mode: the response is encrypted to a key that only this browser holds. Decryption is a TODO.',
    }
  },
}

// ---------------------------------------------------------------------------
// bridge mode: POST /sessions at the bridge, outcome from GET /sessions/:id
// ---------------------------------------------------------------------------

const bridgeClient: VerifierClient = {
  mode: 'bridge',
  async createRequest(boundAddress) {
    const c = await createBridgeSession(boundAddress)
    return {
      sessionId: c.sessionId,
      // Local bridge mode has no wallet request: the presentation is posted to the bridge by a script.
      openid4vpUri: c.openid4vpUri ?? '',
      requestUri: c.requestUri,
      nonce: c.nonce,
      challengeHex: c.challengeHex,
      mode: 'bridge',
    }
  },
  async status(request) {
    const s = await fetchBridgeSession(request.sessionId)
    if (s.state === 'failed') return { state: 'rejected', reason: s.error ?? s.detail ?? 'bridge reported failed' }
    const pv = s.public_values
    if (s.state === 'created' || s.state === 'presented' || !pv) return { state: 'pending' }
    const claims: ClaimLine[] = [
      { label: 'bound claim: age_over_18', value: pv.over18 === 1 ? 'true' : 'false', strength: 'bound' },
      { label: 'bound claim: subject', value: pv.subject, strength: 'bound' },
      { label: 'bound claim: expiry', value: new Date(pv.expiry * 1000).toISOString(), strength: 'bound' },
      { label: 'issuer path: issuer key hash', value: pv.issuer_key_hash, strength: 'issuer_path' },
      { label: 'issuer path: vct hash', value: pv.vct_hash, strength: 'issuer_path' },
      { label: 'nonce', value: pv.nonce, strength: 'bound' },
    ]
    return {
      state: 'presented',
      claims,
      receivedAt: typeof s.updated_at === 'number' ? new Date(s.updated_at * 1000).toISOString() : s.updated_at,
      note: 'Public values of the proof statement, from the bridge. The presentation itself stays at the bridge; no name reaches this app.',
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
      challengeHex: bytesToHex(crypto.getRandomValues(new Uint8Array(32))).slice(2),
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

export const verifier: VerifierClient = MOCK ? mockClient : BRIDGE_CONFIGURED ? bridgeClient : VERIFIER_MODE === 'relay' ? relayClient : serviceClient
