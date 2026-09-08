import { useMemo, useState, type ReactNode } from 'react'
import { browserPathAvailability } from '../lib/browserProver'
import type { Session } from '../lib/sessions'
import { BrowserProveCard } from './BrowserProveCard'
import { HandoffCard } from './HandoffCard'

export type ProvePath = 'browser' | 'phone' | 'companion'

const PATHS: { id: ProvePath; label: string }[] = [
  { id: 'browser', label: 'In this browser' },
  { id: 'phone', label: 'On your phone' },
  { id: 'companion', label: 'Desktop companion' },
]

/**
 * Card 2b: where the proof is made. Three paths post the same proof to the same bridge session the
 * wallet signed: this tab (WP29, default when cross-origin isolated and not iOS), the phone app or
 * the desktop companion (both consume the handoff QR and URI, WP14).
 */
export function ProveCard({ session }: { session?: Session }) {
  const avail = useMemo(browserPathAvailability, [])
  const [path, setPath] = useState<ProvePath>(avail.ok ? 'browser' : 'phone')
  const isBridge = session?.request.mode === 'bridge' || session?.request.mode === 'mock'
  if (!session || !isBridge) return null
  const picker: ReactNode = (
    <div className="row paths" role="group" aria-label="where to prove">
      {PATHS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`btn btn-ghost${path === p.id ? ' selected' : ''}`}
          aria-pressed={path === p.id}
          disabled={p.id === 'browser' && !avail.ok}
          title={p.id === 'browser' && !avail.ok ? avail.reason : undefined}
          onClick={() => setPath(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
  const unavailable = !avail.ok ? <p className="note">Proving in this browser is off: {avail.reason}</p> : null
  if (path === 'browser') return <BrowserProveCard session={session} picker={picker} availability={avail} />
  return (
    <HandoffCard session={session} variant={path} picker={picker}>
      {unavailable}
    </HandoffCard>
  )
}
