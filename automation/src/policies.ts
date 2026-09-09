/**
 * Where the rules live: on the Privy app (privy mode, `POST /v1/policies` and the rule routes) or in
 * memory (local mode). Policies are created without an owner, so the app secret alone updates them
 * (FACT, https://docs.privy.io/controls/policies/create-a-policy.md, fetched 2026-09-09): the
 * automation is the issuer's system and holds the secret.
 */
import type { Address } from 'viem'
import type { Config } from './config'
import { type PolicyRule } from './policy'
import { privyClient } from './privy'
import type { InvestorPolicy, Store } from './store'

export interface PolicyBackend {
  create(address: Address, rules: PolicyRule[]): Promise<{ policyId: string; ruleIds: Record<string, string> }>
  addRule(p: InvestorPolicy, rule: PolicyRule): Promise<string>
  updateRule(p: InvestorPolicy, rule: PolicyRule): Promise<void>
  deleteRule(p: InvestorPolicy, ruleName: string): Promise<void>
}

export function policyName(address: Address): string {
  return `attestat-standing-order-${address.toLowerCase()}`
}

class LocalPolicies implements PolicyBackend {
  constructor(private store: Store) {}
  async create(_address: Address, rules: PolicyRule[]) {
    const policyId = this.store.nextLocalId()
    const ruleIds: Record<string, string> = {}
    rules.forEach((r, i) => (ruleIds[r.name] = `${policyId}-rule-${i + 1}`))
    return { policyId, ruleIds }
  }
  async addRule(p: InvestorPolicy) {
    return `${p.policyId}-rule-${Object.keys(p.ruleIds).length + 1}`
  }
  async updateRule() {}
  async deleteRule() {}
}

class PrivyPolicies implements PolicyBackend {
  constructor(private cfg: Config) {}
  async create(address: Address, rules: PolicyRule[]) {
    const created = await privyClient(this.cfg).policies().create({ name: policyName(address), chain_type: 'ethereum', version: '1.0', rules })
    const ruleIds: Record<string, string> = {}
    for (const r of created.rules) ruleIds[r.name] = r.id
    return { policyId: created.id, ruleIds }
  }
  async addRule(p: InvestorPolicy, rule: PolicyRule) {
    const r = await privyClient(this.cfg).policies().createRule(p.policyId, rule)
    return r.id
  }
  async updateRule(p: InvestorPolicy, rule: PolicyRule) {
    const id = p.ruleIds[rule.name]
    if (!id) throw new Error(`no rule id for "${rule.name}" on policy ${p.policyId}`)
    await privyClient(this.cfg).policies().updateRule(id, { policy_id: p.policyId, ...rule })
  }
  async deleteRule(p: InvestorPolicy, ruleName: string) {
    const id = p.ruleIds[ruleName]
    if (!id) return
    await privyClient(this.cfg).policies().deleteRule(id, { policy_id: p.policyId })
  }
}

export function policyBackend(cfg: Config, store: Store): PolicyBackend {
  return cfg.signer === 'privy' ? new PrivyPolicies(cfg) : new LocalPolicies(store)
}
