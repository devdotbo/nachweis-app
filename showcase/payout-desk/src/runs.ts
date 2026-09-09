/**
 * Payout runs and the four-eyes rule. Pure: no network.
 *
 * A run is proposed by one officer and executed only after a different officer approves it. In privy mode with
 * two officer keys the same two approvals put both keys on the signing request (2-of-2 key quorum, enforced by
 * Privy's TEE); with one key, or in local mode, the second approval is recorded here and captioned on screen.
 */
import { getAddress, keccak256, stringToBytes, type Address, type Hex } from 'viem'

export type Officer = 'A' | 'B'
export type RunState = 'proposed' | 'executing' | 'executed' | 'refused' | 'failed'

export interface RunItem {
  contractorId?: string
  label: string
  address: Address
  /** Token units as a decimal string. */
  amount: string
  /** Set by the preview before execution. */
  verdict?: 'eligible' | 'refused'
  /** The gate's revert, verbatim (for example "NotEligible(0x...)"). */
  reason?: string
}

export interface Run {
  id: string
  /** bytes32 run reference passed to GatedPayout.payout and indexed in PaidOut. */
  ref: Hex
  createdAt: string
  proposedBy: Officer
  approvals: Officer[]
  state: RunState
  items: RunItem[]
  /** Proposed total (all items). */
  total: string
  /** Total actually paid (eligible items), once executed. */
  paidTotal?: string
  txHash?: Hex
  blockNumber?: string
  /** Refusal or failure text: the policy's, the chain's or the transport's. */
  error?: string
  /** Who or what refused: 'gate' (chain), 'policy' (Privy or the local evaluator), 'chain', 'transport'. */
  refusedBy?: 'gate' | 'policy' | 'chain' | 'transport'
}

export const REQUIRED_APPROVALS = 2

export class RunError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'RunError'
  }
}

export interface ProposeItem {
  contractorId?: string
  label?: string
  address: string
  amount: string
}

export class RunStore {
  private runs = new Map<string, Run>()
  private seq = 0

  list(): Run[] {
    return [...this.runs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  }

  get(id: string): Run | undefined {
    return this.runs.get(id)
  }

  propose(officer: Officer, items: ProposeItem[]): Run {
    if (items.length === 0) throw new RunError('a run needs at least one recipient', 400)
    const parsed: RunItem[] = items.map((it) => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(it.address)) throw new RunError(`"${it.address}" is not an address`, 400)
      if (!/^\d+$/.test(it.amount) || BigInt(it.amount) === 0n) throw new RunError(`amount for ${it.address} must be a positive integer in token units`, 400)
      return { contractorId: it.contractorId, label: it.label ?? it.address.slice(0, 10), address: getAddress(it.address), amount: it.amount }
    })
    const seen = new Set<string>()
    for (const p of parsed) {
      if (seen.has(p.address)) throw new RunError(`${p.address} appears twice`, 400)
      seen.add(p.address)
    }
    const id = `run-${++this.seq}-${Date.now().toString(36)}`
    const run: Run = {
      id,
      ref: keccak256(stringToBytes(id)),
      createdAt: new Date().toISOString(),
      proposedBy: officer,
      approvals: [officer],
      state: 'proposed',
      items: parsed,
      total: parsed.reduce((s, it) => s + BigInt(it.amount), 0n).toString(),
    }
    this.runs.set(id, run)
    return run
  }

  /** Records an approval; returns the run and whether the threshold is now met. */
  approve(officer: Officer, id: string): { run: Run; ready: boolean } {
    const run = this.runs.get(id)
    if (!run) throw new RunError(`no run ${id}`, 404)
    if (run.state !== 'proposed') throw new RunError(`run ${id} is ${run.state}, not proposed`, 409)
    if (run.approvals.includes(officer)) throw new RunError(`officer ${officer} already approved run ${id}; a second officer must approve`, 403)
    run.approvals.push(officer)
    return { run, ready: run.approvals.length >= REQUIRED_APPROVALS }
  }

  update(id: string, patch: Partial<Run>): Run {
    const run = this.runs.get(id)
    if (!run) throw new RunError(`no run ${id}`, 404)
    Object.assign(run, patch)
    return run
  }
}
