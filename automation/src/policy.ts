/**
 * The Privy policy as a function of the on-chain decision. Pure: no network, no clock.
 *
 * Two rules per investor (docs/privy-standing-order.md):
 *   1. DENY every method once `system.current_unix_timestamp >= decision.expiry`.
 *   2. ALLOW eth_sendTransaction when `to` is the Subscription contract, `chain_id` is the configured
 *      chain and the calldata decodes to `subscribe()` (ABI inline, as Privy's calldata condition needs).
 * A third rule, DENY every method with no condition, is appended when the registry emits Revoked and
 * removed again when it emits Approved. Privy evaluates DENY before ALLOW and denies whatever no rule
 * resolves (FACT, https://docs.privy.io/controls/policies/overview, fetched 2026-09-09), so the rule
 * set is exactly "subscribe into this fund, until the decision expires, unless revoked".
 *
 * The shapes below are the request bodies of `POST /v1/policies` and `POST /v1/policies/:id/rules`
 * (`@privy-io/node` 0.34.0, resources/policies.d.ts). `evaluate` is the local evaluator used in
 * AUTOMATION_SIGNER=local; it mirrors the documented semantics and is captioned simulated.
 */
import { getAddress, type Address } from 'viem'

export const SUBSCRIBE_ABI = [{ name: 'subscribe', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }] as const

export type PolicyAction = 'ALLOW' | 'DENY'
export type PolicyMethod = 'eth_sendTransaction' | 'eth_signTransaction' | 'personal_sign' | 'eth_signTypedData_v4' | '*'
export type ConditionOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'

export type PolicyCondition =
  | { field_source: 'ethereum_transaction'; field: 'to' | 'value' | 'chain_id'; operator: ConditionOperator; value: string }
  | { field_source: 'ethereum_calldata'; field: string; abi: typeof SUBSCRIBE_ABI; operator: ConditionOperator; value: string }
  | { field_source: 'system'; field: 'current_unix_timestamp'; operator: ConditionOperator; value: string }

export interface PolicyRule {
  name: string
  method: PolicyMethod
  action: PolicyAction
  conditions: PolicyCondition[]
}

export const RULE_EXPIRY = 'decision expired: deny everything'
export const RULE_SUBSCRIBE = 'subscribe into the fund'
export const RULE_REVOKED = 'decision revoked: deny everything'

export interface DecisionInput {
  /** Unix seconds, `Decision.expiry` from `decisionOf`. */
  expiry: bigint
}

export interface PolicyEnv {
  chainId: number
  subscription: Address
}

/** The two rules for a live decision. */
export function buildRules(decision: DecisionInput, env: PolicyEnv): PolicyRule[] {
  return [
    {
      name: RULE_EXPIRY,
      method: '*',
      action: 'DENY',
      conditions: [{ field_source: 'system', field: 'current_unix_timestamp', operator: 'gte', value: decision.expiry.toString() }],
    },
    {
      name: RULE_SUBSCRIBE,
      method: 'eth_sendTransaction',
      action: 'ALLOW',
      conditions: [
        { field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: getAddress(env.subscription) },
        { field_source: 'ethereum_transaction', field: 'chain_id', operator: 'eq', value: String(env.chainId) },
        { field_source: 'ethereum_calldata', field: 'function_name', abi: SUBSCRIBE_ABI, operator: 'eq', value: 'subscribe' },
      ],
    },
  ]
}

export function denyAllRule(): PolicyRule {
  return { name: RULE_REVOKED, method: '*', action: 'DENY', conditions: [] }
}

export function hasDenyAll(rules: PolicyRule[]): boolean {
  return rules.some((r) => r.name === RULE_REVOKED)
}

/** After `Revoked`: the deny-all rule is present exactly once. */
export function applyRevoked(rules: PolicyRule[]): PolicyRule[] {
  return hasDenyAll(rules) ? rules : [...rules, denyAllRule()]
}

/** After `Approved`: the deny-all rule is gone and the expiry rule carries the decision's current expiry. */
export function applyApproved(rules: PolicyRule[], decision: DecisionInput, env: PolicyEnv): PolicyRule[] {
  const fresh = buildRules(decision, env)
  const kept = rules.filter((r) => r.name !== RULE_REVOKED && r.name !== RULE_EXPIRY && r.name !== RULE_SUBSCRIBE)
  return [...fresh, ...kept]
}

/** The expiry the rule set encodes, or undefined when there is no expiry rule. */
export function expiryOf(rules: PolicyRule[]): bigint | undefined {
  const r = rules.find((x) => x.name === RULE_EXPIRY)
  const c = r?.conditions.find((x) => x.field_source === 'system')
  return c ? BigInt(c.value) : undefined
}

function utc(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

/** The rules in plain words, one line per rule, for the two screens. */
export function describeRules(rules: PolicyRule[]): string[] {
  return rules.map((r) => {
    if (r.name === RULE_REVOKED) return 'Deny every request: the issuer revoked the decision.'
    if (r.name === RULE_EXPIRY) {
      const e = expiryOf([r])
      return `Deny every request once the clock passes the decision's expiry${e === undefined ? '' : `, ${utc(e)}`}.`
    }
    if (r.name === RULE_SUBSCRIBE) {
      const to = r.conditions.find((c) => c.field_source === 'ethereum_transaction' && c.field === 'to')?.value ?? '?'
      const chain = r.conditions.find((c) => c.field_source === 'ethereum_transaction' && c.field === 'chain_id')?.value ?? '?'
      return `Allow eth_sendTransaction only to the Subscription contract ${to} on chain ${chain}, only when the calldata is subscribe().`
    }
    return `${r.action} ${r.method} (${r.name})`
  })
}

// ---------------------------------------------------------------------------
// Local evaluator (AUTOMATION_SIGNER=local): simulated Privy policy, dev loop only.
// ---------------------------------------------------------------------------

export interface EvalRequest {
  method: PolicyMethod
  to: Address
  chainId: number
  /** Decoded calldata function name, undefined when the calldata does not decode against the rule's ABI. */
  functionName?: string
  /** Unix seconds the evaluator uses as `system.current_unix_timestamp`. */
  now: bigint
}

export interface EvalResult {
  allowed: boolean
  /** Name of the rule that decided, or 'default' when no rule resolved (Privy denies by default). */
  rule: string
  reason: string
}

function compare(op: ConditionOperator, left: bigint, right: bigint): boolean {
  switch (op) {
    case 'eq':
      return left === right
    case 'gt':
      return left > right
    case 'gte':
      return left >= right
    case 'lt':
      return left < right
    case 'lte':
      return left <= right
    default:
      return false
  }
}

function conditionHolds(c: PolicyCondition, req: EvalRequest): boolean {
  switch (c.field_source) {
    case 'system':
      return compare(c.operator, req.now, BigInt(c.value))
    case 'ethereum_transaction':
      if (c.field === 'to') return c.operator === 'eq' && getAddress(req.to) === getAddress(c.value)
      if (c.field === 'chain_id') return compare(c.operator, BigInt(req.chainId), BigInt(c.value))
      return false
    case 'ethereum_calldata':
      return c.field === 'function_name' && c.operator === 'eq' && req.functionName === c.value
    default:
      return false
  }
}

/** DENY rules first, then ALLOW rules, default DENY: the order Privy documents. */
export function evaluate(rules: PolicyRule[], req: EvalRequest): EvalResult {
  const applicable = rules.filter((r) => r.method === '*' || r.method === req.method)
  for (const action of ['DENY', 'ALLOW'] as const) {
    for (const r of applicable) {
      if (r.action !== action) continue
      if (r.conditions.every((c) => conditionHolds(c, req))) {
        return { allowed: action === 'ALLOW', rule: r.name, reason: action === 'ALLOW' ? `allowed by rule "${r.name}"` : `denied by rule "${r.name}"` }
      }
    }
  }
  return { allowed: false, rule: 'default', reason: 'denied: no rule allows this request' }
}
