import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { bridge } from '../bridge'
import { handoffJson, handoffUri } from '../lib/handoff'
import { updateSession, type Session } from '../lib/sessions'

/**
 * Two-device flow. The wallet signed the session in this browser; the phone prover joins the
 * same bridge session and proves there. The QR carries the compact handoff JSON; the URI below
 * it is the same for pasting into the phone app. The phone shows the wallet QR itself; this
 * browser only waits for GET /sessions/:id to flip to attested.
 */
export function HandoffCard({ session }: { session?: Session }) {
  const [qr, setQr] = useState<string>()
  const [copied, setCopied] = useState(false)
  const handoff = session?.handoff
  const sessionId = session?.request.sessionId
  const signed = session?.signature === 'signed'
  const isBridge = session?.request.mode === 'bridge' || session?.request.mode === 'mock'

  useEffect(() => {
    if (!sessionId || !signed || !isBridge || handoff || session?.handoffError) return
    let alive = true
    bridge
      .getHandoff(sessionId)
      .then((h) => {
        if (alive) updateSession(sessionId, { handoff: h, handoffError: undefined })
      })
      .catch((e: unknown) => {
        if (alive) updateSession(sessionId, { handoffError: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      alive = false
    }
  }, [sessionId, signed, isBridge, handoff, session?.handoffError])

  const payload = handoff ? handoffJson(handoff) : undefined
  useEffect(() => {
    if (!payload) {
      setQr(undefined)
      return
    }
    let alive = true
    QRCode.toDataURL(payload, { margin: 1, width: 360, errorCorrectionLevel: 'M', color: { dark: '#070B1F', light: '#FFFFFF' } })
      .then((d) => {
        if (alive) setQr(d)
      })
      .catch(() => setQr(undefined))
    return () => {
      alive = false
    }
  }, [payload])

  if (!session || !isBridge) return null
  const uri = handoff ? handoffUri(handoff) : ''
  const state = session.bridge?.state
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section className={`card${signed ? '' : ' locked'}`}>
      <h2>
        <span className="n">2b</span>Prove on your phone
      </h2>
      <p className="lead">
        Alternative to the QR on the left: the phone app (Nachweis Prover) scans this handoff, requests the presentation from the wallet with the same challenge, proves on the phone and
        posts only the proof to this session. Your wallet signature above already binds the session to your address; the phone holds no key.
      </p>
      <div className="row">
        {!signed ? <span className="status idle">sign the session first</span> : null}
        {signed && !handoff && !session.handoffError ? <span className="status waiting">fetching handoff</span> : null}
        {handoff && (!state || state === 'created' || state === 'presented') ? <span className="status waiting">waiting for the phone's proof</span> : null}
        {handoff && (state === 'verified' || state === 'proving' || state === 'proved') ? <span className="status waiting">proof received, attesting</span> : null}
        {state === 'attested' || state === 'approved' || state === 'revoked' ? (
          <span className="status open">{session.bridge?.proofSystem?.startsWith('noir') ? 'attested from the phone' : 'attested without the phone'}</span>
        ) : null}
        {state === 'failed' ? <span className="status closed">failed</span> : null}
        {handoff ? (
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy handoff URI'}
          </button>
        ) : null}
      </div>
      {session.handoffError ? <p className="err">{session.handoffError}</p> : null}
      {handoff ? (
        <div className="qr">
          {qr ? <img src={qr} alt="QR code with the session handoff for the phone prover" /> : <div className="empty">rendering QR</div>}
          <div>
            <p className="muted">handoff URI (paste into the phone app)</p>
            <code className="link" style={{ display: 'block' }}>
              {uri}
            </code>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>session</dt>
              <dd>{handoff.sessionId}</dd>
              <dt>bound address</dt>
              <dd>{handoff.boundAddress}</dd>
              <dt>challenge</dt>
              <dd>{handoff.challengeHex}</dd>
              <dt>nonce</dt>
              <dd>{handoff.nonce}</dd>
              <dt>verifier</dt>
              <dd>{handoff.verifierUrl ?? 'not advertised (phone keeps its own)'}</dd>
              <dt>bridge</dt>
              <dd>{handoff.bridgeUrl}</dd>
              <dt>valid until</dt>
              <dd>{new Date(handoff.expiresAt * 1000).toLocaleTimeString()}</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  )
}
