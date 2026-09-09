/**
 * The compliance desk: an in-memory queue of proposals, the four-eyes confirmation, the
 * Attested watcher, and the probes that show the policy and quorum refusing. The chain reader
 * and the operator are injected so tests run with stubs.
 */
import type { Address, Hex } from 'viem'
import { encodeApprove, encodeAttestByOperator, encodeRevoke, shortError, type ChainReader } from './chain'
import type { Config } from './config'
import { QUORUM_THRESHOLD, Refused, Reverted, type Operator } from './operator'
import { POLICY_NAME, describeRules, quorumSatisfied, registryOperatorRules } from './policy'
import {
  ROLES,
  type DeskInfo,
  type Evidence,
  type ProbeKind,
  type ProbeResult,
  type Proposal,
  type ProposalKind,
  type Role,
} from './types'

const DEAD: Address = '0x000000000000000000000000000000000000dEaD'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const OPEN = new Set(['proposed', 'sending'])

export class Desk {
  private readonly proposals = new Map<string, Proposal>()
  private seq = 0
  private fromBlock: number | undefined
  private lastBlock: number | undefined

  constructor(
    private readonly cfg: Config,
    private readonly operator: Operator,
    private readonly chain: ChainReader,
    private readonly log: (line: string) => void = () => {},
  ) {}

  /** Newest first. */
  list(): Proposal[] {
    return [...this.proposals.values()].reverse()
  }

  get(id: string): Proposal | undefined {
    return this.proposals.get(id)
  }

  private open(subject: Address, kind: ProposalKind): Proposal | undefined {
    return [...this.proposals.values()].find(
      (p) => p.kind === kind && p.subject.toLowerCase() === subject.toLowerCase() && OPEN.has(p.status),
    )
  }

  /** One open proposal per subject and kind; a duplicate returns the existing one. */
  propose(kind: ProposalKind, subject: Address, source: Proposal['source'], evidence?: Evidence): Proposal {
    const existing = this.open(subject, kind)
    if (existing) return existing
    const p: Proposal = {
      id: `p${++this.seq}`,
      kind,
      subject,
      policyId: this.cfg.policyId,
      source,
      createdAt: Date.now(),
      confirmations: {},
      status: 'proposed',
      ...(evidence ? { evidence } : {}),
    }
    this.proposals.set(p.id, p)
    this.log(`proposal ${p.id}: ${kind} ${subject} (${source})`)
    return p
  }

  /** Records the officer's confirmation; the second distinct role triggers the send. */
  async confirm(id: string, role: Role): Promise<Proposal> {
    const p = this.proposals.get(id)
    if (!p) throw new Error(`unknown proposal ${id}`)
    if (!ROLES.includes(role)) throw new Error(`unknown role ${String(role)}`)
    if (p.status !== 'proposed') throw new Error(`proposal ${id} is ${p.status}`)
    p.confirmations[role] ??= Date.now()
    this.log(`confirmation ${id}: ${role}`)
    if (!quorumSatisfied(p.confirmations, QUORUM_THRESHOLD)) return p
    const signers = ROLES.filter((r) => typeof p.confirmations[r] === 'number')
    const data = p.kind === 'approve' ? encodeApprove(p.subject, p.policyId) : encodeRevoke(p.subject, p.policyId)
    p.status = 'sending'
    delete p.error
    try {
      const hash = await this.operator.send({ to: this.cfg.registry, data }, signers)
      p.txHash = hash
      this.log(`send ${id}: ${p.kind} ${p.subject} tx ${hash}`)
      const receipt = await this.chain.waitReceipt(hash)
      p.gasUsed = receipt.gasUsed.toString()
      if (receipt.status === 'reverted') {
        p.status = 'reverted'
        p.error = `transaction ${hash} reverted`
      } else {
        p.status = 'confirmed'
      }
    } catch (e) {
      if (e instanceof Refused) {
        p.status = 'refused'
        p.error = e.message
        this.log(`refusal ${id}: ${e.by}: ${e.message}`)
      } else if (e instanceof Reverted) {
        // The registry refused (for example NoDecision for an address without evidence): two signatures, no approval.
        p.status = 'reverted'
        p.error = e.message
        this.log(`reverted ${id}: ${e.message}`)
      } else {
        // Not a refusal (rpc down, nonce clash): back to the queue, both officers confirm again.
        p.status = 'proposed'
        p.confirmations = {}
        p.error = shortError(e)
        this.log(`error ${id}: ${p.error}`)
      }
    }
    return p
  }

  /** Reads new Attested logs and proposes an approve for each unapproved decision. */
  async tick(): Promise<Proposal[]> {
    const latest = Number(await this.chain.latestBlock())
    if (this.lastBlock === undefined) {
      this.fromBlock = this.cfg.startBlock ?? (this.cfg.mode === 'local' ? 0 : latest)
      this.lastBlock = this.fromBlock - 1
    }
    if (latest <= this.lastBlock) return []
    const logs = await this.chain.fetchAttested(BigInt(this.lastBlock + 1), BigInt(latest), this.cfg.policyId)
    this.lastBlock = latest
    const created: Proposal[] = []
    for (const l of logs) {
      if (l.policyId.toLowerCase() !== this.cfg.policyId.toLowerCase()) continue
      if (this.open(l.subject, 'approve')) continue
      const s = await this.chain.statusOf(l.subject, l.policyId)
      if (!s.hasDecision || s.isApproved) continue
      created.push(this.propose('approve', l.subject, 'attested-event', l.evidence))
    }
    return created
  }

  deskInfo(): DeskInfo {
    const rules = registryOperatorRules(this.cfg.registry, [this.cfg.chainId])
    const privy = this.cfg.mode === 'privy'
    const enforcedBy = privy ? 'privy-tee' : 'simulated'
    return {
      mode: this.cfg.mode,
      chainId: this.cfg.chainId,
      registry: this.cfg.registry,
      policyId: this.cfg.policyId,
      operator: {
        address: this.operator.address,
        ...(this.operator.walletId ? { walletId: this.operator.walletId } : {}),
        custody: privy
          ? "a Privy server wallet; the key is reconstituted only inside Privy's secure enclave (Privy's wording); this desk holds two P-256 authorization keys on one demo server"
          : 'a dev key on this machine (local mode)',
      },
      quorum: {
        ...(this.cfg.privy?.quorumId ? { id: this.cfg.privy.quorumId } : {}),
        threshold: QUORUM_THRESHOLD,
        members: [
          { role: 'compliance', label: 'Compliance officer' },
          { role: 'operations', label: 'Operations officer' },
        ],
        enforcedBy,
      },
      policy: {
        ...(this.cfg.privy?.policyId ? { id: this.cfg.privy.policyId } : {}),
        name: POLICY_NAME,
        rules: describeRules(rules),
        json: rules,
        enforcedBy,
      },
      watcher: { pollMs: this.cfg.pollMs, fromBlock: this.fromBlock ?? this.cfg.startBlock ?? 0, lastBlock: this.lastBlock ?? -1 },
    }
  }

  /** Sends something the policy or the quorum must refuse; reports honestly when it did not. */
  async probe(kind: ProbeKind): Promise<ProbeResult> {
    const both: Role[] = [...ROLES]
    let attempted: string
    let tx: { to: Address; data: Hex; value?: bigint }
    let signers: Role[]
    if (kind === 'transfer') {
      const to = this.cfg.fundToken ?? DEAD
      attempted = `send 1 wei from the operator wallet to ${to} with both signatures`
      tx = { to, data: '0x', value: 1n }
      signers = both
    } else if (kind === 'attestByOperator') {
      attempted = `call attestByOperator on the registry ${this.cfg.registry} with both signatures (only approve and revoke are allowed)`
      tx = { to: this.cfg.registry, data: encodeAttestByOperator(ZERO, this.cfg.policyId) }
      signers = both
    } else if (kind === 'single-signature') {
      const subject = this.list().find((p) => p.status === 'proposed')?.subject ?? ZERO
      attempted = `call approve(${subject}) on the registry with only the compliance signature`
      tx = { to: this.cfg.registry, data: encodeApprove(subject, this.cfg.policyId) }
      signers = ['compliance']
    } else {
      throw new Error(`unknown probe ${String(kind)}`)
    }
    try {
      const txHash = await this.operator.send(tx, signers)
      this.log(`probe ${kind}: NOT refused, tx ${txHash}`)
      return { kind, attempted, refused: false, by: 'not-refused', message: `not refused; transaction ${txHash} was sent`, txHash }
    } catch (e) {
      if (e instanceof Refused) {
        this.log(`probe ${kind}: refused by ${e.by}`)
        return { kind, attempted, refused: true, by: e.by, message: e.message }
      }
      throw e
    }
  }
}
