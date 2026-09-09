/** In-memory state of the automation: one policy per investor and the log the issuer console shows. */
import type { Address, Hex } from 'viem'
import type { PolicyRule } from './policy'

export interface InvestorPolicy {
  address: Address
  /** Privy policy id, or `local-<n>` in local mode. */
  policyId: string
  rules: PolicyRule[]
  /** Privy rule ids by rule name (privy mode), so a rule can be deleted or updated in place. */
  ruleIds: Record<string, string>
  createdAt: number
  updatedAt: number
}

export type LogKind = 'policy' | 'tick' | 'watch' | 'error'

export interface LogEntry {
  at: number
  kind: LogKind
  line: string
  address?: Address
  hash?: Hex
}

const MAX_LOG = 300

export class Store {
  readonly policies = new Map<string, InvestorPolicy>()
  readonly log: LogEntry[] = []
  private seq = 0

  key(address: Address): string {
    return address.toLowerCase()
  }

  get(address: Address): InvestorPolicy | undefined {
    return this.policies.get(this.key(address))
  }

  put(p: InvestorPolicy): void {
    this.policies.set(this.key(p.address), p)
  }

  nextLocalId(): string {
    this.seq += 1
    return `local-${this.seq}`
  }

  add(kind: LogKind, line: string, extra: { address?: Address; hash?: Hex } = {}): LogEntry {
    const e: LogEntry = { at: Date.now(), kind, line, ...extra }
    this.log.push(e)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    console.log(`${new Date(e.at).toISOString()} ${line}`)
    return e
  }
}
