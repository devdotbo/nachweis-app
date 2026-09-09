import { describe, expect, test } from 'bun:test'
import { RunError, RunStore } from '../src/runs'

const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

describe('four-eyes on runs', () => {
  test('officer A proposes, officer A cannot approve, officer B approves and the run is ready', () => {
    const s = new RunStore()
    const run = s.propose('A', [
      { address: ALICE, amount: '100000000', label: 'alice' },
      { address: BOB, amount: '50000000' },
    ])
    expect(run.state).toBe('proposed')
    expect(run.approvals).toEqual(['A'])
    expect(run.total).toBe('150000000')
    expect(run.ref).toMatch(/^0x[0-9a-f]{64}$/)
    expect(() => s.approve('A', run.id)).toThrow(RunError)
    try {
      s.approve('A', run.id)
    } catch (e) {
      expect((e as RunError).status).toBe(403)
    }
    const { run: r2, ready } = s.approve('B', run.id)
    expect(ready).toBe(true)
    expect(r2.approvals).toEqual(['A', 'B'])
  })

  test('officer B may propose and officer A completes', () => {
    const s = new RunStore()
    const run = s.propose('B', [{ address: ALICE, amount: '1' }])
    expect(s.approve('A', run.id).ready).toBe(true)
  })

  test('a run that is no longer proposed cannot be approved again', () => {
    const s = new RunStore()
    const run = s.propose('A', [{ address: ALICE, amount: '1' }])
    s.approve('B', run.id)
    s.update(run.id, { state: 'executed' })
    expect(() => s.approve('B', run.id)).toThrow(/executed/)
  })

  test('input checks: empty run, bad address, zero amount, duplicate recipient', () => {
    const s = new RunStore()
    expect(() => s.propose('A', [])).toThrow(/at least one/)
    expect(() => s.propose('A', [{ address: '0x12', amount: '1' }])).toThrow(/not an address/)
    expect(() => s.propose('A', [{ address: ALICE, amount: '0' }])).toThrow(/positive integer/)
    expect(() => s.propose('A', [{ address: ALICE, amount: '1.5' }])).toThrow(/positive integer/)
    expect(() => s.propose('A', [{ address: ALICE, amount: '1' }, { address: ALICE.toLowerCase(), amount: '1' }])).toThrow(/twice/)
  })

  test('unknown run', () => {
    const s = new RunStore()
    expect(() => s.approve('B', 'nope')).toThrow(/no run/)
  })

  test('list is newest first', async () => {
    const s = new RunStore()
    const a = s.propose('A', [{ address: ALICE, amount: '1' }])
    await new Promise((r) => setTimeout(r, 2))
    const b = s.propose('A', [{ address: BOB, amount: '1' }])
    expect(s.list().map((r) => r.id)).toEqual([b.id, a.id])
  })
})
