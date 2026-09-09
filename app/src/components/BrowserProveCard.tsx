import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { BROWSER_PHASES, BrowserProver, requestUriOf, type BrowserAvailability, type BrowserPhase } from '../lib/browserProver'
import type { StepState } from '../lib/journey'
import type { Session } from '../lib/sessions'
import { StateChip } from './Rail'

const PHASE_LABEL: Record<BrowserPhase, string> = {
  idle: 'ready',
  requesting: 'creating the relay request',
  waiting: 'waiting for the wallet',
  pickup: 'picking up the response',
  checking: 'decrypting and checking the statement',
  witness: 'generating the witness',
  init: 'starting bb.js (CRS, wasm, threads)',
  proving: 'proving (UltraHonk, keccak)',
  verifying: 'verifying in the tab',
  submitting: 'posting the proof to the bridge',
  submitted: 'submitted, attesting',
  failed: 'failed',
}

function stepClass(step: BrowserPhase, current: BrowserPhase): string {
  const i = BROWSER_PHASES.indexOf(step)
  const c = BROWSER_PHASES.indexOf(current)
  if (current === 'failed') return 'step failed'
  return i < c ? 'step done' : i === c ? 'step current' : 'step'
}

/**
 * "Prove in this browser" (docs/spec-browser-prover.md): the tab requests the presentation from
 * the relay with the bridge session's challenge, shows the wallet QR, picks up and decrypts the
 * JWE in a worker, proves with noir_js and bb.js, verifies, and posts only the proof to the bridge
 * session the wallet signed. The presentation never leaves the worker.
 */
export function BrowserProveCard({ session, picker, availability, state }: { session: Session; picker: ReactNode; availability: BrowserAvailability; state?: StepState }) {
  const [qr, setQr] = useState<string>()
  const b = session.browser
  const signed = session.signature === 'signed'
  const phase: BrowserPhase = b?.phase ?? 'idle'
  const busy = phase !== 'idle' && phase !== 'failed' && phase !== 'submitted'
  const uri = phase === 'waiting' ? b?.openid4vpUri : undefined
  const bridgeState = session.bridge?.state
  const attested = bridgeState === 'attested' || bridgeState === 'approved' || bridgeState === 'revoked'

  useEffect(() => {
    if (!uri) {
      setQr(undefined)
      return
    }
    let alive = true
    QRCode.toDataURL(uri, { margin: 1, width: 360, color: { dark: '#070B1F', light: '#FFFFFF' } })
      .then((d) => {
        if (alive) setQr(d)
      })
      .catch(() => setQr(undefined))
    return () => {
      alive = false
    }
  }, [uri])

  const start = () => {
    void new BrowserProver(session).run()
  }
  const elapsed = b?.startedAt ? ((b.finishedAt ?? Date.now()) - b.startedAt) / 1000 : undefined
  const requestUri = b?.openid4vpUri ? requestUriOf(b.openid4vpUri) : undefined

  return (
    <section className={`card${signed ? '' : ' locked'}`} id="prove">
      <h2>
        Prove in this browser
        <StateChip state={state} />
      </h2>
      {picker}
      <p className="lead">
        The proof is made in this browser tab. The tab asks the relay for your presentation with the same challenge your wallet signature bound to this session, decrypts the
        wallet's answer in a Web Worker, proves the statement with noir_js and bb.js on {availability.threads} cores, verifies the proof here and posts only the proof to the bridge.
        The relay passes the encrypted answer through unopened; the presentation stays in this tab's memory and is dropped after proving.
      </p>
      <div className="row">
        <button type="button" className="btn btn-yellow" onClick={start} disabled={!signed || busy || attested} data-testid="browser-start">
          {phase === 'idle' ? 'Prove in this browser' : phase === 'failed' ? 'Try again' : busy ? PHASE_LABEL[phase] : 'Proof submitted'}
        </button>
        {!signed ? <span className="status idle">sign the session first</span> : null}
        {signed && phase === 'idle' && !attested ? <span className="status idle">ready</span> : null}
        {busy ? <span className="status waiting" data-testid="browser-phase">{phase}</span> : null}
        {phase === 'submitted' ? <span className="status open" data-testid="browser-phase">{attested ? 'attested from this browser' : 'submitted'}</span> : null}
        {phase === 'failed' ? <span className="status closed" data-testid="browser-phase">failed</span> : null}
        {elapsed !== undefined ? <span className="muted">{elapsed.toFixed(1)} s</span> : null}
      </div>
      {b ? (
        <div className="steps">
          {BROWSER_PHASES.map((s) => (
            <span key={s} className={stepClass(s, phase)}>
              {s}
            </span>
          ))}
        </div>
      ) : null}
      {b?.note && busy ? <p className="muted">{b.note}</p> : null}
      {b?.error ? <p className="err">{b.error}</p> : null}
      {uri ? (
        <div className="qr">
          {qr ? <img src={qr} alt="QR code for the openid4vp request from this browser" /> : <div className="empty">rendering QR</div>}
          <div>
            <p className="muted">openid4vp link (scan with the wallet, or tap on the phone that holds it)</p>
            <a className="link" href={uri} style={{ display: 'block', textDecoration: 'none' }}>
              {uri}
            </a>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>relay session</dt>
              <dd>{b?.relaySessionId}</dd>
              <dt>request_uri</dt>
              <dd data-testid="browser-request-uri">{requestUri ?? b?.requestUri}</dd>
              <dt>client_id</dt>
              <dd>{b?.clientId}</dd>
            </dl>
          </div>
        </div>
      ) : null}
      {b?.publicInputs ? (
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>proof</dt>
          <dd>
            {b.proofBytes} bytes, 86 public inputs, verified in tab {String(b.verifiedInTab)}
          </dd>
          <dt>subject</dt>
          <dd>{b.publicInputs.subject}</dd>
          <dt>issuer key hash</dt>
          <dd>{b.publicInputs.issuer_key_hash}</dd>
          <dt>over 18</dt>
          <dd>{b.publicInputs.over18}</dd>
          <dt>expiry</dt>
          <dd>{new Date(b.publicInputs.expiry * 1000).toISOString()}</dd>
          <dt>nonce</dt>
          <dd>{b.publicInputs.nonce}</dd>
          {b.txHash ? (
            <>
              <dt>attest tx</dt>
              <dd data-testid="browser-tx">{b.txHash}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {b?.timingsMs ? (
        <p className="muted" data-testid="browser-timings">
          {JSON.stringify({ ...b.timingsMs, threads: b.threads, cross_origin_isolated: b.crossOriginIsolated, total_s: elapsed })}
        </p>
      ) : null}
      {b?.log.length ? (
        <pre className="raw browser-log" data-testid="browser-log">
          {b.log.join('\n')}
        </pre>
      ) : null}
    </section>
  )
}
