import { describe, expect, test } from 'bun:test'
import { encodeAttestByOperator, encodeApprove, decodeFunctionName } from '../src/chain'
import {
  POLICY_NAME,
  describeRules,
  evaluate,
  missingRoles,
  policyCreateParams,
  quorumSatisfied,
  registryOperatorRules,
  type PolicyRule,
} from '../src/policy'

const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const OTHER = '0x000000000000000000000000000000000000dEaD'
const POLICY = `0x${'11'.repeat(32)}` as const
const rules = registryOperatorRules(REGISTRY, [31337, 11155111])
const req = (over: Partial<Parameters<typeof evaluate>[1]>) => ({
  method: 'eth_sendTransaction',
  to: REGISTRY,
  chainId: 31337,
  functionName: 'approve',
  ...over,
})

describe('registryOperatorRules', () => {
  test('two ALLOW rules for eth_sendTransaction with to, chain_id and function_name conditions', () => {
    expect(rules).toHaveLength(2)
    for (const r of rules) {
      expect(r.action).toBe('ALLOW')
      expect(r.method).toBe('eth_sendTransaction')
      expect(r.conditions.map((c) => `${c.field_source}:${c.field}:${c.operator}`)).toEqual([
        'ethereum_transaction:to:eq',
        'ethereum_transaction:chain_id:in',
        'ethereum_calldata:function_name:eq',
      ])
      expect(r.conditions[0]!.value).toBe(REGISTRY)
      expect(r.conditions[1]!.value).toEqual(['31337', '11155111'])
    }
    const fns = rules.map((r) => r.conditions[2]!)
    expect(fns.map((c) => c.value)).toEqual(['approve', 'revoke'])
    for (const c of fns) {
      if (c.field_source !== 'ethereum_calldata') throw new Error('expected calldata condition')
      expect(c.abi).toHaveLength(1)
      expect(c.abi[0]!.type).toBe('function')
      expect(c.abi[0]!.name).toBe(String(c.value))
    }
  })

  test('policyCreateParams carries the name, version and optional owner', () => {
    const p = policyCreateParams(REGISTRY, [31337], 'kq-1')
    expect(p).toMatchObject({ name: POLICY_NAME, chain_type: 'ethereum', version: '1.0', owner_id: 'kq-1' })
    expect('owner_id' in policyCreateParams(REGISTRY, [31337])).toBe(false)
  })

  test('describeRules speaks plainly', () => {
    const v = describeRules(rules)
    expect(v[0]!.conditions).toEqual(['to equals 0x5FbD...0aa3', 'chain id in 31337, 11155111', 'calldata function is approve'])
    expect(v[1]!.name).toBe('Allow revoke on the AttestationRegistry')
  })
})

describe('evaluate', () => {
  test('approve to the registry on 31337 is allowed', () => {
    expect(evaluate(rules, req({})).allowed).toBe(true)
  })
  test('revoke is allowed, on either chain, case-insensitive to', () => {
    expect(evaluate(rules, req({ functionName: 'revoke', chainId: 11155111, to: REGISTRY.toLowerCase() })).allowed).toBe(true)
  })
  test('approve to another address is denied', () => {
    const v = evaluate(rules, req({ to: OTHER }))
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe(`no rule allows eth_sendTransaction to ${OTHER} (function approve)`)
  })
  test('attestByOperator to the registry is denied', () => {
    expect(evaluate(rules, req({ functionName: decodeFunctionName(encodeAttestByOperator(OTHER, POLICY)) })).allowed).toBe(false)
  })
  test('a plain transfer (no function) is denied', () => {
    const v = evaluate(rules, req({ to: OTHER, functionName: undefined, value: 1n }))
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('(function none)')
  })
  test('chain 1 is denied', () => {
    expect(evaluate(rules, req({ chainId: 1 })).allowed).toBe(false)
  })
  test('a DENY rule beats ALLOW', () => {
    const deny: PolicyRule = {
      name: 'Deny everything to the registry',
      method: 'eth_sendTransaction',
      action: 'DENY',
      conditions: [{ field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: REGISTRY }],
    }
    const v = evaluate([...rules, deny], req({}))
    expect(v.allowed).toBe(false)
    expect(v.reason).toContain('Deny everything')
  })
  test('other methods do not match eth_sendTransaction rules', () => {
    expect(evaluate(rules, req({ method: 'personal_sign' })).allowed).toBe(false)
  })
  test('unsupported operators throw', () => {
    const bad = { ...rules[0]!, conditions: [{ ...rules[0]!.conditions[0]!, operator: 'gt' as 'eq' }] }
    expect(() => evaluate([bad], req({}))).toThrow('unsupported policy operator')
  })
  test('encodeApprove decodes back to approve', () => {
    expect(decodeFunctionName(encodeApprove(OTHER, POLICY))).toBe('approve')
    expect(decodeFunctionName('0x')).toBeUndefined()
    expect(decodeFunctionName('0xdeadbeef')).toBeUndefined()
  })
})

describe('quorum', () => {
  test('quorumSatisfied counts distinct roles', () => {
    expect(quorumSatisfied({}, 2)).toBe(false)
    expect(quorumSatisfied({ compliance: 1 }, 2)).toBe(false)
    expect(quorumSatisfied({ compliance: 1, operations: 2 }, 2)).toBe(true)
  })
  test('missingRoles lists who has not confirmed', () => {
    expect(missingRoles({ compliance: 1 }, ['compliance', 'operations'])).toEqual(['operations'])
    expect(missingRoles({ compliance: 1, operations: 1 }, ['compliance', 'operations'])).toEqual([])
  })
})
