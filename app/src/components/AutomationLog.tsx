import { AUTOMATION_URL } from '../config'
import { automation, useAutomationPoll } from '../lib/automation'
import { shortAddress } from '../lib/format'
import { TxHash } from './TxLine'

function when(at: number): string {
  return new Date(at).toISOString().replace('T', ' ').slice(11, 19)
}

/** The issuer's automation log (WP32): mode, the policies it holds per investor, the tick and policy lines. Rendered only with VITE_AUTOMATION_URL set. */
export function AutomationLog() {
  const { data, error, loading } = useAutomationPoll(() => automation.status(), [], 4000)
  if (!AUTOMATION_URL) return null
  const log = data ? [...data.log].reverse() : []
  return (
    <section className="card" id="automation">
      <h2>Standing orders: the issuer's automation</h2>
      <p className="lead">
        Automation by Privy: the issuer's key signs on the investor's wallet only under a policy copied from her on-chain decision. Revoke on chain, then the automation adds a deny rule to that policy. Privy enforces the policy; Privy does not read the chain.
      </p>
      {error ? <p className="err">automation: {error}</p> : null}
      {loading && !data ? <div className="empty">Waiting for the automation at {AUTOMATION_URL}.</div> : null}
      {data ? (
        <>
          <div className="row">
            <span className={`status ${data.simulated ? 'waiting' : 'open'}`}>{data.simulated ? 'simulated Privy policy (local)' : 'Privy'}</span>
            <span className="muted">
              {data.caption}. The automation polls the chain for Approved and Revoked every {Math.round(data.pollMs / 1000)} s{data.lastBlock ? `, last block ${data.lastBlock}` : ''}. Scheduler tick: simulated by the investor's Run the month button.
            </span>
          </div>
          {data.investors.length === 0 ? <div className="empty">No policy yet. One is created per investor when the registry emits Approved.</div> : null}
          {data.investors.length > 0 ? (
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Policy</th>
                    <th>Signer</th>
                    <th>Rules, in plain words</th>
                  </tr>
                </thead>
                <tbody>
                  {data.investors.map((p) => (
                    <tr key={p.address} className={p.denyAll ? 'revoked' : 'approved'}>
                      <td className="mono" title={p.address}>
                        {shortAddress(p.address)}
                      </td>
                      <td className="mono">{p.policyId}</td>
                      <td>
                        <span className={`status ${p.delegated ? 'open' : 'idle'}`}>{p.delegated ? 'delegated' : 'not delegated'}</span>
                      </td>
                      <td className="wrap">
                        {p.plain.map((line, i) => (
                          <div key={i}>
                            <b>{p.rules[i]?.action}</b> {line}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {log.length > 0 ? (
            <div className="tablewrap">
              <table className="data log">
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Kind</th>
                    <th>Line</th>
                    <th>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {log.slice(0, 60).map((e, i) => (
                    <tr key={`${e.at}-${i}`} className={`ev ${e.kind}${e.line.includes('DENIED') ? ' revoked' : e.line.startsWith('TICK OK') || e.line.startsWith('POLICY CREATED') ? ' approved' : ''}`}>
                      <td className="mono">{when(e.at)}</td>
                      <td>{e.kind}</td>
                      <td className="wrap">{e.line}</td>
                      <td>{e.hash ? <TxHash hash={e.hash} chars={6} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
