/**
 * In-memory session store shared by the investor and issuer screens.
 * Nothing here is persisted: a reload forgets every presentation.
 */
import { useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import type { ClaimLine, PresentationRequest } from '../verifier'

export type SessionState = 'pending' | 'presented' | 'rejected' | 'attested' | 'revoked'

export interface Session {
  request: PresentationRequest
  boundAddress: Address
  createdAt: number
  state: SessionState
  claims?: ClaimLine[]
  receivedAt?: string
  note?: string
  reason?: string
  error?: string
}

let sessions: Session[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function addSession(s: Session) {
  sessions = [s, ...sessions]
  emit()
}

export function updateSession(sessionId: string, patch: Partial<Session>) {
  sessions = sessions.map((s) => (s.request.sessionId === sessionId ? { ...s, ...patch } : s))
  emit()
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.find((s) => s.request.sessionId === sessionId)
}

export function useSessions(): Session[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => sessions,
  )
}
