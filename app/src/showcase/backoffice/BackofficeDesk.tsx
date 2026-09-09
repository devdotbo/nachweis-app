/**
 * Compliance desk panel (showcase "backoffice", WP38): the queue the desk service keeps, who confirmed,
 * the operator wallet's policy in plain words, receipts, and the refusal beats. The panel holds no key:
 * every transaction is sent by the desk service (local dev key, or the Privy server wallet).
 */
import { useCallback, useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { EventLog } from '../../components/EventLog'
import { TxHash } from '../../components/TxLine'
import { addressUrl } from '../../lib/explorer'
import { formatExpiry, shortAddress, shortHex } from '../../lib/format'
import { BACKOFFICE_URL, desk, ROLES, type DeskInfo, type ProbeKind, type ProbeResult, type Proposal, type Role } from './api'

const ROLE_LABEL: Record<Role, string> = { compliance: 'Compliance officer', operations: 'Operations officer' }
const STATUS_CLASS: Record<Proposal['status'], string> = { proposed: 'waiting', sending: 'waiting', confirmed: 'open', reverted: 'closed', refused: 'closed' }
const STATUS_TEXT: Record<Proposal['status'], string> = { proposed: 'waiting for confirmations', sending: 'sending', confirmed: 'confirmed on chain', reverted: 'reverted on chain', refused: 'refused before signing' }
const PROBES: { kind: ProbeKind; label: string; hint: string }[] = [
  { kind: 'transfer', label: 'Try to send 1 wei from the operator wallet', hint: 'A plain value transfer. The policy has no rule for it.' },
  { kind: 'attestByOperator', label: 'Try attestByOperator from the operator wallet', hint: 'An operator-only registry function the policy does not list. The desk cannot write evidence, only confirm or withdraw it.' },
  { kind: 'single-signature', label: 'Try approve with one signature', hint: 'The right function, one key. The 2 of 2 quorum is not met.' },
]

function refusedBy(r: ProbeResult): string {
  switch (r.by) {
    case 'privy-policy':
      return "refused by the wallet policy in Privy's secure enclave, before signing"
    case 'privy-quorum':
      return 'refused by the key quorum in Privy, before signing'
    case 'simulated-policy':
      return 'refused by the simulated policy checker (local mode)'
    case 'simulated-quorum':
      return 'refused by the simulated quorum count (local mode)'
    case 'not-refused':
      return 'NOT refused'
  }
}

function useDesk() {
  const [info, setInfo] = useState<DeskInfo>()
  const [queue, setQueue] = useState<Proposal[]>([])
  const [error, setError] = useState<string>()
  const refresh = useCallback(async () => {
    try {
      const [i, q] = await Promise.all([desk.info(), desk.queue()])
      setInfo(i)
      setQueue(q)
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void refresh()
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])
  return { info, queue, error, refresh }
}

export function BackofficeDesk() {
  const { info, queue, error, refresh } = useDesk()
  const [role, setRole] = useState<Role>('compliance')
  const [busy, setBusy] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [probe, setProbe] = useState<ProbeResult>()
  const [proposeAddr, setProposeAddr] = useState('')

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setActionError(undefined)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }
  const local = info?.mode === 'local'
  const receipts = queue.filter((p) => p.txHash)

  return (
    <main className="page console">
      <div className="page-head">
        <div>
          <h1>Compliance desk</h1>
          <p className="sub">Two officers, one operator wallet, one policy. This desk sees an address and its evidence. The issuer's compliance file stays with the issuer.</p>
        </div>
        {info ? (
          <div className="strip" aria-label="Counts">
            <span>
              Waiting <b>{queue.filter((p) => p.status === 'proposed').length}</b>
            </span>
            <span>
              Confirmed <b>{queue.filter((p) => p.status === 'confirmed').length}</b>
            </span>
            <span>
              Refused <b>{queue.filter((p) => p.status === 'refused' || p.status === 'reverted').length}</b>
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="banner warn">
          <strong>Desk service not reachable</strong>
          <span>
            {BACKOFFICE_URL}: {error}. Start it with scripts/showcase-backoffice-local.sh --keep (local mode) or showcase/backoffice/README.md (privy mode).
          </span>
        </div>
      ) : null}
      {info && local ? (
        <div className="banner info">
          <strong>Local mode, simulated.</strong>
          <span>The operator is a dev key on this machine; the 2 of 2 quorum and the policy are played by the desk itself. In privy mode Privy's secure enclave enforces both.</span>
        </div>
      ) : null}

      <section className="card" id="operator">
        <h2>Operator wallet</h2>
        <p className="lead">The only address the AttestationRegistry lets approve or revoke for this policy. Nothing in the system approves without it.</p>
        {info ? (
          <>
            <dl className="kv">
              <dt>Address</dt>
              <dd>
                {addressUrl(info.operator.address) ? (
                  <a href={addressUrl(info.operator.address)} target="_blank" rel="noreferrer">
                    {info.operator.address}
                  </a>
                ) : (
                  info.operator.address
                )}
              </dd>
              {info.operator.walletId ? (
                <>
                  <dt>Privy wallet id</dt>
                  <dd>{info.operator.walletId}</dd>
                </>
              ) : null}
              <dt>Key custody</dt>
              <dd className="plain">{info.operator.custody}</dd>
              <dt>Owner</dt>
              <dd className="plain">
                key quorum {info.quorum.threshold} of {info.quorum.members.length}: {info.quorum.members.map((m) => m.label).join(', ')}
                {info.quorum.id ? ` (id ${info.quorum.id})` : ''}, enforced by {info.quorum.enforcedBy === 'privy-tee' ? "Privy's secure enclave" : 'the desk (simulated)'}
              </dd>
              <dt>Policy</dt>
              <dd className="plain">
                {info.policy.name}
                {info.policy.id ? ` (id ${info.policy.id})` : ''}, enforced by {info.policy.enforcedBy === 'privy-tee' ? "Privy's secure enclave before signing" : 'the desk (simulated)'}
              </dd>
              <dt>Registry</dt>
              <dd>
                {info.registry} on chain {info.chainId}, policy {shortHex(info.policyId, 6)}
              </dd>
            </dl>
            <div className="list">
              {info.policy.rules.map((r) => (
                <div className="item" key={r.name}>
                  <div className="top">
                    <strong>{r.name}</strong>
                    <span className={`flag ${r.action === 'ALLOW' ? 'on' : ''}`}>{r.action}</span>
                  </div>
                  <p className="muted">
                    {r.method} when {r.conditions.join(', and ')}.
                  </p>
                </div>
              ))}
              <p className="caption">Everything else is denied: Privy's policy engine defaults to DENY when no rule resolves (Privy docs). A mint, a transfer or a change of verifier cannot be signed by this wallet, whoever asks.</p>
            </div>
            <details>
              <summary className="muted">Rule JSON as sent to Privy</summary>
              <pre className="raw">{JSON.stringify(info.policy.json, null, 2)}</pre>
            </details>
          </>
        ) : (
          <div className="skeleton" aria-label="loading">
            <span style={{ width: '70%' }} />
            <span style={{ width: '55%' }} />
          </div>
        )}
      </section>

      <section className="card" id="queue">
        <h2>Queue</h2>
        <p className="lead">The desk watches the registry's Attested events and proposes one approval per new evidence. An approval or a withdrawal is sent only after both officers confirmed: four eyes, then one transaction.</p>
        <div className="row">
          <span className="muted">Acting as</span>
          {ROLES.map((r) => (
            <button type="button" key={r} className={`btn btn-ghost btn-sm${role === r ? ' selected' : ''}`} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        {queue.length === 0 ? <div className="empty">No proposal yet. The first one appears when an Attested event lands on the registry.</div> : null}
        {queue.length > 0 ? (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Subject</th>
                  <th>Source</th>
                  <th>Confirmed by</th>
                  <th>Status</th>
                  <th>Transaction</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((p) => {
                  const mine = p.confirmations[role] !== undefined
                  const canConfirm = p.status === 'proposed' && !mine
                  return (
                    <tr key={p.id} className={p.status === 'confirmed' ? (p.kind === 'approve' ? 'approved' : 'revoked') : 'attested'}>
                      <td className="name">{p.kind}</td>
                      <td className="mono" title={p.subject}>
                        {shortAddress(p.subject)}
                      </td>
                      <td className="wrap">
                        {p.source === 'attested-event' && p.evidence ? (
                          <span className="muted">
                            Attested, bits 0x{BigInt(p.evidence.bits).toString(16)}, tier {p.evidence.tier}, expires {formatExpiry(BigInt(p.evidence.expiry))}, tx <TxHash hash={p.evidence.txHash} />
                          </span>
                        ) : (
                          <span className="muted">proposed by hand</span>
                        )}
                      </td>
                      <td className="wrap">
                        <div className="steps">
                          {ROLES.map((r) => (
                            <span key={r} className={`step${p.confirmations[r] !== undefined ? ' done' : ''}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="wrap">
                        <span className={`status ${STATUS_CLASS[p.status]}`}>{STATUS_TEXT[p.status]}</span>
                        {p.error ? <div className="err">{p.error}</div> : null}
                      </td>
                      <td>{p.txHash ? <TxHash hash={p.txHash} /> : <span className="muted">none</span>}</td>
                      <td>
                        <button type="button" className="btn btn-blue btn-sm" disabled={!canConfirm || busy !== undefined} onClick={() => act(p.id, () => desk.confirm(p.id, role))}>
                          {mine ? 'Confirmed' : `Confirm as ${role}`}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="field">
          <input className="input" placeholder="0x address" value={proposeAddr} onChange={(e) => setProposeAddr(e.target.value.trim())} aria-label="address to propose for" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!isAddress(proposeAddr) || busy !== undefined} onClick={() => act('propose-revoke', () => desk.propose('revoke', proposeAddr as Address))}>
            Propose revoke
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!isAddress(proposeAddr) || busy !== undefined} onClick={() => act('propose-approve', () => desk.propose('approve', proposeAddr as Address))}>
            Propose approve
          </button>
        </div>
        <p className="caption">Withdrawal is manual: one officer proposes revoke, the other confirms. An approve for an address without evidence is sent with both signatures and reverts on the registry (NoDecision): no evidence, no approval, even with two signatures.</p>
        {actionError ? <p className="err">{actionError}</p> : null}
      </section>

      <section className="card" id="refusals">
        <h2>What the operator wallet cannot do</h2>
        <p className="lead">Each button asks the desk to send something the policy or the quorum does not cover. The refusal comes back before anything is signed.</p>
        <div className="options">
          {PROBES.map((pr) => (
            <div className="option" key={pr.kind}>
              <span className="hint">{pr.hint}</span>
              <button type="button" className="btn btn-coral btn-sm" disabled={busy !== undefined} onClick={() => act(pr.kind, async () => setProbe(await desk.probe(pr.kind)))}>
                {pr.label}
              </button>
            </div>
          ))}
        </div>
        {probe ? (
          <div className={`note ${probe.refused ? 'coral' : 'mint'}`}>
            <strong>{probe.attempted}</strong>: {refusedBy(probe)}.
            <div className="err" style={{ marginTop: 6 }}>
              {probe.message}
            </div>
            {probe.txHash ? (
              <div>
                tx <TxHash hash={probe.txHash} />
              </div>
            ) : null}
          </div>
        ) : null}
        {info ? <p className="caption">{local ? 'Simulated: the desk evaluates the same rule JSON it would send to Privy. In privy mode the refusal text is Privy\'s, verbatim.' : "Privy's wording, verbatim."}</p> : null}
      </section>

      <section className="card" id="receipts">
        <h2>Receipts</h2>
        <p className="lead">Every transaction the desk sent from the operator wallet, with the confirmations behind it.</p>
        {receipts.length === 0 ? <div className="empty">No transaction yet.</div> : null}
        {receipts.length > 0 ? (
          <div className="receipts">
            {receipts.map((p) => (
              <div className="receipt" key={p.id}>
                <span className="when">{new Date(p.createdAt).toLocaleTimeString()}</span>
                <span>
                  <span className="what">
                    {p.kind} {shortAddress(p.subject)}
                  </span>{' '}
                  <span className="who">
                    confirmed by {Object.keys(p.confirmations).join(' and ')}
                    {p.gasUsed ? `, ${p.gasUsed} gas` : ''}
                    {p.status === 'reverted' ? ', reverted' : ''}
                  </span>
                </span>
                <TxHash hash={p.txHash!} />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <EventLog />

      <section className="card" id="honesty">
        <h2>What this demo is</h2>
        <div className="note">
          Official test wallet, sample identity on the investor side; in the local run the evidence comes from a mock proof verifier (simulated). No identity documents on chain, and nothing we could use to find her. Withdrawal is manual. Two authorization keys live on one demo server; in production each desk holds its own key. Operator wallet by Privy in privy mode: a server wallet whose key is reconstituted only inside Privy's secure enclave (Privy's wording), owned by a two-key quorum of the issuer's compliance and operations desks, and bound by a policy that allows approve and revoke on the AttestationRegistry and nothing else. Privy sees this wallet's transactions; it never sees identity evidence.
        </div>
      </section>
    </main>
  )
}
