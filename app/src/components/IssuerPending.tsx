import { useState } from 'react'
import type { Address } from 'viem'
import { POLICY_ID, REQUIRED_BITS } from '../config'
import { useRegistryStatus, useRegistryTx, type RegistryTx } from '../lib/chain'
import { shortAddress } from '../lib/format'
import { demoDecision, statusRefFor } from '../lib/decision'
import { updateSession, type Session } from '../lib/sessions'
import type { RegistryStatus } from '../lib/types'
import { TxLine } from './TxLine'

/**
 * Issuer view of the sessions this browser created. Two conditions open the doors: evidence on chain
 * (the proof the bridge or the phone attested) and the issuer's approval (registry.approve from the
 * operator signer). The badge and the buttons follow the chain (statusOf), not the session alone.
 */
export function IssuerPending({ operator, sessions }: { operator?: Address; sessions: Session[] }) {
  const registry = useRegistryTx(operator)
  const [busy, setBusy] = useState<string>()
  const locked = !operator

  return (
    <section className={`card${locked ? ' locked' : ''}`}>
      <h2>
        <span className="n">3</span>Presentations
      </h2>
      <p className="lead">
        Sessions created in this browser, verified by the verifier-service. Held in memory only. A proof puts the evidence on chain (attestWithProof); nothing opens until the
        issuer approves it here (registry.approve for the bound address under this policy). Revoke withdraws the approval, Re-approve restores it. The direct operator route
        (attestByOperator: bits 0x{REQUIRED_BITS.toString(16)}, tier A, 30 days, statusRef = keccak256(session id)) is the fallback when no proof route is available.
      </p>
      {sessions.length === 0 ? <div className="empty">No presentations yet. Switch to Investor and create a request.</div> : null}
      <div className="list">
        {sessions.map((s) => (
          <SessionRow key={s.request.sessionId} s={s} registry={registry} locked={locked} busy={busy} setBusy={setBusy} />
        ))}
      </div>
      <TxLine tx={registry.tx} />
    </section>
  )
}

function SessionRow({ s, registry, locked, busy, setBusy }: { s: Session; registry: RegistryTx; locked: boolean; busy?: string; setBusy: (id?: string) => void }) {
  const chain = useRegistryStatus(s.boundAddress)
  const { tx, approve, attest, revoke } = registry
  const id = s.request.sessionId
  const pending = (label: string) => busy === id && tx.status === 'pending' && tx.label === label

  const run = async (fn: () => Promise<void>, next: Session['state']) => {
    setBusy(id)
    try {
      await fn()
      updateSession(id, { state: next })
    } catch {
      /* shown by TxLine */
    } finally {
      setBusy(undefined)
    }
  }
  const doApprove = () => run(() => approve(s.boundAddress, POLICY_ID), 'approved')
  const doAttestDirect = () => run(() => attest(s.boundAddress, demoDecision(id)), 'approved')
  const doRevoke = () => run(() => revoke(s.boundAddress, POLICY_ID), 'revoked')

  const evidenceOnChain = chain.hasDecision
  const canApprove = !locked && busy === undefined && evidenceOnChain && !chain.approved && s.state !== 'rejected'
  const canRevoke = !locked && busy === undefined && evidenceOnChain && !chain.revoked && (chain.approved || s.state === 'attested' || s.state === 'approved')
  const canAttestDirect = !locked && busy === undefined && !evidenceOnChain && (s.state === 'presented' || s.state === 'proved')

  return (
    <div className="item">
      <div className="top">
        <code>{id}</code>
        <StateBadge s={s} chain={chain} />
      </div>
      <div className="claims">
        <span className="k">subject</span>
        <span className="v">{s.boundAddress}</span>
        <span className="k">statusRef</span>
        <span className="v">{statusRefFor(id)}</span>
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
      <p className="note">
        What Approve confirms: the presentation was verified by the issuer's verifier for this session (sample identity from the official test wallet), the bound address
        signed the session, and the issuer approves eligibility for that address. Sanctions and other checks: simulated in this build.
      </p>
      {s.note ? <p className="note">{s.note}</p> : null}
      {s.reason ? <p className="note coral">rejected: {s.reason}</p> : null}
      <div className="row">
        <button type="button" className="btn btn-mint" disabled={!canApprove} title="registry.approve(subject, policyId) from the operator signer" onClick={() => void doApprove()}>
          {pending('approve') ? 'Approving' : chain.revoked || s.state === 'revoked' ? 'Re-approve' : 'Approve'}
        </button>
        <button type="button" className="btn btn-coral" disabled={!canRevoke} title="registry.revoke(subject, policyId): closes both doors" onClick={() => void doRevoke()}>
          {pending('revoke') ? 'Revoking' : 'Revoke'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canAttestDirect}
          title="Fallback without a proof route: attestByOperator stores the decision and approves in one transaction"
          onClick={() => void doAttestDirect()}
        >
          {pending('attestByOperator') ? 'Attesting' : 'Attest directly (no proof, operator fallback)'}
        </button>
        <span className="muted">{shortAddress(s.boundAddress)}</span>
      </div>
    </div>
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

/** Chain first (statusOf), session state for the steps before anything is on chain. */
function StateBadge({ s, chain }: { s: Session; chain: RegistryStatus }) {
  if (s.state === 'rejected') return <span className="status closed">rejected</span>
  if (chain.hasDecision) {
    if (chain.revoked) return <span className="status closed">revoked</span>
    if (chain.approved) return <span className="status open">approved</span>
    return <span className="status waiting">attested (awaiting issuer approval)</span>
  }
  switch (s.state) {
    case 'pending':
      return <span className="status waiting">waiting for wallet</span>
    case 'presented':
      return <span className="status waiting">presented</span>
    case 'proved':
      return <span className="status waiting">proved</span>
    case 'attested':
      return <span className="status waiting">attested (awaiting issuer approval)</span>
    case 'approved':
      return <span className="status open">approved</span>
    case 'revoked':
      return <span className="status closed">revoked</span>
  }
}
