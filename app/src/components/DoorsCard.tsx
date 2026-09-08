import { formatUnits, type Address } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { POOL } from '../config'
import { useEligible, useFundBalance, useRegistryStatus, useRegistryTx } from '../lib/chain'
import { addressUrl } from '../lib/explorer'
import type { StepState } from '../lib/journey'
import { shortHex } from '../lib/format'
import { StateChip } from './Rail'
import { TxLine } from './TxLine'

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
  const poolUrl = POOL ? addressUrl(POOL) : undefined
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
        <div className="door">
          <div className="head">
            <h3>Swap</h3>
            <span className={`status ${open && POOL ? 'open' : 'closed'}`}>{open && POOL ? 'open' : 'closed'}</span>
          </div>
          <p className="hint">
            {POOL ? (
              <>
                Uniswap v4 permissioned pool {poolUrl ? <a href={poolUrl} target="_blank" rel="noreferrer">{shortHex(POOL, 6)}</a> : <code>{shortHex(POOL, 6)}</code>}: its allowlist checker reads the same registry before every swap.
              </>
            ) : (
              'The Uniswap v4 permissioned pool reads the same registry before every swap. No pool address is configured for this deployment.'
            )}
          </p>
          <button type="button" className="btn btn-blue" disabled title={POOL ? 'In this build the swap is sent by the SwapPermissioned script; see docs/demo-runbook.md' : 'no pool configured (VITE_POOL)'}>
            Swap
          </button>
          <p className="hint">{POOL ? 'In this build the swap itself is sent by the SwapPermissioned script against this pool; the door state here is the same registry read the pool makes.' : 'Configure VITE_POOL after the pool is created to show its door.'}</p>
        </div>
      </div>
      <TxLine tx={tx} />
    </section>
  )
}
