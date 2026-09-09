/**
 * Typed fetch wrapper for the payout desk service (showcase/payout-desk/src/server.ts). The JSON shapes
 * below mirror stateOf, bypass and ensureAllowance there; bigints arrive as decimal strings.
 */
import { OFFICER_TOKENS, PAYOUT_DESK_URL, type Officer } from './config'

export type { Officer }

export type RunState = 'proposed' | 'executing' | 'executed' | 'refused' | 'failed'
export type RefusedBy = 'gate' | 'policy' | 'chain' | 'transport'

export interface RunItem {
  contractorId?: string
  label: string
  address: string
  /** Token units, decimal string. */
  amount: string
  verdict?: 'eligible' | 'refused'
  reason?: string
}

export interface Run {
  id: string
  ref: string
  createdAt: string
  proposedBy: Officer
  approvals: Officer[]
  state: RunState
  items: RunItem[]
  total: string
  paidTotal?: string
  txHash?: string
  blockNumber?: string
  error?: string
  refusedBy?: RefusedBy
}

export interface Receipt {
  runId: string
  runRef: string
  recipient: string
  amount: string
  txHash: string
  blockNumber: string
  logIndex: number
}

export interface ContractorStatus {
  hasDecision: boolean
  approved: boolean
  revoked: boolean
  /** Unix seconds, decimal string; "0" means no expiry. */
  expiry: string
}

export interface Contractor {
  id: string
  label: string
  address: string
  eligible: boolean
  status: ContractorStatus
  balance: string
}

export interface PolicyCondition {
  field_source: string
  field: string
  operator: string
  value: unknown
  abi?: unknown
}

export interface PolicyRule {
  name: string
  method: string
  action: string
  conditions: PolicyCondition[]
}

export interface DeskState {
  mode: 'local' | 'privy' | string
  chainId: number
  treasury: { address: string; walletId?: string; balance: string; allowance: string }
  gate: string
  token: { address: string; symbol: string; decimals: number }
  registry: string
  policyId: string
  requiredBits: string
  cap: string
  policy: { rules: PolicyRule[]; described: string[]; privyPolicyId?: string; privyKeyQuorumId?: string }
  approval: { mode: 'quorum-2of2' | 'app-second-approver'; simulated: boolean; description: string }
  officers: { id: Officer; label: string }[]
  contractors: Contractor[]
  runs: Run[]
  receipts: Receipt[]
  log: { at: string; line: string }[]
}

export interface ProposeItem {
  contractorId?: string
  label?: string
  address: string
  amount: string
}

export type BypassKind = 'transfer' | 'registry'

export type BypassResult =
  | { kind: BypassKind; attempted: string; refused: false; txHash: string }
  | { kind: BypassKind; attempted: string; refused: true; refusedBy: 'policy' | 'chain'; reason: string }

export interface AllowanceResult {
  allowance: string
  txHash?: string
  error?: string
}

export class DeskError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'DeskError'
  }
}

async function call<T>(path: string, init: RequestInit = {}, officer?: Officer): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (officer) headers.authorization = `Bearer ${OFFICER_TOKENS[officer]}`
  const res = await fetch(`${PAYOUT_DESK_URL}${path}`, { ...init, headers })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new DeskError(body.error ?? `${res.status} ${res.statusText}`, res.status)
  return body as T
}

function post<T>(path: string, body: unknown, officer?: Officer): Promise<T> {
  return call<T>(path, { method: 'POST', body: JSON.stringify(body) }, officer)
}

export function getState(): Promise<DeskState> {
  return call<DeskState>('/state')
}

export function addContractor(label: string, address: string): Promise<Pick<Contractor, 'id' | 'label' | 'address'>> {
  return post('/contractors', { label, address })
}

export function proposeRun(officer: Officer, items: ProposeItem[]): Promise<Run> {
  return post('/runs', { items }, officer)
}

export function approveRun(officer: Officer, id: string): Promise<Run> {
  return post(`/runs/${encodeURIComponent(id)}/approve`, {}, officer)
}

export function bypass(kind: BypassKind, address: string, amount?: string): Promise<BypassResult> {
  return post('/bypass', { kind, address, amount })
}

export function ensureAllowance(): Promise<AllowanceResult> {
  return post('/allowance', {})
}
