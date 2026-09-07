import { formatUnits, type Address } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { POOL } from '../config'
import { useEligible, useFundBalance, useRegistryTx } from '../lib/chain'
import { shortHex } from '../lib/format'
import { TxLine } from './TxLine'

export function DoorsCard({ address }: { address?: Address }) {
  const eligible = useEligible(address)
  const open = Boolean(eligible)
  const { tx, subscribe } = useRegistryTx(address)
  const balance = useFundBalance(address)
  const queryClient = useQueryClient()
  // The subscribe receipt is awaited inside subscribe(); refresh the balance right after instead of waiting for the 8 s poll.
  const doSubscribe = () => void subscribe().then(() => queryClient.invalidateQueries()).catch(() => {})
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
          <button type="button" className="btn btn-mint" disabled={!open || tx.status === 'pending'} onClick={doSubscribe}>
            {tx.status === 'pending' ? 'Sending' : 'Subscribe'}
          </button>
          <p className="hint" data-testid="fund-balance">
            FundToken balance: <code>{balance === undefined ? '…' : formatUnits(balance, 18)}</code>
          </p>
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
