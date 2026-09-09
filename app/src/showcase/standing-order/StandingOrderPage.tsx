/**
 * Showcase, standing order (docs/privy-standing-order.md): route /showcase/standing-order. The card itself
 * (src/components/StandingOrderCard.tsx) also sits on the investor portal and in the savings plan; this
 * page gives the site's link a home with the same chrome as the other showcase routes.
 */
import { Link } from 'react-router'
import { ConnectCard } from '../../components/ConnectCard'
import { StandingOrderCard } from '../../components/StandingOrderCard'
import { AUTOMATION_URL, PRIVY_APP_ID } from '../../config'
import { useWallet } from '../../lib/wallet'

export function StandingOrderPage() {
  const wallet = useWallet('investor')
  const configured = Boolean(PRIVY_APP_ID && AUTOMATION_URL)
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Standing order</h1>
          <p className="sub">
            The investor lets the issuer's automation send subscribe() from her embedded wallet under a policy copied from her on-chain decision: two rules, a deny once the decision expires and an allow for subscribe() on the Subscription contract only. Revoke adds a deny-all; a fresh approval removes it. A showcase built on Attestat, not a live product.
          </p>
        </div>
      </div>
      <ConnectCard wallet={wallet} title="Investor" lead="The wallet the standing order runs from. Attested and approved in the investor portal or by the operator; nothing here creates evidence." />
      {configured ? (
        <StandingOrderCard address={wallet.address} wallet={wallet} />
      ) : (
        <section className="card" id="standing-order">
          <h2>Standing order</h2>
          <p className="hint">
            This build carries no Privy app id or no automation URL (VITE_PRIVY_APP_ID, VITE_AUTOMATION_URL), so the card stays hidden. The same plan door runs in the <Link to="/showcase/savings-plan">savings plan</Link> against the registry alone.
          </p>
        </section>
      )}
    </main>
  )
}
