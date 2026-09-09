/**
 * The operator policy: the rule JSON sent to Privy (privy mode) and evaluated in memory
 * (local mode, "simulated"). Pure: no I/O beyond the ABI module. The evaluator mimics Privy's
 * semantics for the subset used here: DENY wins, an ALLOW rule matches when every condition
 * holds, anything else is denied by default.
 */
import type { PolicyCreateParams } from '@privy-io/node/resources'
import type { AbiFunction, Address } from 'viem'
import { abiFunction } from './abi'
import type { PolicyRuleView, Role } from './types'

export const POLICY_NAME = 'attestat-backoffice-registry-operator'

export type PolicyOperator = 'eq' | 'in'
export type PolicyCondition =
  | { field_source: 'ethereum_transaction'; field: 'to' | 'value' | 'chain_id'; operator: PolicyOperator; value: string | string[] }
  | { field_source: 'ethereum_calldata'; field: string; abi: readonly AbiFunction[]; operator: PolicyOperator; value: string | string[] }
export interface PolicyRule {
  name: string
  method: 'eth_sendTransaction'
  action: 'ALLOW' | 'DENY'
  conditions: PolicyCondition[]
}
/** Compile-time check that the local rule type fits the SDK's create params. */
type Assert<T extends true> = T
export type RulesFitSdk = Assert<PolicyRule[] extends PolicyCreateParams['rules'] ? true : false>

function allowCall(registry: Address, chainIds: number[], fn: 'approve' | 'revoke'): PolicyRule {
  return {
    name: `Allow ${fn} on the AttestationRegistry`,
    method: 'eth_sendTransaction',
    action: 'ALLOW',
    conditions: [
      { field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: registry },
      { field_source: 'ethereum_transaction', field: 'chain_id', operator: 'in', value: chainIds.map(String) },
      { field_source: 'ethereum_calldata', field: 'function_name', abi: [abiFunction(fn)], operator: 'eq', value: fn },
    ],
  }
}

/** Only approve and revoke on the registry, on the listed chains. Privy denies everything else by default. */
export function registryOperatorRules(registry: Address, chainIds: number[]): PolicyRule[] {
  return [allowCall(registry, chainIds, 'approve'), allowCall(registry, chainIds, 'revoke')]
}

export function policyCreateParams(registry: Address, chainIds: number[], ownerId?: string) {
  return {
    name: POLICY_NAME,
    chain_type: 'ethereum' as const,
    version: '1.0' as const,
    rules: registryOperatorRules(registry, chainIds),
    ...(ownerId ? { owner_id: ownerId } : {}),
  }
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr
}

function describeCondition(c: PolicyCondition): string {
  const list = Array.isArray(c.value) ? c.value : [c.value]
  if (c.field_source === 'ethereum_calldata') {
    return c.field === 'function_name'
      ? `calldata function is ${list.join(' or ')}`
      : `calldata ${c.field} ${c.operator === 'in' ? 'in' : 'equals'} ${list.join(', ')}`
  }
  const label = c.field === 'chain_id' ? 'chain id' : c.field
  const values = c.field === 'to' ? list.map(short) : list
  return c.operator === 'in' ? `${label} in ${values.join(', ')}` : `${label} equals ${values.join(', ')}`
}

export function describeRules(rules: PolicyRule[]): PolicyRuleView[] {
  return rules.map((r) => ({ name: r.name, method: r.method, action: r.action, conditions: r.conditions.map(describeCondition) }))
}

export interface PolicyRequest {
  method: string
  /** Absent for requests that carry no transaction (personal_sign). */
  to?: string
  chainId: number
  functionName?: string
  value?: bigint | string
}

function matchOne(c: PolicyCondition, actual: string | undefined, caseInsensitive = false): boolean {
  if (c.operator !== 'eq' && c.operator !== 'in') throw new Error(`unsupported policy operator ${String(c.operator)}`)
  if (actual === undefined) return false
  const norm = (s: string) => (caseInsensitive ? s.toLowerCase() : s)
  const wanted = (Array.isArray(c.value) ? c.value : [c.value]).map(norm)
  if (c.operator === 'eq' && wanted.length !== 1) throw new Error('eq needs exactly one value')
  return wanted.includes(norm(actual))
}

function matches(c: PolicyCondition, req: PolicyRequest): boolean {
  if (c.field_source === 'ethereum_transaction') {
    if (c.field === 'to') return matchOne(c, req.to, true)
    if (c.field === 'chain_id') return matchOne(c, String(req.chainId))
    return matchOne(c, req.value === undefined ? undefined : String(req.value))
  }
  if (c.field === 'function_name') return matchOne(c, req.functionName)
  throw new Error(`unsupported calldata field ${c.field}`)
}

export function evaluate(rules: PolicyRule[], req: PolicyRequest): { allowed: boolean; reason: string } {
  const hit = rules.filter((r) => r.method === req.method && r.conditions.every((c) => matches(c, req)))
  const deny = hit.find((r) => r.action === 'DENY')
  if (deny) return { allowed: false, reason: `denied by rule "${deny.name}"` }
  const allow = hit.find((r) => r.action === 'ALLOW')
  if (allow) return { allowed: true, reason: `allowed by rule "${allow.name}"` }
  return { allowed: false, reason: req.to ? `no rule allows ${req.method} to ${req.to} (function ${req.functionName ?? 'none'})` : `no rule allows ${req.method}` }
}

export function quorumSatisfied(confirmations: Partial<Record<Role, number>>, threshold: number): boolean {
  return Object.values(confirmations).filter((t) => typeof t === 'number').length >= threshold
}

export function missingRoles(confirmations: Partial<Record<Role, number>>, roles: readonly Role[]): Role[] {
  return roles.filter((r) => typeof confirmations[r] !== 'number')
}
