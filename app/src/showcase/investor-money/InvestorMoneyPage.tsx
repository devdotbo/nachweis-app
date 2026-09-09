/**
 * Showcase, investor money (docs/showcase/investor-money.md): the fund desk for an investor who signed in with
 * email. Route /showcase/investor-money. The wallet comes from the app's wallet layer: the embedded wallet by
 * Privy when VITE_PRIVY_APP_ID is set, the dev signer or an extension otherwise. Eligibility comes from the
 * investor portal (present, prove, attest, issuer approves); this page only reads the decision and moves money.
 */
import { Link } from 'react-router'
import { ConnectCard } from '../../components/ConnectCard'
import { TxHash } from '../../components/TxLine'
import { DESK, MOCK } from '../../config'
import { useRegistryStatus } from '../../lib/chain'
import { addressUrl } from '../../lib/explorer'
import { formatExpiry, shortHex } from '../../lib/format'
import { PRIVY_ENABLED } from '../../lib/PrivyBoundary'
import { useWallet } from '../../lib/wallet'
import { DESK_RECEIPT_LABEL, DISTRIBUTE_STABLE, MINT_STABLE, REDEEM_UNITS, SUBSCRIBE_STABLE, fmtStable, fmtUnits, useDeskAddresses, useDeskReceipts, useDeskTx, useInvestorBalances } from './desk'
import { DeskTxLine } from './DeskTxLine'

/** Verbatim from wiki/privy-cases/investor-money/case.md section 8. Shown only while the build carries the Privy app id. */
const PRIVY_SENTENCE =
  'Wallet by Privy: an embedded wallet created when you sign in with email, so you can hold the fund units and the stablecoin without a seed phrase. Privy describes it as self-custodial and never sees your identity evidence; it sees this address and the transactions you confirm. Sample identity from the official test wallet; testnet funds.'

const IDENTITY_SENTENCE = 'No identity documents on chain, and nothing we could use to find you: the desk reads a policy id, predicate bits and an expiry against this address.'

function when(at: number): string {
  return new Date(at).toISOString().slice(11, 19) + ' UTC'
}

/** The route's component (src/showcase/registry.ts). The wallet is the investor's, like the product's investor portal. */
export function InvestorMoneyPage() {
  const wallet = useWallet('investor')
  const address = wallet.address
  const addresses = useDeskAddresses()
  const status = useRegistryStatus(address)
  const balances = useInvestorBalances(addresses, address)
  const desk = useDeskTx(address, addresses, status)
  const receipts = useDeskReceipts()
  const open = balances.eligible === true
  const busy = desk.tx.status === 'pending'
  const act = (fn: () => Promise<void>) => void fn().catch(() => {})
  const deskUrl = DESK ? addressUrl(DESK) : undefined
  const stateWord = status.revoked ? 'revoked' : !status.hasDecision ? 'no decision' : !status.approved ? 'awaiting approval' : open ? 'eligible' : 'expired'

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Fund desk</h1>
          <p className="sub">
            Subscribe in a test stablecoin, receive a distribution, claim it and redeem. Every movement of money out of the desk asks the AttestationRegistry the same question the fund token and the pool ask: is this address eligible under this policy, right now. A showcase built on Attestat, not a live product.
          </p>
        </div>
        <div className="strip" aria-label="Demo constants">
          <span>
            Price <b>1 mUSD per NDF</b>
          </span>
          <span>
            Subscribe <b>{fmtStable(SUBSCRIBE_STABLE)} mUSD</b>
          </span>
          <span>
            Distribution <b>{fmtStable(DISTRIBUTE_STABLE)} mUSD</b>
          </span>
          <span>
            Redeem <b>{fmtUnits(REDEEM_UNITS)} NDF</b>
          </span>
        </div>
      </div>
      <div className="flow">
        {MOCK ? <p className="note coral">The fund desk needs a chain: run without VITE_MOCK.</p> : null}
        {!DESK ? <p className="note coral">VITE_DESK is not set. Deploy contracts/script/DeployFundDesk.s.sol and put the FundDesk address into app/.env (scripts/showcase-investor-money-local.sh does both on anvil).</p> : null}

        <ConnectCard
          wallet={wallet}
          title="Sign in"
          lead="The address you sign in with is the subject of the eligibility decision and the holder of the fund units and the stablecoin. With the Privy app id set, sign-in is by email and the wallet is created for you; without it, a dev signer or a browser extension stands in."
          id="signin"
        />
        {PRIVY_ENABLED ? (
          <p className="caption" data-testid="privy-sentence">
            {PRIVY_SENTENCE}
          </p>
        ) : (
          <p className="caption">Dev signer or extension in this build (no Privy app id). With VITE_PRIVY_APP_ID set this step reads "Sign in with email, wallet by Privy" and the wallet is an embedded wallet created at sign-in.</p>
        )}

        <section className={`card${address ? '' : ' locked'}`} id="eligibility">
          <h2>Eligibility</h2>
          <p className="lead">{IDENTITY_SENTENCE}</p>
          {!address ? (
            <div className="empty">Sign in to see the decision for your wallet.</div>
          ) : (
            <>
              <div className="row">
                <span className={`status ${open ? 'open' : status.hasDecision && !status.revoked && !status.approved ? 'waiting' : 'closed'}`} data-testid="desk-eligibility">
                  {stateWord}
                </span>
                {status.hasDecision ? <span className="muted">expires {formatExpiry(status.expiry)}</span> : null}
              </div>
              {!status.hasDecision ? (
                <p className="note">
                  No decision yet. Present your ID on the <Link to="/">investor portal</Link> (official test wallet, sample identity; proof made in that browser tab), the bridge attests, the issuer approves. This desk reads the same decision.
                </p>
              ) : null}
              {status.revoked ? <p className="note coral">Approval withdrawn by the issuer (manual revocation). Subscribe, Claim and Redeem are refused until the issuer re-approves.</p> : null}
              {status.hasDecision && !status.approved && !status.revoked ? <p className="note">Evidence on chain, awaiting issuer approval.</p> : null}
            </>
          )}
        </section>

        <section className={`card${address ? '' : ' locked'}`} id="money">
          <h2>Your money</h2>
          <p className="lead">
            Test stablecoin in, fund units out, distributions and redemptions back. The desk{' '}
            {DESK ? (deskUrl ? <a href={deskUrl} target="_blank" rel="noreferrer">{shortHex(DESK, 6)}</a> : <code>{shortHex(DESK, 6)}</code>) : 'is not configured'} is the fund token's issuer: it mints on subscription and takes units back on redemption.
          </p>
          {!address ? (
            <div className="empty">Sign in to see balances.</div>
          ) : (
            <>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Balance</th>
                      <th>What it is</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>mUSD</td>
                      <td data-testid="bal-stable">{balances.stable === undefined ? '…' : fmtStable(balances.stable)}</td>
                      <td className="wrap">Test stablecoin, 6 decimals. Not the gated asset: the decision gates the fund units and the desk.</td>
                    </tr>
                    <tr>
                      <td>NDF</td>
                      <td data-testid="bal-units">{balances.units === undefined ? '…' : fmtUnits(balances.units)}</td>
                      <td className="wrap">Demo fund units, 18 decimals. Every transfer checks the recipient's eligibility.</td>
                    </tr>
                    <tr>
                      <td>Claimable</td>
                      <td data-testid="bal-claimable">{balances.claimable === undefined ? '…' : `${fmtStable(balances.claimable)} mUSD`}</td>
                      <td className="wrap">Unclaimed distributions for the units you hold now.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="row">
                <button type="button" className="btn btn-ghost" disabled={busy || !addresses.stable} onClick={() => act(() => desk.mintStable(MINT_STABLE))} data-testid="btn-mint">
                  Get {fmtStable(MINT_STABLE)} test mUSD
                </button>
                <button type="button" className="btn btn-ghost" disabled title="simulated: card onramps do not support testnets">
                  Add funds by card
                </button>
              </div>
              <p className="caption">Test stablecoin, anyone can mint; on mainnet this is a card or bank deposit. "Add funds by card" is simulated: card onramps do not support testnets.</p>
              <div className="doors">
                <div className="door">
                  <div className="head">
                    <h3>Subscribe</h3>
                    <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
                  </div>
                  <p className="hint">Pays {fmtStable(SUBSCRIBE_STABLE)} mUSD into the desk; the desk checks isEligible, then mints {fmtStable(SUBSCRIBE_STABLE)} NDF to this wallet. Two confirmations the first time (allowance, then subscribe).</p>
                  <button type="button" className="btn btn-mint" disabled={busy || !addresses.stable} onClick={() => act(() => desk.subscribe(SUBSCRIBE_STABLE))} data-testid="btn-subscribe">
                    Subscribe {fmtStable(SUBSCRIBE_STABLE)} mUSD
                  </button>
                </div>
                <div className="door">
                  <div className="head">
                    <h3>Claim</h3>
                    <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
                  </div>
                  <p className="hint">Pays every unclaimed distribution for the units you hold to this wallet, after the same eligibility check.</p>
                  <button type="button" className="btn btn-blue" disabled={busy || !addresses.stable} onClick={() => act(() => desk.claimAll())} data-testid="btn-claim">
                    Claim
                  </button>
                </div>
                <div className="door">
                  <div className="head">
                    <h3>Redeem</h3>
                    <span className={`status ${open ? 'open' : 'closed'}`}>{open ? 'open' : 'closed'}</span>
                  </div>
                  <p className="hint">Hands {fmtUnits(REDEEM_UNITS)} NDF back to the desk and receives {fmtUnits(REDEEM_UNITS)} mUSD, after the same check. Two confirmations the first time.</p>
                  <button type="button" className="btn btn-blue" disabled={busy || !addresses.token} onClick={() => act(() => desk.redeem(REDEEM_UNITS))} data-testid="btn-redeem">
                    Redeem {fmtUnits(REDEEM_UNITS)} NDF
                  </button>
                </div>
              </div>
              <DeskTxLine tx={desk.tx} />
              <p className="caption">A closed door still takes the click: the desk is simulated with your address first and its refusal is shown in plain words, so nothing is signed for a transaction the chain would refuse.</p>
            </>
          )}
        </section>

        <section className={`card${address ? '' : ' locked'}`} id="receipts">
          <h2>Receipts</h2>
          <p className="lead">What this page sent since it was opened. Explorer links where the chain has one.</p>
          {receipts.length === 0 ? (
            <div className="empty">Nothing sent from this page yet.</div>
          ) : (
            <div className="receipts" data-testid="desk-receipts">
              {receipts.map((r) => (
                <div className="receipt" key={r.hash}>
                  <span className="when">{when(r.at)}</span>
                  <span>
                    <span className="what">{DESK_RECEIPT_LABEL[r.kind]}</span> <span className="muted">{r.what}</span>
                  </span>
                  <TxHash hash={r.hash} />
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="caption">
          Captions: official test wallet, sample identity; the proof is made in the browser tab on the investor portal; the distribution is paid per unit over the balance at claim time, without a snapshot (simulated); revocation is manual, by the issuer; the stablecoin is a test token anyone can mint; the desk keeps redeemed units as inventory and hands them out on the next subscription. Amounts are demo constants; the distribution is an amount, not a rate.
        </p>
      </div>
    </main>
  )
}
