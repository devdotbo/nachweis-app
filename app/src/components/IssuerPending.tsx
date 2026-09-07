import { useState } from 'react'
import type { Address } from 'viem'
import { POLICY_ID, REQUIRED_BITS } from '../config'
import { useRegistryTx } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { demoDecision, statusRefFor } from '../lib/decision'
import { updateSession, type Session } from '../lib/sessions'
import { TxLine } from './TxLine'

export function IssuerPending({ operator, sessions }: { operator?: Address; sessions: Session[] }) {
  const { tx, attest, revoke } = useRegistryTx(operator)
  const [busy, setBusy] = useState<string>()
  const locked = !operator

  const approve = async (s: Session) => {
    setBusy(s.request.sessionId)
    try {
      await attest(s.boundAddress, demoDecision(s.request.sessionId))
      updateSession(s.request.sessionId, { state: 'attested' })
    } catch {
      /* shown by TxLine */
    } finally {
      setBusy(undefined)
    }
  }

  const doRevoke = async (s: Session) => {
    setBusy(s.request.sessionId)
    try {
      await revoke(s.boundAddress, POLICY_ID)
      updateSession(s.request.sessionId, { state: 'revoked' })
    } catch {
      /* shown by TxLine */
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section className={`card${locked ? ' locked' : ''}`}>
      <h2>
        <span className="n">3</span>Presentations
      </h2>
      <p className="lead">
        Sessions created in this browser, verified by the verifier-service. Held in memory only. The bridge normally attests with attestWithProof; Approve is the operator path
        (attestByOperator: policy, bits 0x{REQUIRED_BITS.toString(16)}, tier A, 30 days, statusRef = keccak256(session id)) for the bound address.
      </p>
      {sessions.length === 0 ? <div className="empty">No presentations yet. Switch to Investor and create a request.</div> : null}
      <div className="list">
        {sessions.map((s) => (
          <div className="item" key={s.request.sessionId}>
            <div className="top">
              <code>{s.request.sessionId}</code>
              <StateBadge s={s} />
            </div>
            <div className="claims">
              <span className="k">subject</span>
              <span className="v">{s.boundAddress}</span>
              <span className="k">statusRef</span>
              <span className="v">{statusRefFor(s.request.sessionId)}</span>
              {s.receivedAt ? (
                <>
                  <span className="k">received</span>
                  <span className="v">{s.receivedAt}</span>
                </>
              ) : null}
              {(s.claims ?? []).map((c, i) => (
                <ClaimRow key={i} label={c.label} value={c.value} strength={c.strength} />
              ))}
            </div>
            {s.note ? <p className="note">{s.note}</p> : null}
            {s.reason ? <p className="note coral">rejected: {s.reason}</p> : null}
            <div className="row">
              <button
                type="button"
                className="btn btn-mint"
                disabled={locked || busy !== undefined || (s.state !== 'presented' && s.state !== 'revoked')}
                title="attestByOperator, the operator path"
                onClick={() => void approve(s)}
              >
                {busy === s.request.sessionId && tx.status === 'pending' && tx.label === 'attestByOperator' ? 'Attesting' : s.state === 'revoked' ? 'Re-attest' : 'Approve'}
              </button>
              <button type="button" className="btn btn-coral" disabled={locked || busy !== undefined || s.state !== 'attested'} onClick={() => void doRevoke(s)}>
                {busy === s.request.sessionId && tx.status === 'pending' && tx.label === 'revoke' ? 'Revoking' : 'Revoke'}
              </button>
              <span className="muted">{shortAddress(s.boundAddress)}</span>
            </div>
          </div>
        ))}
      </div>
      <TxLine tx={tx} />
    </section>
  )
}

function ClaimRow({ label, value, strength }: { label: string; value: string; strength: string }) {
  return (
    <>
      <span className="k">
        {label} <span className="strength">{strength}</span>
      </span>
      <span className="v">{value}</span>
    </>
  )
}

function StateBadge({ s }: { s: Session }) {
  switch (s.state) {
    case 'pending':
      return <span className="status waiting">waiting for wallet</span>
    case 'presented':
      return <span className="status waiting">presented, awaiting approval</span>
    case 'attested':
      return <span className="status open">attested</span>
    case 'revoked':
      return <span className="status closed">revoked</span>
    case 'rejected':
      return <span className="status closed">rejected</span>
  }
}
