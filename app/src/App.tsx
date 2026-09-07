import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import type { Role } from './lib/role'
import { updateSession, useSessions } from './lib/sessions'
import { useWallet } from './lib/wallet'
import { InvestorScreen } from './screens/InvestorScreen'
import { IssuerScreen } from './screens/IssuerScreen'
import { verifier } from './verifier'

const VERIFIER_POLL_MS = 2000

/** Polls the verifier for every pending session, whichever role is on screen. */
function useSessionPolling() {
  const sessions = useSessions()
  const pendingIds = sessions.filter((s) => s.state === 'pending').map((s) => s.request.sessionId).join(',')
  useEffect(() => {
    if (!pendingIds) return
    let alive = true
    const tick = async () => {
      for (const s of sessions.filter((x) => x.state === 'pending')) {
        try {
          const r = await verifier.status(s.request)
          if (!alive) return
          if (r.state === 'presented') updateSession(s.request.sessionId, { state: 'presented', claims: r.claims, receivedAt: r.receivedAt, note: r.note, error: undefined })
          else if (r.state === 'rejected') updateSession(s.request.sessionId, { state: 'rejected', reason: r.reason, error: undefined })
        } catch (e) {
          if (alive) updateSession(s.request.sessionId, { error: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    void tick()
    const t = setInterval(tick, VERIFIER_POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
    // sessions is read fresh inside tick via the closure of this effect run; pendingIds changes re-arm it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIds])
}

export function App() {
  const [role, setRole] = useState<Role>('investor')
  const wallet = useWallet(role)
  useSessionPolling()
  return (
    <div className="app">
      <Header role={role} setRole={setRole} wallet={wallet} />
      {role === 'investor' ? <InvestorScreen wallet={wallet} /> : <IssuerScreen wallet={wallet} />}
    </div>
  )
}
