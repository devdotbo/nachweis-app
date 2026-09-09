import { AutomationLog } from '../components/AutomationLog'
import { ConnectCard } from '../components/ConnectCard'
import { DecisionsTable, subjectsOf } from '../components/DecisionsTable'
import { EventLog } from '../components/EventLog'
import { Receipts } from '../components/HistoryCard'
import { IssuerPending } from '../components/IssuerPending'
import { RevokeByAddress } from '../components/RevokeByAddress'
import { AUTOMATION_URL, POLICY_ID, REQUIRED_BITS } from '../config'
import { useRegistryEvents, useRegistryTx } from '../lib/chain'
import { shortHex } from '../lib/format'
import { useSessions } from '../lib/sessions'
import type { Wallet } from '../lib/wallet'

const SECTIONS = [
  ['#queue', 'Queue'],
  ['#decisions', 'Decisions'],
  ['#history', 'Event history'],
  ...(AUTOMATION_URL ? ([['#automation', 'Standing orders']] as const) : []),
  ['#revoke', 'Revoke by address'],
] as const

export function IssuerScreen({ wallet }: { wallet: Wallet }) {
  const sessions = useSessions()
  const { events, loading } = useRegistryEvents()
  const registry = useRegistryTx(wallet.address)
  const subjects = subjectsOf(events, sessions)
  // Counts from the chain's own events (latest event per subject), plus the sessions still before evidence.
  const latest = new Map<string, string>()
  for (const e of events) {
    const k = `${e.subject.toLowerCase()}:${e.policyId}`
    if (!latest.has(k)) latest.set(k, e.kind)
  }
  let awaiting = 0
  let approved = 0
  let revoked = 0
  for (const kind of latest.values()) {
    if (kind === 'Attested') awaiting++
    else if (kind === 'Approved') approved++
    else revoked++
  }
  const pending = sessions.filter((s) => s.state === 'pending' || s.state === 'presented' || s.state === 'proved').length
  return (
    <main className="page console">
      <div className="page-head">
        <div>
          <h1>Issuer console</h1>
          <p className="sub">
            Policy {shortHex(POLICY_ID, 6)}, required bits 0x{REQUIRED_BITS.toString(16)}. Evidence arrives from proofs; approval and revocation are your decisions, each a transaction from the operator key.
          </p>
        </div>
        <div className="strip" aria-label="Counts">
          <span>
            Sessions before evidence <b>{pending}</b>
          </span>
          <span>
            Awaiting approval <b>{awaiting}</b>
          </span>
          <span>
            Approved <b>{approved}</b>
          </span>
          <span>
            Revoked <b>{revoked}</b>
          </span>
        </div>
      </div>
      <nav className="subnav" aria-label="Console sections">
        {SECTIONS.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <ConnectCard
        wallet={wallet}
        title="Connect operator wallet"
        lead="The operator key registered for this policy in the AttestationRegistry. It signs approve, revoke and the attestByOperator fallback; nothing else on this console sends a transaction."
        id="operator"
      />
      <IssuerPending operator={wallet.address} sessions={sessions} />
      <DecisionsTable subjects={subjects} registry={registry} locked={!wallet.address} loading={loading} />
      <section className="card" id="receipts">
        <h2>Transactions from this console</h2>
        <p className="lead">Receipts of what this browser sent since it was opened. The permanent record is the event history below.</p>
        <Receipts emptyText="Nothing sent from this browser yet." />
      </section>
      <EventLog />
      <AutomationLog />
      <RevokeByAddress operator={wallet.address} />
    </main>
  )
}
