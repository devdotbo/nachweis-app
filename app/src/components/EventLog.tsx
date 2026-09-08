import { useRegistryEvents } from '../lib/chain'
import { formatExpiry, shortAddress, shortHex } from '../lib/format'

export function EventLog() {
  const { events, loading } = useRegistryEvents()
  return (
    <section className="card span2">
      <h2>
        <span className="n">4</span>Registry events
      </h2>
      <p className="lead">Attested, Approved and Revoked from the AttestationRegistry, newest first.</p>
      {loading ? <p className="muted">loading</p> : null}
      {!loading && events.length === 0 ? <div className="empty">No events yet.</div> : null}
      <div className="log">
        {events.map((e) => (
          <div className={`ev ${e.kind.toLowerCase()}`} key={`${e.txHash}-${e.kind}-${e.subject}`}>
            <span className="name">{e.kind}</span>
            <span>
              subject {shortAddress(e.subject)} policy {shortHex(e.policyId, 4)}
              {e.kind === 'Attested' ? ` bits 0x${e.bits?.toString(16)} tier ${e.tier} expiry ${formatExpiry(e.expiry ?? 0n)} statusRef ${shortHex(e.statusRef ?? '', 4)}` : ''}
              {' by '}
              {shortAddress(e.actor)} tx {shortHex(e.txHash, 6)} block {e.blockNumber.toString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
