/** Client for the issuer's automation (automation/, docs/privy-standing-order.md). Every call is a plain fetch against VITE_AUTOMATION_URL. */
import { useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'
import { AUTOMATION_URL } from '../config'

export interface PolicyRuleView {
  name: string
  method: string
  action: 'ALLOW' | 'DENY'
  conditions: unknown[]
}

export interface PolicyView {
  address: Address
  policyId: string
  signerId: string
  rules: PolicyRuleView[]
  /** The rules in plain words, one line per rule. */
  plain: string[]
  expiry?: string
  denyAll: boolean
  /** The automation's view: the signer is on this wallet. */
  delegated: boolean
}

export interface TickResultView {
  address: Address
  outcome: 'ok' | 'denied-policy' | 'denied-chain' | 'no-delegated-wallet' | 'no-policy' | 'error'
  hash?: Hex
  detail: string
  chain?: { allows: boolean; eligible: boolean; reason?: string }
}

export interface LogEntryView {
  at: number
  kind: 'policy' | 'tick' | 'watch' | 'error'
  line: string
  address?: Address
  hash?: Hex
}

export interface StatusView {
  mode: 'privy' | 'local'
  simulated: boolean
  caption: string
  signerId: string
  chainId: number
  registry: Address
  subscription: Address
  policyId: Hex
  pollMs: number
  lastBlock?: string
  investors: PolicyView[]
  log: LogEntryView[]
}

async function getJson<T>(path: string): Promise<T | undefined> {
  if (!AUTOMATION_URL) return undefined
  const r = await fetch(`${AUTOMATION_URL}${path}`)
  if (r.status === 404) return undefined
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return (await r.json()) as T
}

export const automation = {
  status: () => getJson<StatusView>('/status'),
  /** `fresh` skips the automation's short cache of the wallet lookup (right after Allow or Remove signer). */
  policy: (address: Address, fresh = false) => getJson<PolicyView>(`/policy/${address}${fresh ? '?fresh=1' : ''}`),
  tick: async (opts: { address?: Address; target?: 'subscription' | 'fundToken' } = {}): Promise<TickResultView[]> => {
    if (!AUTOMATION_URL) throw new Error('VITE_AUTOMATION_URL is not set')
    const r = await fetch(`${AUTOMATION_URL}/tick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts) })
    const body = (await r.json()) as { results?: TickResultView[]; error?: string }
    if (!r.ok || !body.results) throw new Error(body.error ?? `POST /tick: ${r.status}`)
    return body.results
  },
}

/** Polls one endpoint; keeps the last value on a failed fetch and reports the error. */
export function useAutomationPoll<T>(load: () => Promise<T | undefined>, deps: unknown[], intervalMs = 5000): { data?: T; error?: string; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!AUTOMATION_URL) return
    let alive = true
    const run = async () => {
      try {
        const v = await load()
        if (!alive) return
        setData(v)
        setError(undefined)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    const t = setInterval(run, intervalMs)
    return () => {
      alive = false
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, intervalMs])
  return { data, error, loading, refresh: () => setTick((n) => n + 1) }
}
