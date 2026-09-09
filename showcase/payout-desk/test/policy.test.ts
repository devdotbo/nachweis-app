import { describe, expect, test } from 'bun:test'
import { encodeFunctionData, type Address } from 'viem'
import { buildRules, decodeCall, describeRules, ERC20_APPROVE_ABI, evaluate, GATED_PAYOUT_ABI, RULE_ALLOWANCE, RULE_PAYOUT } from '../src/policy'

const GATE: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const TOKEN: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
const OTHER: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const ALICE: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const CAP = 1_000_000_000n // 1000 mUSD
const rules = buildRules({ chainId: 31337, gate: GATE, token: TOKEN, cap: CAP })

const ref = `0x${'ab'.repeat(32)}` as const
const payout = (amounts: bigint[], total = amounts.reduce((s, a) => s + a, 0n)) =>
  encodeFunctionData({ abi: GATED_PAYOUT_ABI, functionName: 'payout', args: [amounts.map(() => ALICE), amounts, total, ref] })
const approve = (spender: Address) => encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [spender, 2n ** 256n - 1n] })
const transferAbi = [{ name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ type: 'bool' }] }] as const
const transfer = encodeFunctionData({ abi: transferAbi, functionName: 'transfer', args: [ALICE, 100_000_000n] })

describe('rules', () => {
  test('two ALLOW rules on eth_signTransaction, gate and token pinned, cap in hex', () => {
    expect(rules.map((r) => [r.name, r.method, r.action])).toEqual([
      [RULE_PAYOUT, 'eth_signTransaction', 'ALLOW'],
      [RULE_ALLOWANCE, 'eth_signTransaction', 'ALLOW'],
    ])
    const cap = rules[0].conditions.find((c) => c.field_source === 'ethereum_calldata' && c.field === 'payout.total')
    expect(cap).toMatchObject({ operator: 'lte', value: '0x3b9aca00' })
    expect(rules[0].conditions.find((c) => c.field === 'to')).toMatchObject({ value: GATE })
    expect(rules[1].conditions.find((c) => c.field === 'approve.spender')).toMatchObject({ value: GATE })
  })

  test('described in plain words with the cap in token units', () => {
    const lines = describeRules(rules)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('at most 1000 mUSD')
    expect(lines[2]).toContain('Deny everything else')
  })
})

describe('local evaluator (simulated Privy policy)', () => {
  const req = (to: Address, data: `0x${string}`, chainId = 31337, method: 'eth_signTransaction' | 'eth_sendTransaction' | 'personal_sign' = 'eth_signTransaction') => ({ method, to, chainId, data })

  test('payout under the cap to the gate is allowed', () => {
    const v = evaluate(rules, req(GATE, payout([100_000_000n, 200_000_000n])))
    expect(v).toEqual({ allowed: true, rule: RULE_PAYOUT, reason: `allowed by rule "${RULE_PAYOUT}"` })
  })

  test('payout at the cap is allowed, one unit over is denied', () => {
    expect(evaluate(rules, req(GATE, payout([CAP]))).allowed).toBe(true)
    const over = evaluate(rules, req(GATE, payout([CAP + 1n])))
    expect(over.allowed).toBe(false)
    expect(over.rule).toBe('default')
  })

  test('a lying total (calldata total below the amounts) is judged by the total field, the contract catches the rest', () => {
    // The policy reads payout.total; GatedPayout reverts TotalMismatch when the amounts do not add up.
    expect(evaluate(rules, req(GATE, payout([CAP + 1n], 1n))).allowed).toBe(true)
  })

  test('payout calldata to another contract is denied', () => {
    expect(evaluate(rules, req(OTHER, payout([1n]))).allowed).toBe(false)
  })

  test('payout on another chain is denied', () => {
    expect(evaluate(rules, req(GATE, payout([1n]), 11155111)).allowed).toBe(false)
  })

  test('approve with the gate as spender is allowed, any other spender is denied', () => {
    expect(evaluate(rules, req(TOKEN, approve(GATE)))).toMatchObject({ allowed: true, rule: RULE_ALLOWANCE })
    expect(evaluate(rules, req(TOKEN, approve(OTHER))).allowed).toBe(false)
    expect(evaluate(rules, req(TOKEN, approve(ALICE))).allowed).toBe(false)
  })

  test('a plain transfer on the stablecoin (bypassing the gate) is denied', () => {
    const v = evaluate(rules, req(TOKEN, transfer))
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('denied: no rule allows this request')
  })

  test('other methods resolve no rule', () => {
    expect(evaluate(rules, req(GATE, payout([1n]), 31337, 'eth_sendTransaction')).allowed).toBe(false)
    expect(evaluate(rules, req(GATE, payout([1n]), 31337, 'personal_sign')).allowed).toBe(false)
  })

  test('empty or foreign calldata is denied', () => {
    expect(evaluate(rules, req(GATE, '0x')).allowed).toBe(false)
    expect(evaluate(rules, req(GATE, '0xdeadbeef')).allowed).toBe(false)
  })
})

describe('decodeCall', () => {
  test('names the arguments', () => {
    const c = decodeCall(GATED_PAYOUT_ABI, payout([5n]))
    expect(c?.functionName).toBe('payout')
    expect(c?.args.total).toBe(5n)
    expect(decodeCall(GATED_PAYOUT_ABI, transfer)).toBeUndefined()
  })
})
