import { formatUnits, type Address } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { useEligible, useFundBalance, useRegistryStatus, useRegistryTx } from '../lib/chain'
import type { StepState } from '../lib/journey'
import { StateChip } from './Rail'
import { TxLine } from './TxLine'
import { SwapDoor } from './swap/SwapDoor'
import { SwapExplainer } from './swap/SwapExplainer'

export function DoorsCard({ address, state }: { address?: Address; state?: StepState }) {
  const eligible = useEligible(address)
  const chain = useRegistryStatus(address)
  const open = Boolean(eligible)
  const awaiting = chain.hasDecision && !chain.approved && !chain.revoked
  const { tx, subscribe } = useRegistryTx(address)
  const balance = useFundBalance(address)
  const queryClient = useQueryClient()
  // The subscribe receipt is awaited inside subscribe(); refresh the balance right after instead of waiting for the 8 s poll.
  const doSubscribe = () => void subscribe().then(() => queryClient.invalidateQueries()).catch(() => {})
  return (
    <section className={`card${address ? '' : ' locked'}`} id="doors">
      <h2>
        Two doors, one decision
        <StateChip state={state} />
      </h2>
      <p className="lead">The fund token and the Uniswap pool both ask the registry the same question: is this address eligible under this policy? Evidence on chain and the issuer's approval are both required. One revoke closes both.</p>
      {!address ? <div className="empty">Connect a wallet to see whether its doors are open.</div> : null}
      {awaiting ? (
        <p className="note" data-testid="doors-awaiting">
          Evidence on chain, awaiting issuer approval. Subscribe and Swap stay closed until the issuer approves.
        </p>
      ) : null}
      {chain.revoked ? <p className="note coral">Approval withdrawn by the issuer (manual revocation). Both doors are closed until the issuer re-approves.</p> : null}
      <div className="doors">
        <div className="door">
          <div className="head">
            <h3>Subscribe</h3>
            <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
          </div>
          <p className="hint">Mints the demo amount of the fund token to your address. The token's transfer check reads the registry again on delivery.</p>
          <button type="button" className="btn btn-mint" disabled={!open || tx.status === 'pending'} onClick={doSubscribe}>
            {tx.status === 'pending' ? 'Sending' : 'Subscribe'}
          </button>
          <p className="hint" data-testid="fund-balance">
            Fund token balance: <code>{balance === undefined ? '…' : formatUnits(balance, 18)}</code>
          </p>
        </div>
        <SwapDoor address={address} eligible={open} />
      </div>
      <TxLine tx={tx} />
      {address ? <SwapExplainer /> : null}
    </section>
  )
}
