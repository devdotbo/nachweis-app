import { useRegistryEvents } from '../lib/chain'
import { formatExpiry, shortAddress, shortHex } from '../lib/format'
import { TxHash } from './TxLine'

export function EventLog() {
  const { events, loading, error } = useRegistryEvents()
  return (
    <section className="card" id="history">
      <h2>Registry events</h2>
      <p className="lead">Attested, Approved and Revoked as the AttestationRegistry emitted them, read from the chain's logs, newest first. This is the audit trail: it does not depend on this browser.</p>
      {error ? <p className="err">Event log: {error}</p> : null}
      {loading && events.length === 0 ? (
        <div className="skeleton" aria-label="loading">
          <span style={{ width: '80%' }} />
          <span style={{ width: '65%' }} />
          <span style={{ width: '70%' }} />
        </div>
      ) : null}
      {!loading && events.length === 0 && !error ? <div className="empty">No event yet. The first Attested event is written when a proof lands on chain.</div> : null}
      {events.length > 0 ? (
        <div className="tablewrap">
          <table className="data log">
            <thead>
              <tr>
                <th>Event</th>
                <th>Block</th>
                <th>Subject</th>
                <th>Policy</th>
                <th>Details</th>
                <th>By</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr className={`ev ${e.kind.toLowerCase()}`} key={`${e.txHash}-${e.kind}-${e.subject}`}>
                  <td className="name">{e.kind}</td>
                  <td>{e.blockNumber.toString()}</td>
                  <td className="mono" title={e.subject}>
                    {shortAddress(e.subject)}
                  </td>
                  <td className="mono" title={e.policyId}>
                    {shortHex(e.policyId, 4)}
                  </td>
                  <td className="wrap">{e.kind === 'Attested' ? `bits 0x${e.bits?.toString(16)}, tier ${e.tier}, expiry ${formatExpiry(e.expiry ?? 0n)}, statusRef ${shortHex(e.statusRef ?? '', 4)}` : e.kind === 'Approved' ? 'approval, doors open' : 'approval withdrawn, doors closed'}</td>
                  <td className="mono" title={e.actor}>
                    {shortAddress(e.actor)}
                  </td>
                  <td>
                    <TxHash hash={e.txHash} chars={6} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
