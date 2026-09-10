/**
 * The watcher: Approved creates or refreshes the investor's policy from `decisionOf`; Revoked appends
 * the deny-all rule; a later Approved removes it. Polls the chain's logs every POLL_MS.
 */
import type { Address, PublicClient } from 'viem'
import { readDecision, readEvents, shortError, type RegistryEvent } from './chain'
import type { Config } from './config'
import { applyApproved, applyRevoked, buildRules, denyAllRule, expiryOf, hasDenyAll, RULE_EXPIRY, RULE_REVOKED } from './policy'
import type { PolicyBackend } from './policies'
import type { Store } from './store'

export class Watcher {
  private next?: bigint
  private timer?: ReturnType<typeof setInterval>
  private busy = false
  lastBlock?: bigint

  constructor(
    private cfg: Config,
    private client: PublicClient,
    private store: Store,
    private backend: PolicyBackend,
  ) {}

  async start(): Promise<void> {
    const latest = await this.client.getBlockNumber()
    if (this.cfg.startBlock !== undefined) this.next = this.cfg.startBlock
    else if (this.cfg.signer === 'local') this.next = 0n
    else this.next = latest > 5000n ? latest - 5000n : 0n
    this.store.add('watch', `WATCH START registry ${this.cfg.registry} policy ${this.cfg.policyId} from block ${this.next} (poll ${this.cfg.pollMs} ms)`)
    await this.poll()
    this.timer = setInterval(() => void this.poll(), this.cfg.pollMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** One poll; also called by POST /tick so a tick right after approve or revoke sees the event. */
  async poll(): Promise<void> {
    if (this.busy || this.next === undefined) return
    this.busy = true
    try {
      const latest = await this.client.getBlockNumber()
      if (latest < this.next) return
      const events = await readEvents(this.client, this.cfg, this.next, latest)
      for (const e of events) {
        if (await this.handle(e)) continue
        // Stop here: the cursor goes back to this event's block, so the next poll reads it again
        // (and everything after it). Handlers are idempotent, so a replay of the block's earlier
        // events is harmless (onRevoked returns early when the deny-all exists; onApproved only
        // touches the backend when the rules differ).
        this.next = e.blockNumber
        this.lastBlock = e.blockNumber > 0n ? e.blockNumber - 1n : undefined
        this.store.add('watch', `WATCH RETRY ${e.kind} ${e.subject} block ${e.blockNumber}: policy update failed, next poll retries from block ${e.blockNumber}`, { address: e.subject, hash: e.txHash })
        return
      }
      this.next = latest + 1n
      this.lastBlock = latest
    } catch (e) {
      this.store.add('error', `WATCH ERROR ${shortError(e)}`)
    } finally {
      this.busy = false
    }
  }

  private env() {
    return { chainId: this.cfg.chainId, subscription: this.cfg.subscription }
  }

  /** True when the event was mirrored; false when the policy update failed (logged, to be retried). */
  private async handle(e: RegistryEvent): Promise<boolean> {
    try {
      if (e.kind === 'Approved') await this.onApproved(e.subject, e)
      else await this.onRevoked(e.subject, e)
      return true
    } catch (err) {
      this.store.add('error', `WATCH ERROR ${e.kind} ${e.subject} block ${e.blockNumber}: ${shortError(err)}`, { address: e.subject, hash: e.txHash })
      return false
    }
  }

  private async onApproved(subject: Address, e: RegistryEvent): Promise<void> {
    const decision = await readDecision(this.client, this.cfg, subject)
    if (decision.expiry === 0n) {
      this.store.add('watch', `APPROVED ${subject} block ${e.blockNumber}: no decision stored, nothing to mirror`, { address: subject, hash: e.txHash })
      return
    }
    const existing = this.store.get(subject)
    if (!existing) {
      const rules = buildRules({ expiry: decision.expiry }, this.env())
      const { policyId, ruleIds } = await this.backend.create(subject, rules)
      this.store.put({ address: subject, policyId, rules, ruleIds, createdAt: Date.now(), updatedAt: Date.now() })
      this.store.add('policy', `POLICY CREATED ${policyId} for ${subject}: ${rules.length} rules, expiry ${decision.expiry} (Approved in block ${e.blockNumber})`, { address: subject, hash: e.txHash })
      return
    }
    const wanted = applyApproved(existing.rules, { expiry: decision.expiry }, this.env())
    if (hasDenyAll(existing.rules)) {
      await this.backend.deleteRule(existing, RULE_REVOKED)
      delete existing.ruleIds[RULE_REVOKED]
      this.store.add('policy', `POLICY DENY-ALL REMOVED ${existing.policyId} for ${subject} (Approved in block ${e.blockNumber})`, { address: subject, hash: e.txHash })
    }
    if (expiryOf(existing.rules) !== decision.expiry) {
      const rule = wanted.find((r) => r.name === RULE_EXPIRY)!
      await this.backend.updateRule(existing, rule)
      this.store.add('policy', `POLICY EXPIRY UPDATED ${existing.policyId} for ${subject}: ${decision.expiry}`, { address: subject, hash: e.txHash })
    }
    existing.rules = wanted
    existing.updatedAt = Date.now()
  }

  private async onRevoked(subject: Address, e: RegistryEvent): Promise<void> {
    const existing = this.store.get(subject)
    if (!existing) {
      this.store.add('watch', `REVOKED ${subject} block ${e.blockNumber}: no policy for this address, nothing to close`, { address: subject, hash: e.txHash })
      return
    }
    if (hasDenyAll(existing.rules)) return
    const rule = denyAllRule()
    const id = await this.backend.addRule(existing, rule)
    existing.ruleIds[RULE_REVOKED] = id
    existing.rules = applyRevoked(existing.rules)
    existing.updatedAt = Date.now()
    this.store.add('policy', `POLICY DENY-ALL ADDED ${existing.policyId} for ${subject} (Revoked in block ${e.blockNumber})`, { address: subject, hash: e.txHash })
  }
}
