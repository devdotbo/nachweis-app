import { beforeEach, describe, expect, test } from 'bun:test'
import type { Address, Hex } from 'viem'
import type { AttestedLog, ChainReader, Receipt, Status } from '../src/chain'
import { loadConfig } from '../src/config'
import { Desk } from '../src/desk'
import { Refused, Reverted, type Operator, type Tx } from '../src/operator'
import type { Role } from '../src/types'

const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const ALICE: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const BOB: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const HASH: Hex = `0x${'ab'.repeat(32)}`
const cfg = loadConfig({ BACKOFFICE_MODE: 'local', REGISTRY, START_BLOCK: '0' })

class FakeOperator implements Operator {
  mode = 'local' as const
  address: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
  calls: { tx: Tx; signers: Role[] }[] = []
  refuse?: Refused
  fail?: Error
  async send(tx: Tx, signers: Role[]): Promise<Hex> {
    this.calls.push({ tx, signers })
    if (this.refuse) throw this.refuse
    if (this.fail) throw this.fail
    return HASH
  }
}

class FakeChain implements ChainReader {
  latest = 10n
  status = new Map<string, Status>()
  logs: AttestedLog[] = []
  receipt: Receipt = { status: 'success', gasUsed: 21000n }
  async latestBlock() {
    return this.latest
  }
  async statusOf(subject: Address) {
    return this.status.get(subject.toLowerCase()) ?? { hasDecision: false, isApproved: false, isRevoked: false, expiry: 0 }
  }
  async fetchAttested() {
    const l = this.logs
    this.logs = []
    return l
  }
  async waitReceipt() {
    return this.receipt
  }
}

const attested = (subject: Address): AttestedLog => ({
  subject,
  policyId: cfg.policyId,
  evidence: { bits: '1', tier: 1, expiry: 2000000000, statusRef: `0x${'00'.repeat(32)}`, attester: BOB, txHash: HASH, blockNumber: 5 },
})

let op: FakeOperator
let chain: FakeChain
let desk: Desk
beforeEach(() => {
  op = new FakeOperator()
  chain = new FakeChain()
  desk = new Desk(cfg, op, chain)
})

describe('propose and confirm', () => {
  test('propose dedupes one open proposal per subject and kind', () => {
    const a = desk.propose('approve', ALICE, 'manual')
    const b = desk.propose('approve', ALICE, 'manual')
    desk.propose('revoke', ALICE, 'manual')
    expect(a.id).toBe(b.id)
    expect(desk.list()).toHaveLength(2)
    expect(desk.list()[0]!.kind).toBe('revoke')
  })

  test('one role keeps the proposal proposed and sends nothing', async () => {
    const p = desk.propose('approve', ALICE, 'manual')
    const after = await desk.confirm(p.id, 'compliance')
    expect(after.status).toBe('proposed')
    expect(Object.keys(after.confirmations)).toEqual(['compliance'])
    expect(op.calls).toHaveLength(0)
  })

  test('the second role sends with both roles and confirms with the receipt', async () => {
    const p = desk.propose('approve', ALICE, 'manual')
    await desk.confirm(p.id, 'operations')
    const after = await desk.confirm(p.id, 'compliance')
    expect(after.status).toBe('confirmed')
    expect(after.txHash).toBe(HASH)
    expect(after.gasUsed).toBe('21000')
    expect(op.calls).toHaveLength(1)
    expect(op.calls[0]!.signers.sort()).toEqual(['compliance', 'operations'])
    expect(op.calls[0]!.tx.to).toBe(REGISTRY)
    expect(op.calls[0]!.tx.data.startsWith('0x')).toBe(true)
  })

  test('a Refused error yields status refused with the message', async () => {
    op.refuse = new Refused('simulated-quorum', 'simulated key quorum (local): 1 of 2 signatures')
    const p = desk.propose('revoke', ALICE, 'manual')
    await desk.confirm(p.id, 'compliance')
    const after = await desk.confirm(p.id, 'operations')
    expect(after.status).toBe('refused')
    expect(after.error).toBe('simulated key quorum (local): 1 of 2 signatures')
  })

  test('a reverted receipt yields status reverted', async () => {
    chain.receipt = { status: 'reverted', gasUsed: 30000n }
    const p = desk.propose('approve', ALICE, 'manual')
    await desk.confirm(p.id, 'compliance')
    const after = await desk.confirm(p.id, 'operations')
    expect(after.status).toBe('reverted')
    expect(after.txHash).toBe(HASH)
    expect(after.error).toContain('reverted')
  })

  test('a non-refusal error returns the proposal to the queue', async () => {
    op.fail = new Error('rpc down')
    const p = desk.propose('approve', ALICE, 'manual')
    await desk.confirm(p.id, 'compliance')
    const after = await desk.confirm(p.id, 'operations')
    expect(after.status).toBe('proposed')
    expect(after.error).toBe('rpc down')
    expect(after.confirmations).toEqual({})
  })

  test('confirm rejects unknown ids and roles', async () => {
    await expect(desk.confirm('nope', 'compliance')).rejects.toThrow('unknown proposal')
    const p = desk.propose('approve', ALICE, 'manual')
    await expect(desk.confirm(p.id, 'auditor' as Role)).rejects.toThrow('unknown role')
  })
})

describe('watcher', () => {
  test('tick proposes exactly one approve for an Attested log with evidence', async () => {
    chain.status.set(ALICE.toLowerCase(), { hasDecision: true, isApproved: false, isRevoked: false, expiry: 2000000000 })
    chain.logs = [attested(ALICE), attested(ALICE)]
    const created = await desk.tick()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ kind: 'approve', subject: ALICE, source: 'attested-event' })
    expect(created[0]!.evidence?.attester).toBe(BOB)
    expect(await desk.tick()).toHaveLength(0)
    expect(desk.deskInfo().watcher.lastBlock).toBe(10)
  })

  test('tick proposes nothing for an already approved subject', async () => {
    chain.status.set(BOB.toLowerCase(), { hasDecision: true, isApproved: true, isRevoked: false, expiry: 2000000000 })
    chain.logs = [attested(BOB)]
    expect(await desk.tick()).toHaveLength(0)
    expect(desk.list()).toHaveLength(0)
  })
})

describe('probe', () => {
  test('reports refused with the operator verdict', async () => {
    op.refuse = new Refused('simulated-policy', 'simulated policy (local): no rule allows eth_sendTransaction to 0xdead (function none)')
    const r = await desk.probe('transfer')
    expect(r).toMatchObject({ kind: 'transfer', refused: true, by: 'simulated-policy' })
    expect(op.calls[0]!.tx.value).toBe(1n)
    expect(op.calls[0]!.signers).toHaveLength(2)
  })

  test('single-signature sends with the compliance key only', async () => {
    op.refuse = new Refused('simulated-quorum', '1 of 2')
    const r = await desk.probe('single-signature')
    expect(r.by).toBe('simulated-quorum')
    expect(op.calls[0]!.signers).toEqual(['compliance'])
  })

  test('returns refused:false and not-refused when the operator does not refuse', async () => {
    const r = await desk.probe('attestByOperator')
    expect(r.refused).toBe(false)
    expect(r.by).toBe('not-refused')
    expect(r.txHash).toBe(HASH)
  })
})

describe('deskInfo', () => {
  test('local mode describes the simulated custody, quorum and policy', () => {
    const info = desk.deskInfo()
    expect(info.mode).toBe('local')
    expect(info.operator.custody).toContain('local mode')
    expect(info.quorum).toMatchObject({ threshold: 2, enforcedBy: 'simulated' })
    expect(info.policy.enforcedBy).toBe('simulated')
    expect(info.policy.rules).toHaveLength(2)
    expect(Array.isArray(info.policy.json)).toBe(true)
  })
})

test('a revert before broadcast (NoDecision) ends the proposal as reverted, keeping the confirmations', async () => {
  const o = new FakeOperator()
  const d = new Desk(cfg, o, new FakeChain())
  o.fail = new Reverted('reverted before broadcast: NoDecision(0x0000000000000000000000000000000000000002, 0x01)')
  const p = d.propose('approve', '0x0000000000000000000000000000000000000002', 'manual')
  await d.confirm(p.id, 'compliance')
  const r = await d.confirm(p.id, 'operations')
  expect(r.status).toBe('reverted')
  expect(r.error).toContain('NoDecision')
  expect(Object.keys(r.confirmations).length).toBe(2)
})
