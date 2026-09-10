import { describe, expect, test } from 'bun:test'
import type { Address, Hex, PublicClient } from 'viem'
import { loadConfig } from '../src/config'
import type { PolicyBackend } from '../src/policies'
import { hasDenyAll, type PolicyRule } from '../src/policy'
import { Store, type InvestorPolicy } from '../src/store'
import { Watcher } from '../src/watch'

const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const
const SUBSCRIPTION = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as const
const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const
const E = 1_800_000_000n

interface FakeLog {
  eventName: 'Approved' | 'Revoked'
  args: { subject: Address }
  blockNumber: bigint
  logIndex: number
  transactionHash: Hex
}

/** A PublicClient stand-in: a block height, a fixed decision per subject and a list of registry logs. */
function fakeClient(state: { latest: bigint; logs: FakeLog[] }): PublicClient {
  const client = {
    async getBlockNumber() {
      return state.latest
    },
    async getContractEvents({ eventName, fromBlock, toBlock }: { eventName: 'Approved' | 'Revoked'; fromBlock: bigint; toBlock: bigint }) {
      return state.logs.filter((l) => l.eventName === eventName && l.blockNumber >= fromBlock && l.blockNumber <= toBlock)
    },
    async readContract({ functionName }: { functionName: string }) {
      if (functionName !== 'decisionOf') throw new Error(`unexpected read ${functionName}`)
      return { policyId: '0x00', bits: 3n, tier: 1, expiry: E, statusRef: '0x00', revoked: false }
    },
  }
  return client as unknown as PublicClient
}

/** Local-style backend whose addRule throws while `failing` is set; counts every call. */
class FlakyBackend implements PolicyBackend {
  failing = false
  calls = { create: 0, addRule: 0, updateRule: 0, deleteRule: 0 }
  private seq = 0
  async create(_address: Address, rules: PolicyRule[]) {
    this.calls.create += 1
    const policyId = `fake-${++this.seq}`
    const ruleIds: Record<string, string> = {}
    rules.forEach((r, i) => (ruleIds[r.name] = `${policyId}-rule-${i + 1}`))
    return { policyId, ruleIds }
  }
  async addRule(p: InvestorPolicy) {
    this.calls.addRule += 1
    if (this.failing) throw new Error('503: privy unavailable')
    return `${p.policyId}-rule-${Object.keys(p.ruleIds).length + 1}`
  }
  async updateRule() {
    this.calls.updateRule += 1
  }
  async deleteRule() {
    this.calls.deleteRule += 1
  }
}

function log(eventName: FakeLog['eventName'], subject: Address, block: number, logIndex: number): FakeLog {
  return { eventName, args: { subject }, blockNumber: BigInt(block), logIndex, transactionHash: `0x${block.toString(16).padStart(2, '0')}${logIndex.toString(16).padStart(62, '0')}` as Hex }
}

async function started(state: { latest: bigint; logs: FakeLog[] }, backend: PolicyBackend) {
  const cfg = loadConfig({ REGISTRY, SUBSCRIPTION, START_BLOCK: '0', POLL_MS: '60000' })
  const store = new Store()
  const w = new Watcher(cfg, fakeClient(state), store, backend)
  await w.start()
  w.stop()
  return { w, store }
}

describe('Watcher retries a failed policy update', () => {
  test('a failed Revoked stops the poll, sets the cursor to its block and is retried on the next poll', async () => {
    const backend = new FlakyBackend()
    const state = { latest: 10n, logs: [log('Approved', ALICE, 5, 0), log('Revoked', ALICE, 7, 0), log('Approved', BOB, 8, 0)] }
    backend.failing = true
    const { w, store } = await started(state, backend)

    // Alice's policy exists, but the deny-all could not be added: nothing after block 7 was touched.
    expect(store.get(ALICE)).toBeDefined()
    expect(hasDenyAll(store.get(ALICE)!.rules)).toBe(false)
    expect(store.get(BOB)).toBeUndefined()
    expect(backend.calls.addRule).toBe(1)
    expect(w.lastBlock).toBe(6n)
    const lines = store.log.map((l) => l.line)
    expect(lines.some((l) => l.startsWith(`WATCH ERROR Revoked ${ALICE} block 7:`) && l.includes('503: privy unavailable'))).toBe(true)
    expect(lines).toContain(`WATCH RETRY Revoked ${ALICE} block 7: policy update failed, next poll retries from block 7`)

    // Backend recovers: the next poll picks the Revoked up again, then Bob's Approved.
    backend.failing = false
    await w.poll()
    expect(hasDenyAll(store.get(ALICE)!.rules)).toBe(true)
    expect(store.get(BOB)).toBeDefined()
    expect(backend.calls.addRule).toBe(2)
    expect(backend.calls.create).toBe(2)
    expect(w.lastBlock).toBe(10n)
    expect(store.log.map((l) => l.line).filter((l) => l.startsWith('POLICY DENY-ALL ADDED'))).toHaveLength(1)

    // Nothing is replayed once the cursor moved on.
    await w.poll()
    expect(backend.calls.addRule).toBe(2)
    expect(backend.calls.create).toBe(2)
  })

  test('a retry replays the failed block from its first event without touching the backend twice', async () => {
    const backend = new FlakyBackend()
    // Approved and Revoked for Alice in the same block: the retry sees the Approved again.
    const state = { latest: 5n, logs: [log('Approved', ALICE, 5, 0), log('Revoked', ALICE, 5, 1)] }
    backend.failing = true
    const { w, store } = await started(state, backend)
    expect(backend.calls.create).toBe(1)
    expect(hasDenyAll(store.get(ALICE)!.rules)).toBe(false)
    expect(w.lastBlock).toBe(4n)

    backend.failing = false
    await w.poll()
    expect(hasDenyAll(store.get(ALICE)!.rules)).toBe(true)
    expect(backend.calls.create).toBe(1)
    expect(backend.calls.updateRule).toBe(0)
    expect(backend.calls.deleteRule).toBe(0)
    expect(backend.calls.addRule).toBe(2)
    expect(w.lastBlock).toBe(5n)
  })

  test('while the backend keeps failing the cursor stays on the failed block', async () => {
    const backend = new FlakyBackend()
    const state = { latest: 3n, logs: [log('Approved', ALICE, 1, 0), log('Revoked', ALICE, 2, 0)] }
    backend.failing = true
    const { w, store } = await started(state, backend)
    state.latest = 9n
    await w.poll()
    await w.poll()
    expect(backend.calls.addRule).toBe(3)
    expect(w.lastBlock).toBe(1n)
    expect(store.log.filter((l) => l.line.startsWith('WATCH RETRY')).length).toBe(3)
  })
})
