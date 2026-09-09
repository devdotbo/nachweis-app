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

/** One plan run per investor per tick (showcase savings plan, docs/showcase/savings-plan.md): the run history behind the log. */
export interface PlanRun {
  /** 1-based per investor. */
  n: number
  at: number
  address: Address
  outcome: 'ok' | 'denied-policy' | 'denied-chain' | 'no-delegated-wallet' | 'no-policy' | 'error'
  hash?: Hex
  detail: string
}

export interface LogEntry {
  at: number
  kind: LogKind
  line: string
  address?: Address
  hash?: Hex
}

const MAX_LOG = 300
const MAX_RUNS = 200

export class Store {
  readonly policies = new Map<string, InvestorPolicy>()
  readonly log: LogEntry[] = []
  readonly runs: PlanRun[] = []
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

  /** Records one plan run; `n` counts this investor's runs from 1. Returns the run. */
  addRun(run: Omit<PlanRun, 'n' | 'at'>): PlanRun {
    const r: PlanRun = { n: this.runsFor(run.address).length + 1, at: Date.now(), ...run }
    this.runs.push(r)
    if (this.runs.length > MAX_RUNS) this.runs.splice(0, this.runs.length - MAX_RUNS)
    return r
  }

  runsFor(address: Address): PlanRun[] {
    const k = this.key(address)
    return this.runs.filter((r) => r.address.toLowerCase() === k)
  }

  add(kind: LogKind, line: string, extra: { address?: Address; hash?: Hex } = {}): LogEntry {
    const e: LogEntry = { at: Date.now(), kind, line, ...extra }
    this.log.push(e)
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG)
    console.log(`${new Date(e.at).toISOString()} ${line}`)
    return e
  }
}
