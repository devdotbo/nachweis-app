import type { Address } from 'viem'
import { useRegistryEvents } from '../lib/chain'
import { formatExpiry, shortAddress } from '../lib/format'
import type { StepState } from '../lib/journey'
import { RECEIPT_LABEL, useReceipts } from '../lib/receipts'
import { StateChip } from './Rail'
import { TxHash } from './TxLine'

function when(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Receipts of the transactions this app sent, optionally for one address. */
export function Receipts({ subject, emptyText }: { subject?: Address; emptyText: string }) {
  const all = useReceipts()
  const list = subject ? all.filter((r) => r.subject?.toLowerCase() === subject.toLowerCase() || r.from?.toLowerCase() === subject.toLowerCase()) : all
  if (list.length === 0) return <div className="empty">{emptyText}</div>
  return (
    <div className="receipts" data-testid="receipts">
      {list.map((r) => (
        <div className="receipt" key={r.hash}>
          <span className="when">{when(r.at)}</span>
          <span>
            <span className="what">{RECEIPT_LABEL[r.kind]}</span>
            {r.subject && !subject ? <span className="who"> {shortAddress(r.subject)}</span> : null}
          </span>
          <TxHash hash={r.hash} />
        </div>
      ))}
    </div>
  )
}

/** Registry events (chain logs) for one subject, newest first. */
export function SubjectEvents({ subject }: { subject: Address }) {
  const { events, loading } = useRegistryEvents()
  const mine = events.filter((e) => e.subject.toLowerCase() === subject.toLowerCase())
  if (loading && mine.length === 0)
    return (
      <div className="skeleton" aria-label="loading">
        <span style={{ width: '70%' }} />
        <span style={{ width: '50%' }} />
      </div>
    )
  if (mine.length === 0) return <div className="empty">No registry event for this address yet. The first one is Attested, written when the proof lands on chain.</div>
  return (
    <div className="tablewrap">
      <table className="data">
        <thead>
          <tr>
            <th>Event</th>
            <th>Block</th>
            <th>Details</th>
            <th>By</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {mine.map((e) => (
            <tr key={`${e.txHash}-${e.kind}`} className={e.kind.toLowerCase()}>
              <td>{e.kind}</td>
              <td>{e.blockNumber.toString()}</td>
              <td className="wrap">{e.kind === 'Attested' ? `bits 0x${e.bits?.toString(16)}, tier ${e.tier}, expiry ${formatExpiry(e.expiry ?? 0n)}` : e.kind === 'Approved' ? 'issuer approval, doors open' : 'approval withdrawn, doors closed'}</td>
              <td className="mono">{shortAddress(e.actor)}</td>
              <td>
                <TxHash hash={e.txHash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HistoryCard({ address, state }: { address?: Address; state?: StepState }) {
  return (
    <section className={`card${address ? '' : ' locked'}`} id="history">
      <h2>
        History
        <StateChip state={state} />
      </h2>
      <p className="lead">Transactions sent from this app in this browser session, and the registry's own event log for your address as read from the chain.</p>
      {address ? (
        <>
          <h3 className="muted">Receipts</h3>
          <Receipts subject={address} emptyText="No transaction sent from this browser yet." />
          <h3 className="muted">Registry events for this address</h3>
          <SubjectEvents subject={address} />
        </>
      ) : (
        <div className="empty">Connect a wallet to see its history.</div>
      )}
    </section>
  )
}
