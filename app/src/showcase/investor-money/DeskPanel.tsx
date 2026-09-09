/**
 * The issuer's side of the fund desk (showcase, investor money): pay a distribution from the operator's
 * treasury into the desk. Mounted on the issuer console when VITE_DESK is set; the operator wallet is the
 * desk's owner (DeployFundDesk.s.sol transfers ownership to OPERATOR_ADDRESS).
 */
import type { Address } from 'viem'
import { DESK } from '../../config'
import { useRegistryStatus } from '../../lib/chain'
import { addressUrl } from '../../lib/explorer'
import { shortHex } from '../../lib/format'
import { DISTRIBUTE_STABLE, MINT_STABLE, fmtStable, fmtUnits, useDeskAddresses, useDeskState, useDeskTx, useDistribution } from './desk'
import { DeskTxLine } from './DeskTxLine'

export function DeskPanel({ operator }: { operator?: Address }) {
  const addresses = useDeskAddresses()
  const state = useDeskState(addresses, operator)
  const status = useRegistryStatus(operator)
  const desk = useDeskTx(operator, addresses, status)
  const lastId = state.distributionCount !== undefined && state.distributionCount > 0n ? state.distributionCount - 1n : undefined
  const last = useDistribution(lastId)
  const busy = desk.tx.status === 'pending'
  const act = (fn: () => Promise<void>) => void fn().catch(() => {})
  const isOwner = Boolean(operator && addresses.owner && operator.toLowerCase() === addresses.owner.toLowerCase())
  const deskUrl = DESK ? addressUrl(DESK) : undefined
  if (!DESK) return null
  return (
    <section className={`card${operator ? '' : ' locked'}`} id="desk">
      <h2>Fund desk</h2>
      <p className="lead">
        Showcase, investor money: the desk {deskUrl ? <a href={deskUrl} target="_blank" rel="noreferrer">{shortHex(DESK, 6)}</a> : <code>{shortHex(DESK, 6)}</code>} takes stablecoin subscriptions and pays distributions and redemptions, each after the registry's isEligible for the investor. Paying a distribution is your action: it moves mUSD from this operator wallet into the desk, and every eligible holder claims its share.
      </p>
      {!operator ? <div className="empty">Connect the operator wallet to pay a distribution.</div> : null}
      {operator && addresses.owner && !isOwner ? <p className="note coral">This wallet is not the desk's owner ({shortHex(addresses.owner, 6)}); distribute would be refused.</p> : null}
      {operator ? (
        <>
          <dl className="kv plain">
            <dt>Units outstanding</dt>
            <dd data-testid="desk-outstanding">{state.outstandingUnits === undefined ? '…' : `${fmtUnits(state.outstandingUnits)} NDF`}</dd>
            <dt>Desk holds</dt>
            <dd>{state.deskStable === undefined ? '…' : `${fmtStable(state.deskStable)} mUSD`}</dd>
            <dt>Distributions paid</dt>
            <dd data-testid="desk-distributions">{state.distributionCount === undefined ? '…' : state.distributionCount.toString()}</dd>
            {last ? (
              <>
                <dt>Last distribution</dt>
                <dd>
                  {fmtStable(last.total)} mUSD over the units outstanding at that moment ({(Number(last.perUnit) / 1e6).toFixed(4)} mUSD per NDF)
                </dd>
              </>
            ) : null}
            <dt>Your treasury</dt>
            <dd>{state.operatorStable === undefined ? '…' : `${fmtStable(state.operatorStable)} mUSD`}</dd>
          </dl>
          <div className="row">
            <button type="button" className="btn btn-blue" disabled={busy || !addresses.stable} onClick={() => act(() => desk.distribute(DISTRIBUTE_STABLE))} data-testid="btn-distribute">
              Pay distribution {fmtStable(DISTRIBUTE_STABLE)} mUSD
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy || !addresses.stable} onClick={() => act(() => desk.mintStable(MINT_STABLE))} data-testid="btn-mint-operator">
              Get {fmtStable(MINT_STABLE)} test mUSD
            </button>
          </div>
          <DeskTxLine tx={desk.tx} />
          <p className="caption">Captions: the distribution is paid per unit over each holder's balance at claim time, without a snapshot (simulated); the treasury is test stablecoin anyone can mint; an amount, not a rate.</p>
        </>
      ) : null}
    </section>
  )
}
