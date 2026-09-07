import { ChainPanel } from '../components/ChainPanel'
import { ConnectCard } from '../components/ConnectCard'
import { DoorsCard } from '../components/DoorsCard'
import { PresentCard } from '../components/PresentCard'
import { StatusCard } from '../components/StatusCard'
import { useSessions } from '../lib/sessions'
import type { Wallet } from '../lib/wallet'

export function InvestorScreen({ wallet }: { wallet: Wallet }) {
  const sessions = useSessions()
  const address = wallet.address
  const session = address ? sessions.find((s) => s.boundAddress.toLowerCase() === address.toLowerCase()) : undefined
  return (
    <div className="grid">
      <ConnectCard wallet={wallet} title="Connect wallet" lead="The address you connect is the subject of the eligibility decision. Nothing else about you goes on chain." />
      <PresentCard wallet={wallet} session={session} />
      <StatusCard address={address} session={session} />
      <DoorsCard address={address} />
      <ChainPanel address={address} />
    </div>
  )
}
