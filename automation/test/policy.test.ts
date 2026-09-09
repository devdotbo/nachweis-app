import { describe, expect, test } from 'bun:test'
import { applyApproved, applyRevoked, buildRules, describeRules, evaluate, expiryOf, hasDenyAll, RULE_EXPIRY, RULE_REVOKED, RULE_SUBSCRIBE } from '../src/policy'

const SUBSCRIPTION = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as const
const FUND_TOKEN = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as const
const ENV = { chainId: 11155111, subscription: SUBSCRIPTION }
const E = 1_800_000_000n

const ok = { method: 'eth_sendTransaction' as const, to: SUBSCRIPTION, chainId: 11155111, functionName: 'subscribe', now: E - 1n }

describe('buildRules', () => {
  test('exactly two rules: DENY * at current_unix_timestamp >= expiry, ALLOW eth_sendTransaction for subscribe() on the Subscription contract on the chain', () => {
    const rules = buildRules({ expiry: E }, ENV)
    expect(rules).toHaveLength(2)
    expect(rules[0]).toEqual({
      name: RULE_EXPIRY,
      method: '*',
      action: 'DENY',
      conditions: [{ field_source: 'system', field: 'current_unix_timestamp', operator: 'gte', value: E.toString() }],
    })
    expect(rules[1]!.name).toBe(RULE_SUBSCRIBE)
    expect(rules[1]!.method).toBe('eth_sendTransaction')
    expect(rules[1]!.action).toBe('ALLOW')
    const c = rules[1]!.conditions
    expect(c).toHaveLength(3)
    expect(c[0]).toEqual({ field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: SUBSCRIPTION })
    expect(c[1]).toEqual({ field_source: 'ethereum_transaction', field: 'chain_id', operator: 'eq', value: '11155111' })
    expect(c[2]).toMatchObject({ field_source: 'ethereum_calldata', field: 'function_name', operator: 'eq', value: 'subscribe' })
    expect((c[2] as unknown as { abi: unknown[] }).abi).toEqual([{ name: 'subscribe', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }])
  })
  test('the subscription address is checksummed whatever case it came in', () => {
    const rules = buildRules({ expiry: E }, { chainId: 31337, subscription: SUBSCRIPTION.toLowerCase() as `0x${string}` })
    expect(rules[1]!.conditions[0]!.value).toBe(SUBSCRIPTION)
    expect(rules[1]!.conditions[1]!.value).toBe('31337')
  })
  test('expiryOf reads the expiry back', () => {
    expect(expiryOf(buildRules({ expiry: E }, ENV))).toBe(E)
  })
})

describe('Revoked and Approved', () => {
  test('after Revoked the rule set carries a DENY-all, once', () => {
    const revoked = applyRevoked(buildRules({ expiry: E }, ENV))
    expect(revoked).toHaveLength(3)
    expect(revoked[2]).toEqual({ name: RULE_REVOKED, method: '*', action: 'DENY', conditions: [] })
    expect(hasDenyAll(revoked)).toBe(true)
    expect(applyRevoked(revoked)).toHaveLength(3)
  })
  test('after a fresh Approved the DENY-all is gone and the expiry follows the decision', () => {
    const revoked = applyRevoked(buildRules({ expiry: E }, ENV))
    const again = applyApproved(revoked, { expiry: E + 100n }, ENV)
    expect(again).toHaveLength(2)
    expect(hasDenyAll(again)).toBe(false)
    expect(expiryOf(again)).toBe(E + 100n)
    expect(again.map((r) => r.name)).toEqual([RULE_EXPIRY, RULE_SUBSCRIBE])
  })
})

describe('evaluate (local evaluator, simulated Privy policy)', () => {
  const rules = buildRules({ expiry: E }, ENV)
  test('allows subscribe() to the Subscription contract on the chain before expiry', () => {
    expect(evaluate(rules, ok)).toEqual({ allowed: true, rule: RULE_SUBSCRIBE, reason: `allowed by rule "${RULE_SUBSCRIBE}"` })
  })
  test('denies once the clock reaches the expiry', () => {
    expect(evaluate(rules, { ...ok, now: E })).toMatchObject({ allowed: false, rule: RULE_EXPIRY })
    expect(evaluate(rules, { ...ok, now: E + 1n })).toMatchObject({ allowed: false, rule: RULE_EXPIRY })
  })
  test('denies a wrong target (the fund token instead of Subscription)', () => {
    expect(evaluate(rules, { ...ok, to: FUND_TOKEN })).toMatchObject({ allowed: false, rule: 'default' })
  })
  test('denies a wrong chain, a wrong function and an undecodable calldata', () => {
    expect(evaluate(rules, { ...ok, chainId: 1 })).toMatchObject({ allowed: false, rule: 'default' })
    expect(evaluate(rules, { ...ok, functionName: 'transfer' })).toMatchObject({ allowed: false, rule: 'default' })
    expect(evaluate(rules, { ...ok, functionName: undefined })).toMatchObject({ allowed: false, rule: 'default' })
  })
  test('denies every other method (no rule resolves)', () => {
    expect(evaluate(rules, { ...ok, method: 'personal_sign' })).toMatchObject({ allowed: false, rule: 'default' })
  })
  test('denies everything after Revoked, DENY before ALLOW', () => {
    expect(evaluate(applyRevoked(rules), ok)).toMatchObject({ allowed: false, rule: RULE_REVOKED })
  })
  test('the address comparison is case-insensitive', () => {
    expect(evaluate(rules, { ...ok, to: SUBSCRIPTION.toLowerCase() as `0x${string}` }).allowed).toBe(true)
  })
})

describe('describeRules', () => {
  test('three plain-words lines after Revoked', () => {
    const lines = describeRules(applyRevoked(buildRules({ expiry: E }, ENV)))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain("Deny every request once the clock passes the decision's expiry")
    expect(lines[0]).toContain('2027-01-15 08:00 UTC')
    expect(lines[1]).toBe(`Allow eth_sendTransaction only to the Subscription contract ${SUBSCRIPTION} on chain 11155111, only when the calldata is subscribe().`)
    expect(lines[2]).toBe('Deny every request: the issuer revoked the decision.')
  })
})
