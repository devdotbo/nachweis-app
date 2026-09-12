import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { bridge, sessionMessage } from '../bridge'
import { verifier } from '../verifier'
import { addSession, updateSession, type Session } from '../lib/sessions'
import type { Wallet } from '../lib/wallet'
import type { StepState } from '../lib/journey'
import { StateChip } from './Rail'

export function PresentCard({ wallet, session, state }: { wallet: Wallet; session?: Session; state?: StepState }) {
  const address = wallet.address
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()
  const [qr, setQr] = useState<string>()
  const uri = session?.request.openid4vpUri

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
      .catch((e: unknown) => setError(String(e)))
    return () => {
      alive = false
    }
  }, [uri])

  /** Beat "wallet signs the session": EIP-191 signature of "nachweis:session:<id>", sent to the bridge. */
  const sign = async (sessionId: string) => {
    updateSession(sessionId, { signature: 'pending', signatureError: undefined })
    try {
      const signature = await wallet.signMessage(sessionMessage(sessionId))
      await bridge.submitAddressProof(sessionId, signature)
      updateSession(sessionId, { signature: 'signed' })
    } catch (e) {
      updateSession(sessionId, { signature: 'failed', signatureError: e instanceof Error ? e.message : String(e) })
    }
  }

  const create = async () => {
    if (!address) return
    setCreating(true)
    setError(undefined)
    try {
      const request = await verifier.createRequest(address)
      addSession({ request, boundAddress: address, createdAt: Date.now(), state: 'pending', signature: 'pending' })
      setCreating(false)
      await sign(request.sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCreating(false)
    }
  }

  const locked = !address
  return (
    <section className={`card${locked ? ' locked' : ''}`} id="present">
      <h2>
        Present your ID
        <StateChip state={state} />
      </h2>
      <p className="lead">
        Show three fields (given name, family name, over 18) from the official German EUDI test wallet, sample identity. Names reach the issuer's verifier only on the server route and stay in this browser tab on the browser route; never on chain. Your
        crypto wallet signs the session first, so the presentation is bound to this address; the ID wallet signs nothing on chain.
      </p>
      {locked ? <div className="empty">Connect a wallet first. The presentation request is bound to the connected address.</div> : null}
      <div className="row">
        <button type="button" className="btn btn-yellow" onClick={create} disabled={locked || creating}>
          {creating ? 'Creating request' : session ? 'New presentation request' : 'Create presentation request'}
        </button>
        {session ? <SessionBadge session={session} /> : null}
      </div>
      {session ? (
        <div className="sub">
          <span>Your wallet signs the session</span>
          {session.signature === 'pending' ? <span className="status waiting">waiting for signature</span> : null}
          {session.signature === 'signed' ? <span className="status open">signed, sent to bridge</span> : null}
          {session.signature === 'failed' ? (
            <>
              <span className="status closed">not signed</span>
              <button type="button" className="btn btn-ghost" onClick={() => void sign(session.request.sessionId)}>
                Retry
              </button>
            </>
          ) : null}
          <code className="muted">{sessionMessage(session.request.sessionId)}</code>
        </div>
      ) : null}
      {session?.signatureError ? <p className="err">{session.signatureError}</p> : null}
      {session ? (
        <div className="qr">
          {uri ? qr ? <img src={qr} alt="QR code for the openid4vp request" /> : <div className="empty">rendering QR</div> : null}
          <div>
            {uri ? (
              <>
                <p className="muted">openid4vp link (tap on the phone that holds the wallet)</p>
                <a className="link" href={uri} style={{ display: 'block', textDecoration: 'none' }}>
                  {uri}
                </a>
              </>
            ) : (
              <p className="muted">The wallet QR appears in the next step: the device that makes the proof (this browser, your phone or the desktop companion) requests the presentation from the wallet itself.</p>
            )}
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>session</dt>
              <dd>{session.request.sessionId}</dd>
              <dt>bound address</dt>
              <dd>{session.boundAddress}</dd>
              {session.request.mode === 'bridge' && session.request.nonce ? (
                <>
                  <dt>nonce (bridge)</dt>
                  <dd>{session.request.nonce}</dd>
                </>
              ) : null}
              {session.request.mode === 'relay' ? (
                <>
                  <dt>nonce (relay)</dt>
                  <dd>{session.request.nonce}</dd>
                  <dt>nonce (local)</dt>
                  <dd>
                    {session.request.localNonce}
                    {session.request.nonce && session.request.localNonce ? (session.request.nonce === session.request.localNonce ? ' (matches)' : ' (MISMATCH)') : null}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      ) : null}
      {session?.error ? <p className="err">{session.error}</p> : null}
      {session?.state === 'rejected' ? <p className="note coral">Presentation rejected: {session.reason}</p> : null}
      {error ? <p className="err">{error}</p> : null}
    </section>
  )
}

function SessionBadge({ session }: { session: Session }) {
  switch (session.state) {
    case 'pending':
      return <span className="status waiting">waiting for wallet</span>
    case 'presented':
      return <span className="status open">presented</span>
    case 'proved':
      return <span className="status open">presented, proved</span>
    case 'attested':
      return <span className="status waiting">attested, awaiting issuer approval</span>
    case 'approved':
      return <span className="status open">approved</span>
    case 'revoked':
      return <span className="status closed">revoked</span>
    case 'rejected':
      return <span className="status closed">rejected</span>
  }
}
