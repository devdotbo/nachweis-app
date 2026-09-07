/**
 * Chain access for both roles. One hook set, two implementations chosen at build
 * time: wagmi against Sepolia, or the in-memory mock (VITE_MOCK=1).
 */
import { useCallback, useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'
import { usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { MOCK, POLICY_ID, REGISTRY, REQUIRED_BITS, SUBSCRIPTION } from '../config'
import { registryAbi, subscriptionAbi } from './contracts'
import { mockAttest, mockDecisionOf, mockIsEligible, mockRevoke, mockSubscribe, useMockState } from './mockChain'
import { EMPTY_DECISION, type Decision, type RegistryEvent, type TxState } from './types'

export interface DecisionRead {
  decision: Decision
  loading: boolean
  refetch: () => void
}

export interface RegistryTx {
  tx: TxState
  reset: () => void
  attest: (subject: Address, decision: Decision) => Promise<void>
  revoke: (subject: Address, policyId: Hex) => Promise<void>
  subscribe: () => Promise<void>
}

const EVENT_LOOKBACK_BLOCKS = 50_000n
const POLL_MS = 8000

// ---------------------------------------------------------------------------
// mock
// ---------------------------------------------------------------------------

function useDecisionMock(subject?: Address): DecisionRead {
  const s = useMockState()
  return { decision: subject ? mockDecisionOf(s, subject, POLICY_ID) : EMPTY_DECISION, loading: false, refetch: () => {} }
}

function useEligibleMock(subject?: Address): boolean | undefined {
  const s = useMockState()
  return subject ? mockIsEligible(s, subject, POLICY_ID, REQUIRED_BITS) : undefined
}

function useRegistryEventsMock(): { events: RegistryEvent[]; loading: boolean } {
  return { events: useMockState().events, loading: false }
}

function useTxState(): [TxState, (t: TxState) => void, <T>(label: string, fn: () => Promise<Hex>) => Promise<T | void>] {
  const [tx, setTx] = useState<TxState>({ status: 'idle' })
  const run = useCallback(async (label: string, fn: () => Promise<Hex>) => {
    setTx({ status: 'pending', label })
    try {
      const hash = await fn()
      setTx({ status: 'done', hash })
    } catch (e) {
      setTx({ status: 'error', message: shortError(e) })
      throw e
    }
  }, [])
  return [tx, setTx, run]
}

function useRegistryTxMock(operator?: Address): RegistryTx {
  const [tx, setTx, run] = useTxState()
  const who = operator ?? '0x0000000000000000000000000000000000000000'
  return {
    tx,
    reset: () => setTx({ status: 'idle' }),
    attest: (subject, decision) => run('attestByOperator', () => mockAttest(subject, decision, who)),
    revoke: (subject, policyId) => run('revoke', () => mockRevoke(subject, policyId, who)),
    subscribe: () => run('subscribe', () => mockSubscribe(who, POLICY_ID)),
  }
}

// ---------------------------------------------------------------------------
// Sepolia via wagmi
// ---------------------------------------------------------------------------

function useDecisionChain(subject?: Address): DecisionRead {
  const q = useReadContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: 'decisionOf',
    args: subject ? [subject, POLICY_ID] : undefined,
    query: { enabled: Boolean(subject), refetchInterval: POLL_MS },
  })
  const raw = q.data as Partial<Decision> | undefined
  const decision: Decision = raw ? { ...EMPTY_DECISION, ...raw, tier: Number(raw.tier ?? 0) } : EMPTY_DECISION
  return { decision, loading: q.isLoading, refetch: () => void q.refetch() }
}

function useEligibleChain(subject?: Address): boolean | undefined {
  const q = useReadContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: 'isEligible',
    args: subject ? [subject, POLICY_ID, REQUIRED_BITS] : undefined,
    query: { enabled: Boolean(subject), refetchInterval: POLL_MS },
  })
  return q.data as boolean | undefined
}

function useRegistryEventsChain(): { events: RegistryEvent[]; loading: boolean } {
  const client = usePublicClient()
  const [events, setEvents] = useState<RegistryEvent[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!client) return
    let alive = true
    const load = async () => {
      try {
        const latest = await client.getBlockNumber()
        const fromBlock = latest > EVENT_LOOKBACK_BLOCKS ? latest - EVENT_LOOKBACK_BLOCKS : 0n
        const [attested, revoked] = await Promise.all([
          client.getContractEvents({ address: REGISTRY, abi: registryAbi, eventName: 'Attested', fromBlock, toBlock: latest }),
          client.getContractEvents({ address: REGISTRY, abi: registryAbi, eventName: 'Revoked', fromBlock, toBlock: latest }),
        ])
        const out: RegistryEvent[] = []
        for (const l of attested) {
          const a = l.args as Record<string, unknown>
          out.push({ kind: 'Attested', subject: a.subject as Address, policyId: a.policyId as Hex, bits: a.bits as bigint, tier: Number(a.tier), expiry: a.expiry as bigint, statusRef: a.statusRef as Hex, actor: a.attester as Address, txHash: l.transactionHash, blockNumber: l.blockNumber })
        }
        for (const l of revoked) {
          const a = l.args as Record<string, unknown>
          out.push({ kind: 'Revoked', subject: a.subject as Address, policyId: a.policyId as Hex, actor: a.operator as Address, txHash: l.transactionHash, blockNumber: l.blockNumber })
        }
        out.sort((x, y) => (y.blockNumber > x.blockNumber ? 1 : y.blockNumber < x.blockNumber ? -1 : 0))
        if (alive) setEvents(out)
      } catch (e) {
        console.warn('event log fetch failed', e)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const t = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [client])
  return { events, loading }
}

function useRegistryTxChain(): RegistryTx {
  const [tx, setTx, run] = useTxState()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const send = useCallback(
    async (address: Address, abi: typeof registryAbi, functionName: string, args: unknown[]) => {
      const hash = await writeContractAsync({ address, abi, functionName, args })
      if (client) await client.waitForTransactionReceipt({ hash })
      return hash
    },
    [writeContractAsync, client],
  )
  return {
    tx,
    reset: () => setTx({ status: 'idle' }),
    attest: (subject, decision) => run('attestByOperator', () => send(REGISTRY, registryAbi, 'attestByOperator', [subject, decision])),
    revoke: (subject, policyId) => run('revoke', () => send(REGISTRY, registryAbi, 'revoke', [subject, policyId])),
    subscribe: () => run('subscribe', () => send(SUBSCRIPTION, subscriptionAbi, 'subscribe', [])),
  }
}

// ---------------------------------------------------------------------------

function shortError(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { shortMessage?: string; message?: string }
    return anyE.shortMessage ?? anyE.message ?? String(e)
  }
  return String(e)
}

export const useDecision: (subject?: Address) => DecisionRead = MOCK ? useDecisionMock : useDecisionChain
export const useEligible: (subject?: Address) => boolean | undefined = MOCK ? useEligibleMock : useEligibleChain
export const useRegistryEvents: () => { events: RegistryEvent[]; loading: boolean } = MOCK ? useRegistryEventsMock : useRegistryEventsChain
export const useRegistryTx: (actor?: Address) => RegistryTx = MOCK ? useRegistryTxMock : () => useRegistryTxChain()
