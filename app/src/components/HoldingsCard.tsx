import { formatUnits, type Address } from 'viem'
import { FUND_TOKEN, POOL } from '../config'
import { useFundBalance } from '../lib/chain'
import { addressUrl } from '../lib/explorer'
import type { StepState } from '../lib/journey'
import { StateChip } from './Rail'

export function HoldingsCard({ address, state }: { address?: Address; state?: StepState }) {
  const balance = useFundBalance(address)
  const tokenUrl = addressUrl(FUND_TOKEN)
  return (
    <section className={`card${address ? '' : ' locked'}`} id="holdings">
      <h2>
        Holdings
        <StateChip state={state} />
      </h2>
      <p className="lead">What this address holds in the demo fund. The token's transfer check reads the same eligibility decision, so a revoked address cannot receive or send it.</p>
      {!address ? (
        <div className="empty">Connect a wallet to see its holdings.</div>
      ) : balance === undefined ? (
        <div className="skeleton" aria-label="loading">
          <span style={{ width: '40%' }} />
          <span style={{ width: '60%' }} />
        </div>
      ) : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Balance</th>
                <th>Contract</th>
                <th>Transfer check</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Demo fund token (NDF)</td>
                <td data-testid="holding-balance">{formatUnits(balance, 18)}</td>
                <td className="mono">{tokenUrl ? <a href={tokenUrl} target="_blank" rel="noreferrer">{FUND_TOKEN}</a> : FUND_TOKEN}</td>
                <td className="wrap">registry.isEligible on every transfer</td>
              </tr>
              {POOL ? (
                <tr>
                  <td>Uniswap permissioned pool</td>
                  <td>see pool</td>
                  <td className="mono">{POOL}</td>
                  <td className="wrap">allowlist checker reads the same registry</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      {address && balance === 0n ? <p className="caption">No fund token yet. Subscribe opens once the issuer has approved this address.</p> : null}
    </section>
  )
}
