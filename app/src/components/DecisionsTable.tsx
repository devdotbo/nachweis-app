import { useState } from 'react'
import type { Address, Hex } from 'viem'
import { POLICY_ID, POOL } from '../config'
import { useDecision, useEligible, useRegistryStatus, type RegistryTx } from '../lib/chain'
import { addressUrl } from '../lib/explorer'
import { formatExpiry, shortAddress, shortHex, tierLabel } from '../lib/format'
import type { Session } from '../lib/sessions'
import type { RegistryEvent } from '../lib/types'
import { TxLine } from './TxLine'

export interface SubjectRef {
  subject: Address
  policyId: Hex
  /** Block of the latest event, for ordering. */
  block: bigint
}

/** Every subject the registry has an event for, plus the sessions of this browser, newest first. */
export function subjectsOf(events: RegistryEvent[], sessions: Session[]): SubjectRef[] {
  const seen = new Map<string, SubjectRef>()
  for (const e of events) {
    const k = `${e.subject.toLowerCase()}:${e.policyId}`
    const cur = seen.get(k)
    if (!cur || e.blockNumber > cur.block) seen.set(k, { subject: e.subject, policyId: e.policyId, block: e.blockNumber })
  }
  for (const s of sessions) {
    const k = `${s.boundAddress.toLowerCase()}:${POLICY_ID}`
    if (!seen.has(k)) seen.set(k, { subject: s.boundAddress, policyId: POLICY_ID, block: 0n })
  }
  return [...seen.values()].sort((a, b) => (b.block > a.block ? 1 : b.block < a.block ? -1 : 0))
}

export type DecisionState = 'no evidence' | 'awaiting approval' | 'approved' | 'revoked' | 'expired'

export function decisionState(s: { hasDecision: boolean; approved: boolean; revoked: boolean; expiry: bigint }): DecisionState {
  if (!s.hasDecision) return 'no evidence'
  if (s.revoked) return 'revoked'
  if (s.expiry !== 0n && s.expiry <= BigInt(Math.floor(Date.now() / 1000))) return 'expired'
  return s.approved ? 'approved' : 'awaiting approval'
}

const STATE_CLASS: Record<DecisionState, string> = { 'no evidence': 'idle', 'awaiting approval': 'waiting', approved: 'open', revoked: 'closed', expired: 'closed' }

function DecisionRow({ ref, registry, locked, busy, setBusy }: { ref: SubjectRef; registry: RegistryTx; locked: boolean; busy?: string; setBusy: (id?: string) => void }) {
  const { decision, loading } = useDecision(ref.subject)
  const chain = useRegistryStatus(ref.subject)
  const eligible = Boolean(useEligible(ref.subject))
  const state = decisionState(chain)
  const id = ref.subject.toLowerCase()
  const url = addressUrl(ref.subject)
  const run = async (fn: () => Promise<void>) => {
    setBusy(id)
    try {
      await fn()
    } catch {
      /* shown by TxLine */
    } finally {
      setBusy(undefined)
    }
  }
  const canApprove = !locked && busy === undefined && chain.hasDecision && !chain.approved
  const canRevoke = !locked && busy === undefined && chain.hasDecision && !chain.revoked
  return (
    <tr className={state === 'approved' ? 'approved' : state === 'revoked' ? 'revoked' : chain.hasDecision ? 'attested' : ''} data-testid="decision-row">
      <td className="mono" title={ref.subject}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {shortAddress(ref.subject)}
          </a>
        ) : (
          shortAddress(ref.subject)
        )}
      </td>
      <td className="mono" title={ref.policyId}>
        {shortHex(ref.policyId, 4)}
      </td>
      {loading ? (
        <td colSpan={3} className="muted">
          reading the registry
        </td>
      ) : (
        <>
          <td>{chain.hasDecision ? `0x${decision.bits.toString(16)}` : ''}</td>
          <td>{chain.hasDecision ? tierLabel(decision.tier) : ''}</td>
          <td>{chain.hasDecision ? formatExpiry(chain.expiry) : ''}</td>
        </>
      )}
      <td>
        <span className={`status ${STATE_CLASS[state]}`}>{state}</span>
      </td>
      <td>{chain.hasDecision ? (chain.approved ? 'yes' : 'no') : ''}</td>
      <td>{chain.hasDecision ? (chain.revoked ? 'yes' : 'no') : ''}</td>
      <td>
        <span className={`status ${eligible ? 'open' : 'closed'}`}>{eligible ? 'open' : 'closed'}</span>
      </td>
      <td>{POOL ? <span className={`status ${eligible ? 'open' : 'closed'}`}>{eligible ? 'open' : 'closed'}</span> : <span className="muted">no pool</span>}</td>
      <td>
        <div className="actions">
          <button type="button" className="btn btn-mint btn-sm" disabled={!canApprove} onClick={() => void run(() => registry.approve(ref.subject, ref.policyId))}>
            {chain.revoked ? 'Re-approve' : 'Approve'}
          </button>
          <button type="button" className="btn btn-coral btn-sm" disabled={!canRevoke} onClick={() => void run(() => registry.revoke(ref.subject, ref.policyId))}>
            Revoke
          </button>
        </div>
      </td>
    </tr>
  )
}

/** Every decision the registry knows, one row per subject and policy, read live (statusOf, decisionOf, isEligible). */
export function DecisionsTable({ subjects, registry, locked, loading }: { subjects: SubjectRef[]; registry: RegistryTx; locked: boolean; loading: boolean }) {
  const [busy, setBusy] = useState<string>()
  return (
    <section className="card" id="decisions">
      <h2>Decisions</h2>
      <p className="lead">One row per subject address under this policy: the stored decision, the issuer's approval, and what each door answers right now. Both doors read the same registry, so they always agree.</p>
      {loading && subjects.length === 0 ? (
        <div className="skeleton" aria-label="loading">
          <span style={{ width: '90%' }} />
          <span style={{ width: '75%' }} />
        </div>
      ) : subjects.length === 0 ? (
        <div className="empty">No decision on chain for this policy yet. Rows appear when a proof is attested or a session is opened in this browser.</div>
      ) : (
        <div className="tablewrap">
          <table className="data" data-testid="decisions">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Policy</th>
                <th>Bits</th>
                <th>Tier</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Approved</th>
                <th>Revoked</th>
                <th>Subscribe</th>
                <th>Swap</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <DecisionRow key={`${s.subject}:${s.policyId}`} ref={s} registry={registry} locked={locked} busy={busy} setBusy={setBusy} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TxLine tx={registry.tx} />
    </section>
  )
}
