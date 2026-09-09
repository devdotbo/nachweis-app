/**
 * The treasury policy. Pure: no network, no clock.
 *
 * Two ALLOW rules on `eth_signTransaction` (the desk signs with Privy and broadcasts itself, so the signing
 * request is what the policy sees), everything else denied by Privy's default:
 *   1. "payout through the gate": `to` is GatedPayout, `chain_id` is the configured chain, the calldata decodes to
 *      `payout(...)` and `payout.total <= cap`.
 *   2. "allowance for the gate": `to` is the stablecoin, `chain_id` matches, the calldata decodes to `approve(...)`
 *      and `approve.spender` is GatedPayout. The treasury keeps custody; the gate pulls with transferFrom.
 * A plain `transfer` on the stablecoin, any call to another contract and any other method resolve no rule and are
 * denied (FACT, https://docs.privy.io/controls/policies/overview: "If no rules resolve, the policy will default to
 * DENY", fetched 2026-09-09).
 *
 * The shapes below are the request body of `POST /v1/policies` (`@privy-io/node` 0.34.0, resources/policies.d.ts).
 * `evaluate` is the local evaluator used in PAYOUT_SIGNER=local; it mirrors the documented semantics and is
 * captioned simulated on screen.
 */
import { decodeFunctionData, getAddress, toHex, type Address, type Hex } from 'viem'

export const GATED_PAYOUT_ABI = [
  {
    name: 'payout',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'total', type: 'uint256' },
      { name: 'runRef', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

export const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export type PolicyAction = 'ALLOW' | 'DENY'
export type PolicyMethod = 'eth_signTransaction' | 'eth_sendTransaction' | 'personal_sign' | 'eth_signTypedData_v4' | '*'
export type ConditionOperator = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'

export type PolicyCondition =
  | { field_source: 'ethereum_transaction'; field: 'to' | 'value' | 'chain_id'; operator: ConditionOperator; value: string }
  | { field_source: 'ethereum_calldata'; field: string; abi: readonly unknown[]; operator: ConditionOperator; value: string }

export interface PolicyRule {
  name: string
  method: PolicyMethod
  action: PolicyAction
  conditions: PolicyCondition[]
}

export const RULE_PAYOUT = 'payout through the gate'
export const RULE_ALLOWANCE = 'allowance for the gate'

export interface PolicyEnv {
  chainId: number
  gate: Address
  token: Address
  /** Per-run cap in token units. */
  cap: bigint
}

export function buildRules(env: PolicyEnv): PolicyRule[] {
  return [
    {
      name: RULE_PAYOUT,
      method: 'eth_signTransaction',
      action: 'ALLOW',
      conditions: [
        { field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: getAddress(env.gate) },
        { field_source: 'ethereum_transaction', field: 'chain_id', operator: 'eq', value: String(env.chainId) },
        { field_source: 'ethereum_calldata', field: 'function_name', abi: GATED_PAYOUT_ABI, operator: 'eq', value: 'payout' },
        { field_source: 'ethereum_calldata', field: 'payout.total', abi: GATED_PAYOUT_ABI, operator: 'lte', value: toHex(env.cap) },
      ],
    },
    {
      name: RULE_ALLOWANCE,
      method: 'eth_signTransaction',
      action: 'ALLOW',
      conditions: [
        { field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: getAddress(env.token) },
        { field_source: 'ethereum_transaction', field: 'chain_id', operator: 'eq', value: String(env.chainId) },
        { field_source: 'ethereum_calldata', field: 'function_name', abi: ERC20_APPROVE_ABI, operator: 'eq', value: 'approve' },
        { field_source: 'ethereum_calldata', field: 'approve.spender', abi: ERC20_APPROVE_ABI, operator: 'eq', value: getAddress(env.gate) },
      ],
    },
  ]
}

/** The rules in plain words, one line per rule, for the company screen and the docs. */
export function describeRules(rules: PolicyRule[], decimals = 6, symbol = 'mUSD'): string[] {
  const lines = rules.map((r) => {
    const to = r.conditions.find((c) => c.field_source === 'ethereum_transaction' && c.field === 'to')?.value ?? '?'
    const chain = r.conditions.find((c) => c.field_source === 'ethereum_transaction' && c.field === 'chain_id')?.value ?? '?'
    if (r.name === RULE_PAYOUT) {
      const capHex = r.conditions.find((c) => c.field_source === 'ethereum_calldata' && c.field === 'payout.total')?.value
      const cap = capHex ? formatUnits(BigInt(capHex), decimals) : '?'
      return `Allow signing a transaction only to GatedPayout ${to} on chain ${chain}, only when the calldata is payout(...) with a total of at most ${cap} ${symbol}.`
    }
    if (r.name === RULE_ALLOWANCE) {
      const spender = r.conditions.find((c) => c.field_source === 'ethereum_calldata' && c.field === 'approve.spender')?.value ?? '?'
      return `Allow signing approve(...) on the stablecoin ${to} on chain ${chain} only with GatedPayout ${spender} as the spender.`
    }
    return `${r.action} ${r.method} (${r.name})`
  })
  lines.push('Deny everything else: a plain transfer, any other contract, any other method (Privy denies whatever no rule allows).')
  return lines
}

function formatUnits(v: bigint, decimals: number): string {
  const s = v.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${int}.${frac}` : int
}

// ---------------------------------------------------------------------------
// Local evaluator (PAYOUT_SIGNER=local): simulated Privy policy, dev loop only.
// ---------------------------------------------------------------------------

export interface DecodedCall {
  functionName: string
  args: Record<string, unknown>
}

export interface EvalRequest {
  method: PolicyMethod
  to: Address
  chainId: number
  /** Raw calldata; decoded against each rule's ABI, the way Privy's `ethereum_calldata` source does. */
  data: Hex
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

/** Decodes calldata against an ABI into named arguments; undefined when it does not decode. */
export function decodeCall(abi: readonly unknown[], data: Hex): DecodedCall | undefined {
  try {
    const d = decodeFunctionData({ abi: abi as never, data }) as { functionName: string; args?: readonly unknown[] }
    const item = (abi as { type: string; name: string; inputs: { name: string }[] }[]).find((x) => x.type === 'function' && x.name === d.functionName)
    const args: Record<string, unknown> = {}
    item?.inputs.forEach((inp, i) => {
      args[inp.name] = d.args?.[i]
    })
    return { functionName: d.functionName, args }
  } catch {
    return undefined
  }
}

function conditionHolds(c: PolicyCondition, req: EvalRequest): boolean {
  switch (c.field_source) {
    case 'ethereum_transaction':
      if (c.field === 'to') return c.operator === 'eq' && getAddress(req.to) === getAddress(c.value)
      if (c.field === 'chain_id') return compare(c.operator, BigInt(req.chainId), BigInt(c.value))
      return false
    case 'ethereum_calldata': {
      const call = decodeCall(c.abi, req.data)
      if (!call) return false
      if (c.field === 'function_name') return c.operator === 'eq' && call.functionName === c.value
      const [fn, arg] = c.field.split('.')
      if (fn !== call.functionName || !arg) return false
      const v = call.args[arg]
      if (typeof v === 'bigint') return compare(c.operator, v, BigInt(c.value))
      if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return c.operator === 'eq' && getAddress(v) === getAddress(c.value)
      return false
    }
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
