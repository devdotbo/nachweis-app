import { useEffect, useState } from 'react'
import { Header } from './components/Header'
import type { Role } from './lib/role'
import { updateSession, useSessions } from './lib/sessions'
import { useWallet } from './lib/wallet'
import { InvestorScreen } from './screens/InvestorScreen'
import { IssuerScreen } from './screens/IssuerScreen'
import { bridge, isTerminal } from './bridge'
import { verifier } from './verifier'

const VERIFIER_POLL_MS = 2000
/** Sessions for which POST /sessions/:id/attest went out (once per session, whatever the answer). */
const attestRequested = new Set<string>()

/** Polls the verifier for every pending session, whichever role is on screen. */
function useSessionPolling() {
  const sessions = useSessions()
  const activeIds = sessions
    .filter((s) => s.state === 'pending' || (s.state !== 'rejected' && !(s.bridge && isTerminal(s.bridge.state))))
    .map((s) => s.request.sessionId)
    .join(',')
  useEffect(() => {
    if (!activeIds) return
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
      for (const s of sessions.filter((x) => x.state !== 'rejected' && !(x.bridge && isTerminal(x.bridge.state)))) {
        try {
          const b = await bridge.getSession(s.request.sessionId)
          if (!alive) return
          const patch: Parameters<typeof updateSession>[1] = { bridge: b, bridgeError: undefined }
          if (b.state === 'attested') patch.state = 'attested'
          updateSession(s.request.sessionId, patch)
          // The bridge's verifier mode stops at proved; the attest transaction is asked for explicitly.
          if (b.state === 'proved' && !attestRequested.has(s.request.sessionId)) {
            attestRequested.add(s.request.sessionId)
            updateSession(s.request.sessionId, { bridge: { ...b, detail: 'proof ready, asking the bridge to attest' } })
            try {
              await bridge.requestAttest(s.request.sessionId)
              const after = await bridge.getSession(s.request.sessionId)
              if (!alive) return
              updateSession(s.request.sessionId, after.state === 'attested' ? { bridge: after, state: 'attested' } : { bridge: after })
            } catch (e) {
              if (alive) updateSession(s.request.sessionId, { bridgeError: e instanceof Error ? e.message : String(e) })
            }
          }
        } catch (e) {
          if (alive) updateSession(s.request.sessionId, { bridgeError: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    void tick()
    const t = setInterval(tick, VERIFIER_POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
    // sessions is read fresh inside tick via the closure of this effect run; activeIds changes re-arm it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds])
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
