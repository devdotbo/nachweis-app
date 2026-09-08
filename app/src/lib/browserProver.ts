/**
 * "Prove in this browser": the tab plays the holder's device of the blind-relay flow
 * (docs/spec-browser-prover.md). This module drives the main-thread part and hands the wallet's
 * JWE plus the ephemeral private key to the prover worker; the worker never posts the presentation
 * back. What leaves the tab: the relay request (public JWK, bound address, challenge), the status
 * polls, the one-time pickup, the CRS download by bb.js, and the proof to the bridge.
 */
import type { Address } from 'viem'
import type { DecodedPublicInputs } from '../../../shared/pid/public-inputs'
import { BRIDGE_URL, VERIFIER_URL } from '../config'
import type { ProveRequest, WorkerMessage, WorkerPhase } from '../prover/messages'
import { getSession, updateSession, type Session } from './sessions'

export type BrowserPhase = 'idle' | 'requesting' | 'waiting' | 'pickup' | WorkerPhase | 'submitting' | 'submitted' | 'failed'
export const BROWSER_PHASES: readonly BrowserPhase[] = ['requesting', 'waiting', 'pickup', 'checking', 'witness', 'init', 'proving', 'verifying', 'submitting', 'submitted']

export interface BrowserProve {
  phase: BrowserPhase
  /** Counts the attempts; a new attempt cancels the polling of an earlier one. */
  attempt: number
  startedAt?: number
  finishedAt?: number
  /** The relay's request for the wallet (QR and link) and its session, distinct from the bridge session. */
  openid4vpUri?: string
  requestUri?: string
  relaySessionId?: string
  clientId?: string
  note?: string
  log: string[]
  timingsMs?: Record<string, number>
  threads?: number
  crossOriginIsolated?: boolean
  proofBytes?: number
  publicInputs?: DecodedPublicInputs
  verifiedInTab?: boolean
  txHash?: string
  error?: string
}

export interface BrowserAvailability {
  ok: boolean
  reason?: string
  isolated: boolean
  threads: number
  ios: boolean
}

/** Default path when the page is cross-origin isolated (bb.js threads) and the device is not an iPhone or iPad. */
export function browserPathAvailability(): BrowserAvailability {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const threads = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1
  if (ios) return { ok: false, isolated, threads, ios, reason: 'iOS Safari caps wasm memory at 1 GiB in bb.js; this proof needs about 3 GB. Prove on your phone with the Nachweis Prover app or with the desktop companion.' }
  if (typeof Worker === 'undefined' || typeof SharedArrayBuffer === 'undefined' || !isolated)
    return { ok: false, isolated, threads, ios, reason: 'This page is not cross-origin isolated (COOP same-origin and COEP require-corp missing), so bb.js would prove single-threaded. Use the phone or the desktop companion.' }
  return { ok: true, isolated, threads, ios }
}

interface RelayCreated {
  session_id: string
  request_uri: string
  openid4vp_uri: string
  nonce: string
  bound_address: string
  pickup_url: string
  pickup_token: string
  status_url?: string
}

async function json<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.headers ?? {}) } })
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  return { status: res.status, body: body as T }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const stripToJson = (jwt: string, part: number) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jwt.split('.')[part].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))

/** Relay client for the tab; the worker takes over from the JWE. */
export class BrowserProver {
  private readonly sessionId: string
  private readonly attempt: number
  private worker?: Worker
  private log: string[] = []

  constructor(session: Session) {
    this.sessionId = session.request.sessionId
    this.attempt = (session.browser?.attempt ?? 0) + 1
  }

  private get live(): boolean {
    return getSession(this.sessionId)?.browser?.attempt === this.attempt
  }

  private patch(p: Partial<BrowserProve>) {
    if (!this.live) return
    const cur = getSession(this.sessionId)?.browser
    updateSession(this.sessionId, { browser: { ...(cur as BrowserProve), ...p, log: this.log } })
  }

  private note(line: string) {
    this.log = [...this.log, `${new Date().toISOString().slice(11, 23)} ${line}`]
    this.patch({})
  }

  cancel() {
    this.worker?.terminate()
    this.worker = undefined
  }

  async run(): Promise<void> {
    const session = getSession(this.sessionId)
    if (!session) return
    const avail = browserPathAvailability()
    updateSession(this.sessionId, {
      browser: { phase: 'requesting', attempt: this.attempt, startedAt: Date.now(), log: [], threads: avail.threads, crossOriginIsolated: avail.isolated },
    })
    const boundAddress = session.boundAddress.toLowerCase() as Address
    const challengeHex = session.request.challengeHex
    const bridgeNonce = session.request.nonce?.replace(/^0x/, '').toLowerCase()
    const verifierUrl = (session.handoff?.verifierUrl ?? VERIFIER_URL).replace(/\/+$/, '')
    try {
      if (!challengeHex || !bridgeNonce) throw new Error('the bridge session carries no challenge; the browser path needs bridge mode')
      if (!avail.ok) throw new Error(avail.reason ?? 'browser path unavailable')

      // 1. ephemeral key and relay request with the bridge session's address and challenge
      const key = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
      const pub = await crypto.subtle.exportKey('jwk', key.publicKey)
      const clientJwk = { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, use: 'enc', alg: 'ECDH-ES' }
      this.note(`ephemeral P-256 key generated (non-extractable); ${avail.threads} threads, cross-origin isolated ${avail.isolated}`)
      const created = await json<RelayCreated & { error?: string }>(`${verifierUrl}/relay/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_jwk: clientJwk, bound_address: boundAddress, challenge: `0x${challengeHex}` }),
      })
      if (created.status !== 201) throw new Error(`POST /relay/request: ${created.status} ${JSON.stringify(created.body)}`)
      const relay = created.body
      if (relay.nonce.replace(/^0x/, '').toLowerCase() !== bridgeNonce) throw new Error(`relay nonce ${relay.nonce} differs from the bridge session nonce ${bridgeNonce}`)
      this.note(`relay session ${relay.session_id} created, nonce equals the bridge session's`)

      // 2. the signed request object the wallet will see: our key, our nonce, direct_post.jwt (docs/blind-relay.md)
      const jarRes = await fetch(relay.request_uri)
      if (!jarRes.ok) throw new Error(`GET request object: ${jarRes.status}`)
      const jar = stripToJson((await jarRes.text()).trim(), 1)
      const keys = jar?.client_metadata?.jwks?.keys
      if (!Array.isArray(keys) || keys.length !== 1) throw new Error('request object does not advertise exactly one encryption key')
      if (keys[0].x !== pub.x || keys[0].y !== pub.y) throw new Error('the signed request advertises a different encryption key than ours; the relay is not blind')
      if (String(jar.nonce).toLowerCase() !== bridgeNonce) throw new Error(`the signed request carries nonce ${jar.nonce}, expected ${bridgeNonce}`)
      if (jar.response_mode !== 'direct_post.jwt') throw new Error(`response_mode is ${jar.response_mode}, expected direct_post.jwt`)
      this.note(`signed request checked: our key, our nonce, client_id ${jar.client_id}`)
      this.patch({ phase: 'waiting', openid4vpUri: relay.openid4vp_uri, requestUri: relay.request_uri, relaySessionId: relay.session_id, clientId: String(jar.client_id) })

      // 3. wait for the wallet
      const statusUrl = relay.status_url ?? `${verifierUrl}/relay/status/${encodeURIComponent(relay.session_id)}`
      let last = ''
      for (;;) {
        if (!this.live) return
        const s = await json<{ status: string }>(statusUrl)
        if (s.status !== 200) throw new Error(`GET relay status: ${s.status}`)
        if (s.body.status !== last) {
          last = s.body.status
          this.note(`relay status: ${last}`)
        }
        if (last === 'responded' || last === 'picked_up') break
        await sleep(2000)
      }

      // 4. one-time pickup
      this.patch({ phase: 'pickup' })
      const p = await json<{ jwe: string; nonce: string; bound_address: string; received_at?: string | number }>(relay.pickup_url, { headers: { 'x-pickup-token': relay.pickup_token } })
      if (p.status === 410) throw new Error('the response was already picked up (one-time pickup); nothing is stored any more')
      if (p.status !== 200) throw new Error(`GET pickup: ${p.status} ${JSON.stringify(p.body)}`)
      if (p.body.nonce.replace(/^0x/, '').toLowerCase() !== bridgeNonce) throw new Error('pickup nonce differs from the session nonce')
      this.note(`JWE picked up (${p.body.jwe.length} chars); handing it to the prover worker`)

      // 5. the worker: decrypt, check, derive inputs, witness, prove, verify
      const result = await this.runWorker({
        type: 'prove',
        jwe: p.body.jwe,
        privateKey: key.privateKey,
        boundAddress,
        challengeHex,
        nonce: bridgeNonce,
        circuitUrl: '/circuits/pid_sdjwt.json',
        threads: avail.threads,
        kbWindowSecs: 600,
        expectedVct: 'urn:eudi:pid:de:1',
      })
      if (!this.live) return
      if (result.decoded.subject.toLowerCase() !== boundAddress || result.decoded.nonce.replace(/^0x/, '').toLowerCase() !== bridgeNonce) throw new Error('the proof commits to a different subject or nonce than the bridge session')
      this.patch({ proofBytes: (result.proofHex.length - 2) / 2, publicInputs: result.decoded, verifiedInTab: result.verifiedInTab, timingsMs: result.timingsMs, threads: result.threads })

      // 6. the proof to the bridge session the wallet already signed
      this.patch({ phase: 'submitting' })
      const sub = await json<{ tx_hash?: string; attested?: unknown; error?: string }>(`${BRIDGE_URL}/sessions/${encodeURIComponent(this.sessionId)}/noir-proof`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proof_hex: result.proofHex, public_inputs_hex: result.publicInputsHex, tier: 1 }),
      })
      if (sub.status !== 200) throw new Error(`POST noir-proof: ${sub.status} ${JSON.stringify(sub.body)}`)
      this.note(`attested by the bridge in tx ${sub.body.tx_hash}`)
      this.patch({ phase: 'submitted', txHash: sub.body.tx_hash, finishedAt: Date.now() })
    } catch (e) {
      this.note(`failed: ${e instanceof Error ? e.message : String(e)}`)
      this.patch({ phase: 'failed', error: e instanceof Error ? e.message : String(e), finishedAt: Date.now() })
    } finally {
      this.cancel()
    }
  }

  private runWorker(req: ProveRequest): Promise<Extract<WorkerMessage, { type: 'done' }>> {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('../prover/prover.worker.ts', import.meta.url), { type: 'module', name: 'nachweis-prover' })
      this.worker = w
      w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
        const m = ev.data
        if (m.type === 'phase') this.patch({ phase: m.phase, note: m.note })
        else if (m.type === 'log') this.note(m.line)
        else if (m.type === 'done') {
          this.note(`worker done: proof ${(m.proofHex.length - 2) / 2} bytes, verified in tab ${m.verifiedInTab}, ${m.threads} threads`)
          resolve(m)
        } else reject(new Error(m.message))
      }
      w.onerror = (ev) => reject(new Error(ev.message || 'prover worker failed to load'))
      w.postMessage(req)
    })
  }
}

/** Convenience: the openid4vp:// URI's request_uri parameter, for scripts that play the wallet. */
export function requestUriOf(openid4vpUri: string): string | undefined {
  try {
    return new URL(openid4vpUri.replace(/^openid4vp:\/\//, 'https://x/')).searchParams.get('request_uri') ?? undefined
  } catch {
    return undefined
  }
}
