/**
 * Reads and writes of the savings-plan board. Reads: wagmi against the chain the app is configured for.
 * Investor writes: the connected wallet (dev signer, injected, or the embedded wallet by Privy).
 * Operator beats: the dev operator key when the build carries one (local testing only); otherwise
 * the issuer console (/issuer) is where revoke and approve happen and the board only reads.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { createWalletClient, http, parseAbi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { DECISION_TTL_SECONDS, DEV_OPERATOR_KEY, FUND_TOKEN, POLICY_ID, REGISTRY, REQUIRED_BITS, TIER_A } from '../../config'
import { chain, rpcUrl } from '../../lib/chainConfig'
import { fundTokenAbi, registryAbi, subscriptionAbi } from '../../lib/contracts'
import { addReceipt } from '../../lib/receipts'
import { CHECKER, FUND_TOKEN_B, SUBSCRIPTION_B } from './config'

const POLL_MS = 4000
const ZERO32: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000'

export const checkerAbi = parseAbi(['function checkAllowlist(address account, address tokenAddress) view returns (bytes2)'])

function read<T>(args: Parameters<typeof useReadContract>[0], enabled: boolean): T | undefined {
  const q = useReadContract({ ...args, query: { enabled, refetchInterval: POLL_MS } } as Parameters<typeof useReadContract>[0])
  return q.data as T | undefined
}

/** isEligible(subject) under the app's policy: the read every door makes. */
export function useEligibleOf(subject?: Address): boolean | undefined {
  return read<boolean>({ address: REGISTRY, abi: registryAbi, functionName: 'isEligible', args: subject ? [subject, POLICY_ID, REQUIRED_BITS] : undefined }, Boolean(subject))
}

export function useBalanceOf(token: Address | undefined, holder?: Address): bigint | undefined {
  return read<bigint>({ address: token, abi: fundTokenAbi, functionName: 'balanceOf', args: holder ? [holder] : undefined }, Boolean(token && holder))
}

/** FundToken B's own registry and policy id, read from the contract: the same registry, the same decision. */
export function useTokenBGate(): { registry?: Address; policyId?: Hex; symbol?: string } {
  const registry = read<Address>({ address: FUND_TOKEN_B, abi: fundTokenAbi, functionName: 'registry' }, Boolean(FUND_TOKEN_B))
  const policyId = read<Hex>({ address: FUND_TOKEN_B, abi: fundTokenAbi, functionName: 'policyId' }, Boolean(FUND_TOKEN_B))
  const symbol = read<string>({ address: FUND_TOKEN_B, abi: fundTokenAbi, functionName: 'symbol' }, Boolean(FUND_TOKEN_B))
  return { registry, policyId, symbol }
}

export function useDemoAmountB(): bigint | undefined {
  return read<bigint>({ address: SUBSCRIPTION_B, abi: subscriptionAbi, functionName: 'demoAmount' }, Boolean(SUBSCRIPTION_B))
}

/** The checker's answer for this account: bytes2 flags, 0x0000 means no swap and no liquidity. Undefined without a checker. */
export function useCheckerFlags(account?: Address): Hex | undefined {
  return read<Hex>({ address: CHECKER, abi: checkerAbi, functionName: 'checkAllowlist', args: account ? [account, FUND_TOKEN] : undefined }, Boolean(CHECKER && account))
}

export type BeatState = { status: 'idle' } | { status: 'pending'; label: string } | { status: 'done'; label: string; hash: Hex } | { status: 'refused'; label: string; message: string }

function shortError(e: unknown): string {
  if (e && typeof e === 'object') {
    const x = e as { shortMessage?: string; message?: string }
    return x.shortMessage ?? x.message ?? String(e)
  }
  return String(e)
}

/** Investor writes from the connected wallet: Subscribe with Issuer B, Transfer NDF. */
export function useInvestorWrites(address?: Address) {
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const queryClient = useQueryClient()
  const [beat, setBeat] = useState<BeatState>({ status: 'idle' })
  const run = useCallback(
    async (label: string, fn: () => Promise<Hex>) => {
      setBeat({ status: 'pending', label })
      try {
        const hash = await fn()
        if (client) await client.waitForTransactionReceipt({ hash })
        setBeat({ status: 'done', label, hash })
      } catch (e) {
        setBeat({ status: 'refused', label, message: shortError(e) })
      } finally {
        await queryClient.invalidateQueries()
      }
    },
    [client, queryClient],
  )
  return {
    beat,
    reset: () => setBeat({ status: 'idle' }),
    subscribeB: () => run('Subscribe with Issuer B', () => writeContractAsync({ address: SUBSCRIPTION_B!, abi: subscriptionAbi, functionName: 'subscribe', args: [] })),
    transfer: (to: Address, amount: bigint) => run(`Transfer to ${to.slice(0, 8)}`, () => writeContractAsync({ address: FUND_TOKEN, abi: fundTokenAbi, functionName: 'transfer', args: [to, amount] })),
    ready: Boolean(address),
  }
}

/** True when this build carries the dev operator key (local testing only): the beats run from the board. */
export const OPERATOR_ON_BOARD: boolean = Boolean(DEV_OPERATOR_KEY)
export const LOCAL_CHAIN: boolean = chain.id === 31337

/** Operator beats with the dev operator key; every call is a plain transaction to the registry, the same the issuer console sends. */
export function useOperatorBeats() {
  const client = usePublicClient()
  const queryClient = useQueryClient()
  const [beat, setBeat] = useState<BeatState>({ status: 'idle' })
  const wallet = DEV_OPERATOR_KEY ? createWalletClient({ account: privateKeyToAccount(DEV_OPERATOR_KEY), chain, transport: http(rpcUrl) }) : undefined
  const run = useCallback(
    async (label: string, kind: 'attestByOperator' | 'approve' | 'revoke', subject: Address, fn: () => Promise<Hex>) => {
      setBeat({ status: 'pending', label })
      try {
        const hash = await fn()
        if (client) await client.waitForTransactionReceipt({ hash })
        addReceipt({ kind, hash, subject, from: wallet?.account.address, at: Date.now() })
        setBeat({ status: 'done', label, hash })
      } catch (e) {
        setBeat({ status: 'refused', label, message: shortError(e) })
      } finally {
        await queryClient.invalidateQueries()
      }
    },
    [client, queryClient, wallet],
  )
  const send = (functionName: 'attestByOperator' | 'approve' | 'revoke', args: unknown[]) => {
    if (!wallet) throw new Error('no operator key in this build')
    return wallet.writeContract({ address: REGISTRY, abi: registryAbi, functionName, args })
  }
  return {
    beat,
    revoke: (subject: Address) => run('Revoke', 'revoke', subject, () => send('revoke', [subject, POLICY_ID])),
    approve: (subject: Address) => run('Re-approve', 'approve', subject, () => send('approve', [subject, POLICY_ID])),
    /** attestByOperator with the demo bits, tier A and the default ttl from the chain's clock. */
    attest: async (subject: Address) => {
      const now = client ? (await client.getBlock()).timestamp : BigInt(Math.floor(Date.now() / 1000))
      const decision = { policyId: POLICY_ID, bits: REQUIRED_BITS, tier: TIER_A, expiry: now + BigInt(DECISION_TTL_SECONDS), statusRef: ZERO32, revoked: false }
      return run('Attest by operator', 'attestByOperator', subject, () => send('attestByOperator', [subject, decision]))
    },
    /** anvil only: evm_increaseTime to one minute past the decision's expiry, then evm_mine, so every door reads a clock past it. */
    warp: async (expiry: bigint) => {
      setBeat({ status: 'pending', label: 'Expiry (local clock)' })
      try {
        const now = client ? (await client.getBlock()).timestamp : BigInt(Math.floor(Date.now() / 1000))
        const seconds = Number(expiry > now ? expiry - now : 0n) + 60
        for (const [method, params] of [
          ['evm_increaseTime', [seconds]],
          ['evm_mine', []],
        ] as const) {
          const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
          const body = (await r.json()) as { error?: { message: string } }
          if (body.error) throw new Error(body.error.message)
        }
        setBeat({ status: 'done', label: `Clock moved ${seconds} s`, hash: '0x' })
      } catch (e) {
        setBeat({ status: 'refused', label: 'Expiry (local clock)', message: shortError(e) })
      } finally {
        await queryClient.invalidateQueries()
      }
    },
  }
}
