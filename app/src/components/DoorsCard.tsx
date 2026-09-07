import type { Address } from 'viem'
import { POOL } from '../config'
import { useEligible, useRegistryTx } from '../lib/chain'
import { shortHex } from '../lib/format'
import { TxLine } from './TxLine'

export function DoorsCard({ address }: { address?: Address }) {
  const eligible = useEligible(address)
  const open = Boolean(eligible)
  const { tx, subscribe } = useRegistryTx(address)
  return (
    <section className={`card${address ? '' : ' locked'}`}>
      <h2>
        <span className="n">4</span>Two doors, one decision
      </h2>
      <p className="lead">Both consumers call isEligible on the registry. Revoke closes both at once.</p>
      <div className="doors">
        <div className="door">
          <h3>Subscribe</h3>
          <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
          <p className="hint">Subscription.subscribe() mints the demo amount of FundToken; the token's transfer hook checks eligibility again.</p>
          <button type="button" className="btn btn-mint" disabled={!open || tx.status === 'pending'} onClick={() => void subscribe().catch(() => {})}>
            {tx.status === 'pending' ? 'Sending' : 'Subscribe'}
          </button>
        </div>
        <div className="door">
          <h3>Swap</h3>
          <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
          <p className="hint">{POOL ? `Uniswap permissioned pool ${shortHex(POOL, 6)} reads the same registry.` : 'Uniswap permissioned pool reads the same registry.'}</p>
          <button type="button" className="btn btn-blue" disabled title={POOL ? undefined : 'pool arrives with WP7'}>
            {POOL ? 'Swap' : 'pool arrives with WP7'}
          </button>
        </div>
      </div>
      <TxLine tx={tx} />
    </section>
  )
}
