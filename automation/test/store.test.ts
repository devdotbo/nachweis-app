import { describe, expect, test } from 'bun:test'
import { Store } from '../src/store'

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const

describe('Store.addRun (plan run history)', () => {
  test('numbers runs per investor from 1 and keeps them in order', () => {
    const s = new Store()
    s.addRun({ address: A, outcome: 'ok', hash: '0x01', detail: 'run one' })
    s.addRun({ address: B, outcome: 'no-delegated-wallet', detail: 'no key' })
    s.addRun({ address: A.toLowerCase() as typeof A, outcome: 'denied-policy', detail: 'revoked' })
    expect(s.runs.map((r) => [r.address.toLowerCase(), r.n, r.outcome])).toEqual([
      [A.toLowerCase(), 1, 'ok'],
      [B.toLowerCase(), 1, 'no-delegated-wallet'],
      [A.toLowerCase(), 2, 'denied-policy'],
    ])
    expect(s.runsFor(A).map((r) => r.n)).toEqual([1, 2])
    expect(s.runsFor(B)).toHaveLength(1)
    expect(s.runsFor(A)[0]!.hash).toBe('0x01')
    expect(s.runsFor(A)[0]!.at).toBeGreaterThan(0)
  })
  test('the log is untouched by runs', () => {
    const s = new Store()
    s.addRun({ address: A, outcome: 'ok', detail: 'x' })
    expect(s.log).toHaveLength(0)
  })
})

describe('loadConfig PLAN_INTERVAL_SECS', () => {
  test('unset means no schedule; a positive integer sets it; junk is ignored', async () => {
    const { loadConfig } = await import('../src/config')
    const base = { REGISTRY: A, SUBSCRIPTION: B }
    expect(loadConfig({ ...base }).planIntervalSecs).toBeUndefined()
    expect(loadConfig({ ...base, PLAN_INTERVAL_SECS: '60' }).planIntervalSecs).toBe(60)
    expect(loadConfig({ ...base, PLAN_INTERVAL_SECS: '0' }).planIntervalSecs).toBeUndefined()
    expect(loadConfig({ ...base, PLAN_INTERVAL_SECS: 'soon' }).planIntervalSecs).toBeUndefined()
  })
})
