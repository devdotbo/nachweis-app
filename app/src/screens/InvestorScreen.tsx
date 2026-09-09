import { ChainPanel } from '../components/ChainPanel'
import { ConnectCard } from '../components/ConnectCard'
import { DoorsCard } from '../components/DoorsCard'
import { HistoryCard } from '../components/HistoryCard'
import { HoldingsCard } from '../components/HoldingsCard'
import { PresentCard } from '../components/PresentCard'
import { ProveCard } from '../components/ProveCard'
import { Rail } from '../components/Rail'
import { StandingOrderCard } from '../components/StandingOrderCard'
import { StatusCard } from '../components/StatusCard'
// zkPassport route (WP33), behind VITE_ZKPASSPORT=1; remove these two imports and the line after ProveCard with src/components/zkpassport/.
import { ZkPassportCard } from '../components/zkpassport/ZkPassportCard'
import { ZKPASSPORT } from '../components/zkpassport/config'
import { useEligible, useFundBalance, useRegistryEvents, useRegistryStatus } from '../lib/chain'
import { journeySteps, type StepId, type StepState } from '../lib/journey'
import { useReceipts } from '../lib/receipts'
import { useSessions } from '../lib/sessions'
import type { Wallet } from '../lib/wallet'

const RAIL_NOTE = 'Official test wallet, sample identity. No identity documents on chain, and nothing we could use to find you.'

export function InvestorScreen({ wallet }: { wallet: Wallet }) {
  const sessions = useSessions()
  const address = wallet.address
  const session = address ? sessions.find((s) => s.boundAddress.toLowerCase() === address.toLowerCase()) : undefined
  const chain = useRegistryStatus(address)
  const eligible = Boolean(useEligible(address))
  const balance = useFundBalance(address)
  const receipts = useReceipts()
  const { events } = useRegistryEvents()
  const mine = address ? address.toLowerCase() : ''
  const historyCount = mine ? receipts.filter((r) => r.subject?.toLowerCase() === mine || r.from?.toLowerCase() === mine).length + events.filter((e) => e.subject.toLowerCase() === mine).length : 0
  const swapped = Boolean(mine) && receipts.some((r) => r.kind === 'swap' && r.from?.toLowerCase() === mine)
  const steps = journeySteps({ address, session, chain, eligible, balance, historyCount, swapped })
  const state = (id: StepId): StepState | undefined => steps.find((s) => s.id === id)?.state
  const doorsState = (): StepState | undefined => {
    const a = state('subscribe')
    const b = state('swap')
    return a === 'current' || b === 'current' ? 'current' : a === 'done' ? 'done' : a === 'ready' || b === 'ready' ? 'ready' : undefined
  }
  const eligibilityState = (): StepState | undefined => {
    const a = state('attested')
    const b = state('approved')
    if (b === 'failed') return 'failed'
    if (b === 'done') return 'done'
    if (a === 'current' || b === 'current') return 'current'
    return a === 'done' ? 'current' : undefined
  }
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Investor portal</h1>
          <p className="sub">Present your ID once, prove the statement, and let the issuer's approval open the fund token and the pool for this wallet.</p>
        </div>
      </div>
      <div className="journey">
        <Rail steps={steps} note={RAIL_NOTE} />
        <div className="flow">
          <ConnectCard
            wallet={wallet}
            title="Connect wallet"
            lead="The address you connect is the subject of the eligibility decision. No identity documents go on chain, and nothing we could use to find you: the registry stores a policy id, predicate bits, a tier and an expiry against this address."
            state={state('connect')}
          />
          <PresentCard wallet={wallet} session={session} state={state('present')} />
          <ProveCard session={session} state={state('prove')} />
          {ZKPASSPORT ? <ZkPassportCard wallet={wallet} state={state('prove')} /> : null}
          <StatusCard address={address} session={session} state={eligibilityState()} />
          <DoorsCard address={address} state={doorsState()} />
          <StandingOrderCard address={address} wallet={wallet} />
          <HoldingsCard address={address} state={state('holdings')} />
          <HistoryCard address={address} state={state('history')} />
          <ChainPanel address={address} />
        </div>
      </div>
    </main>
  )
}
