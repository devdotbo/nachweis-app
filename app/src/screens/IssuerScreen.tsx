import { ConnectCard } from '../components/ConnectCard'
import { EventLog } from '../components/EventLog'
import { IssuerPending } from '../components/IssuerPending'
import { RevokeByAddress } from '../components/RevokeByAddress'
import { useSessions } from '../lib/sessions'
import type { Wallet } from '../lib/wallet'

export function IssuerScreen({ wallet }: { wallet: Wallet }) {
  const sessions = useSessions()
  return (
    <div className="grid">
      <ConnectCard wallet={wallet} title="Connect operator wallet" lead="The operator key registered for the policy in the AttestationRegistry. It signs attestByOperator and revoke." />
      <RevokeByAddress operator={wallet.address} />
      <div className="span2">
        <IssuerPending operator={wallet.address} sessions={sessions} />
      </div>
      <EventLog />
    </div>
  )
}
