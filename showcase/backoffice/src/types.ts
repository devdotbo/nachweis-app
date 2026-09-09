/**
 * The desk's HTTP contract (showcase/backoffice, WP38). The app panel in app/src/showcase/backoffice/
 * mirrors these shapes in its own api.ts; keep both in step.
 *
 * Mode: `local` signs with a dev key on anvil and plays the quorum and the policy in memory
 * ("simulated"); `privy` signs from the Privy server wallet, where the TEE enforces both.
 */
import type { Address, Hex } from 'viem'

export type DeskMode = 'local' | 'privy'
export type Role = 'compliance' | 'operations'
export const ROLES: readonly Role[] = ['compliance', 'operations'] as const

export type ProposalKind = 'approve' | 'revoke'
export type ProposalStatus =
  | 'proposed' // waiting for confirmations
  | 'sending' // both confirmed, request in flight
  | 'confirmed' // receipt with status success
  | 'reverted' // mined, status reverted (for example NoDecision for a stranger address)
  | 'refused' // refused before signing: policy or quorum

export interface Evidence {
  bits: string // decimal
  tier: number
  expiry: number // unix seconds
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
  /** `attested-event`: raised by the watcher from an Attested log; `manual`: raised from the panel. */
  source: 'attested-event' | 'manual'
  createdAt: number // unix ms
  /** Role -> unix ms of the confirmation. */
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
  /** Plain words for the screen, one per condition. */
  conditions: string[]
}

export interface DeskInfo {
  mode: DeskMode
  chainId: number
  registry: Address
  policyId: Hex
  operator: {
    address: Address
    /** Privy wallet id (privy mode). */
    walletId?: string
    /** Sentence for the screen: who holds the key. */
    custody: string
  }
  quorum: {
    /** Privy key quorum id (privy mode). */
    id?: string
    threshold: number
    members: { role: Role; label: string }[]
    /** `privy-tee` or `simulated`. */
    enforcedBy: 'privy-tee' | 'simulated'
  }
  policy: {
    /** Privy policy id (privy mode). */
    id?: string
    name: string
    rules: PolicyRuleView[]
    /** The rule JSON exactly as sent to Privy (privy) or evaluated locally (local). */
    json: unknown
    enforcedBy: 'privy-tee' | 'simulated'
  }
  watcher: { pollMs: number; fromBlock: number; lastBlock: number }
}

export type ProbeKind = 'transfer' | 'attestByOperator' | 'single-signature' | 'sign-message'

export interface ProbeResult {
  kind: ProbeKind
  /** What was attempted, in plain words. */
  attempted: string
  refused: boolean
  /** `privy-policy`, `privy-quorum`, `privy-precheck` (Privy's API-level funds or gas check answered before the policy was consulted: inconclusive), `simulated-policy`, `simulated-quorum`, or `not-refused`. */
  by: 'privy-policy' | 'privy-quorum' | 'privy-precheck' | 'simulated-policy' | 'simulated-quorum' | 'not-refused'
  /** Verbatim error text (Privy's wording in privy mode). */
  message: string
  txHash?: Hex
}

export interface ProposeBody {
  kind: ProposalKind
  subject: Address
}

export interface ConfirmBody {
  role: Role
}
