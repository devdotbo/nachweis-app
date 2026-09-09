import { Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { TopBar } from './components/TopBar'
import { ISSUER_PATH, useRole } from './lib/role'
import { updateSession, useSessions, type SessionState } from './lib/sessions'
import { useWallet, type Wallet } from './lib/wallet'
import { InvestorScreen } from './screens/InvestorScreen'
import { IssuerScreen } from './screens/IssuerScreen'
import { showcases } from './showcase/registry'
import { bridge, isTerminal, type BridgeState } from './bridge'
import { verifier } from './verifier'

const VERIFIER_POLL_MS = 2000
/** Sessions for which POST /sessions/:id/attest went out (once per session, whatever the answer). */
const attestRequested = new Set<string>()

/**
 * Session state the bridge's report implies. Approval and revocation the issuer did from this app
 * (registry.approve / revoke with the operator signer) are never downgraded by a bridge that still
 * says attested; the chain is the truth for the doors either way.
 */
export function sessionStateFromBridge(current: SessionState, b: BridgeState): SessionState | undefined {
  if (b === 'approved') return 'approved'
  if (b === 'revoked') return 'revoked'
  if (current === 'approved' || current === 'revoked') return undefined
  if (b === 'attested') return 'attested'
  if (b === 'proved' && current === 'presented') return 'proved'
  return undefined
}

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
          const next = sessionStateFromBridge(s.state, b.state)
          if (next) patch.state = next
          updateSession(s.request.sessionId, patch)
          // The bridge's verifier mode stops at proved; the attest transaction is asked for explicitly.
          // A proof from the phone (noir-ultrahonk) is attested by the bridge's noir-proof route in the
          // same request; a poll can catch that session at proved while the transaction is in flight,
          // and an attest request for it would only be refused (409).
          const provedOnPhone = b.proofSystem?.startsWith('noir') === true
          if (b.state === 'proved' && !provedOnPhone && !attestRequested.has(s.request.sessionId)) {
            attestRequested.add(s.request.sessionId)
            updateSession(s.request.sessionId, { bridge: { ...b, detail: 'proof ready, asking the bridge to attest' } })
            try {
              await bridge.requestAttest(s.request.sessionId)
              const after = await bridge.getSession(s.request.sessionId)
              if (!alive) return
              const nextAfter = sessionStateFromBridge(s.state, after.state)
              updateSession(s.request.sessionId, nextAfter ? { bridge: after, state: nextAfter } : { bridge: after })
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

/** /showcase/:slug renders the demo registered under that slug (src/showcase/registry.ts); an unknown slug goes home. */
function ShowcaseRoute({ wallet }: { wallet: Wallet }) {
  const { slug } = useParams()
  const entry = showcases.find((s) => s.slug === slug)
  if (!entry) return <Navigate to="/" replace />
  return (
    <Suspense fallback={null}>
      <entry.Component wallet={wallet} />
    </Suspense>
  )
}

export function App() {
  const role = useRole()
  const wallet = useWallet(role)
  useSessionPolling()
  return (
    <>
      <TopBar role={role} wallet={wallet} />
      <Routes>
        <Route path="/" element={<InvestorScreen wallet={wallet} />} />
        <Route path={ISSUER_PATH} element={<IssuerScreen wallet={wallet} />} />
        <Route path="/showcase/:slug" element={<ShowcaseRoute wallet={wallet} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
