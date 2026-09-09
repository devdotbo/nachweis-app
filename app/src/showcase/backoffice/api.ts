/**
 * Client for the desk service (showcase/backoffice/src/server.ts). The shapes mirror
 * showcase/backoffice/src/types.ts; keep both in step.
 */
import type { Address, Hex } from 'viem'

export type DeskMode = 'local' | 'privy'
export type Role = 'compliance' | 'operations'
export const ROLES: readonly Role[] = ['compliance', 'operations'] as const
export type ProposalKind = 'approve' | 'revoke'
export type ProposalStatus = 'proposed' | 'sending' | 'confirmed' | 'reverted' | 'refused'

export interface Evidence {
  bits: string
  tier: number
  expiry: number
  statusRef: Hex
  attester: Address
  txHash: Hex
  blockNumber: number
}

export interface Proposal {
  id: string
  kind: ProposalKind
  subject: Address
  policyId: Hex
  source: 'attested-event' | 'manual'
  createdAt: number
  confirmations: Partial<Record<Role, number>>
  status: ProposalStatus
  evidence?: Evidence
  txHash?: Hex
  gasUsed?: string
  error?: string
}

export interface PolicyRuleView {
  name: string
  method: string
  action: 'ALLOW' | 'DENY'
  conditions: string[]
}

export interface DeskInfo {
  mode: DeskMode
  chainId: number
  registry: Address
  policyId: Hex
  operator: { address: Address; walletId?: string; custody: string }
  quorum: { id?: string; threshold: number; members: { role: Role; label: string }[]; enforcedBy: 'privy-tee' | 'simulated' }
  policy: { id?: string; name: string; rules: PolicyRuleView[]; json: unknown; enforcedBy: 'privy-tee' | 'simulated' }
  watcher: { pollMs: number; fromBlock: number; lastBlock: number }
}

export type ProbeKind = 'transfer' | 'attestByOperator' | 'single-signature' | 'sign-message'

export interface ProbeResult {
  kind: ProbeKind
  attempted: string
  refused: boolean
  by: 'privy-policy' | 'privy-quorum' | 'privy-precheck' | 'simulated-policy' | 'simulated-quorum' | 'not-refused'
  message: string
  txHash?: Hex
}

/** Desk service base URL. Default: the port scripts/showcase-backoffice-local.sh starts it on. */
export const BACKOFFICE_URL: string = ((import.meta.env.VITE_BACKOFFICE_URL as string | undefined) || 'http://127.0.0.1:8794').replace(/\/+$/, '')

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BACKOFFICE_URL}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const text = await r.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  if (!r.ok) {
    const msg = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : text || `${r.status}`
    throw new Error(msg)
  }
  return body as T
}

export const desk = {
  info: () => call<DeskInfo>('/desk'),
  queue: () => call<Proposal[]>('/queue'),
  propose: (kind: ProposalKind, subject: Address) => call<Proposal>('/queue/propose', { method: 'POST', body: JSON.stringify({ kind, subject }) }),
  confirm: (id: string, role: Role) => call<Proposal>(`/queue/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify({ role }) }),
  probe: (kind: ProbeKind) => call<ProbeResult>('/probe', { method: 'POST', body: JSON.stringify({ kind }) }),
}
