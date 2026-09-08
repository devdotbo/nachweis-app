/**
 * In-memory stand-in for the AttestationRegistry, FundToken and Subscription
 * contracts. Same semantics as the Solidity, fake delays, no network.
 */
import { useSyncExternalStore } from 'react'
import { type Address, type Hex, bytesToHex } from 'viem'
import { REQUIRED_BITS } from '../config'
import { EMPTY_DECISION, isEligibleLocally, type Decision, type RegistryEvent, type RegistryStatus } from './types'

export const MOCK_INVESTOR: Address = '0x1111111111111111111111111111111111111111'
export const MOCK_OPERATOR: Address = '0x2222222222222222222222222222222222222222'
const TX_DELAY_MS = 1500

interface State {
  decisions: Record<string, Decision>
  /** Issuer approval per subject:policy, the second condition next to the decision. */
  approvals: Record<string, boolean>
  events: RegistryEvent[]
  balances: Record<string, bigint>
  block: bigint
}

let state: State = { decisions: {}, approvals: {}, events: [], balances: {}, block: 9_000_000n }
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  for (const l of listeners) l()
}

function key(subject: Address, policyId: Hex) {
  return `${subject.toLowerCase()}:${policyId}`
}

function fakeHash(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

async function delay() {
  await new Promise((r) => setTimeout(r, TX_DELAY_MS))
}

export function useMockState(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function mockDecisionOf(s: State, subject: Address, policyId: Hex): Decision {
  return s.decisions[key(subject, policyId)] ?? EMPTY_DECISION
}

export function mockIsEligible(s: State, subject: Address, policyId: Hex, requiredBits: bigint): boolean {
  return isEligibleLocally(mockDecisionOf(s, subject, policyId), Boolean(s.approvals[key(subject, policyId)]), requiredBits)
}

export function mockStatusOf(s: State, subject: Address, policyId: Hex): RegistryStatus {
  const d = mockDecisionOf(s, subject, policyId)
  return { hasDecision: d.expiry !== 0n, approved: Boolean(s.approvals[key(subject, policyId)]), revoked: d.revoked, expiry: d.expiry }
}

/** Current mock state outside React (the mock bridge reads it). */
export function mockStatusNow(subject: Address, policyId: Hex): RegistryStatus {
  return mockStatusOf(state, subject, policyId)
}

/** attestByOperator: stores the decision and approves in one step (the operator signed it). */
export async function mockAttest(subject: Address, decision: Decision, operator: Address): Promise<Hex> {
  return store(subject, decision, operator, true)
}

/** attestWithProof: evidence only, approval stays as it was (false for a fresh subject). Cannot reopen a revoked record. */
export async function mockAttestWithProof(subject: Address, decision: Decision, submitter: Address): Promise<Hex> {
  const existing = state.decisions[key(subject, decision.policyId)]
  if (existing?.revoked) throw new Error(`DecisionRevoked(${subject}, ${decision.policyId})`)
  return store(subject, decision, submitter, false)
}

async function store(subject: Address, decision: Decision, actor: Address, approve: boolean): Promise<Hex> {
  await delay()
  const hash = fakeHash()
  const block = state.block + 1n
  const k = key(subject, decision.policyId)
  set({
    ...state,
    block,
    decisions: { ...state.decisions, [k]: { ...decision, revoked: false } },
    approvals: approve ? { ...state.approvals, [k]: true } : state.approvals,
    events: [
      ...(approve ? [{ kind: 'Approved', subject, policyId: decision.policyId, actor, txHash: hash, blockNumber: block } as RegistryEvent] : []),
      { kind: 'Attested', subject, policyId: decision.policyId, bits: decision.bits, tier: decision.tier, expiry: decision.expiry, statusRef: decision.statusRef, actor, txHash: hash, blockNumber: block },
      ...state.events,
    ],
  })
  return hash
}

/** approve: requires a decision, sets approved and clears revoked (issuer authority reopens a revoked record). */
export async function mockApprove(subject: Address, policyId: Hex, operator: Address): Promise<Hex> {
  await delay()
  const existing = state.decisions[key(subject, policyId)]
  if (!existing) throw new Error(`NoDecision(${subject}, ${policyId})`)
  const hash = fakeHash()
  const block = state.block + 1n
  set({
    ...state,
    block,
    decisions: { ...state.decisions, [key(subject, policyId)]: { ...existing, revoked: false } },
    approvals: { ...state.approvals, [key(subject, policyId)]: true },
    events: [{ kind: 'Approved', subject, policyId, actor: operator, txHash: hash, blockNumber: block }, ...state.events],
  })
  return hash
}

export async function mockRevoke(subject: Address, policyId: Hex, operator: Address): Promise<Hex> {
  await delay()
  const existing = state.decisions[key(subject, policyId)]
  if (!existing) throw new Error(`NoDecision(${subject}, ${policyId})`)
  const hash = fakeHash()
  const block = state.block + 1n
  set({
    ...state,
    block,
    decisions: { ...state.decisions, [key(subject, policyId)]: { ...existing, revoked: true } },
    approvals: { ...state.approvals, [key(subject, policyId)]: false },
    events: [{ kind: 'Revoked', subject, policyId, actor: operator, txHash: hash, blockNumber: block }, ...state.events],
  })
  return hash
}

export async function mockSubscribe(subscriber: Address, policyId: Hex): Promise<Hex> {
  await delay()
  if (!mockIsEligible(state, subscriber, policyId, REQUIRED_BITS)) throw new Error('Subscription: NotEligible()')
  const amount = 100n * 10n ** 18n
  set({ ...state, block: state.block + 1n, balances: { ...state.balances, [subscriber.toLowerCase()]: (state.balances[subscriber.toLowerCase()] ?? 0n) + amount } })
  return fakeHash()
}
