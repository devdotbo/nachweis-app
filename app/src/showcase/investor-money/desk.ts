/**
 * Chain access for the fund desk (contracts/src/showcase/FundDesk.sol). Plain wagmi hooks, so the same
 * code drives the dev signer on anvil and the embedded wallet by Privy through @privy-io/wagmi's synced
 * connector (src/lib/PrivyWalletProvider.tsx). Every write is simulated first with the caller's address:
 * a refusal by the desk (NotEligible) is shown in plain words before any signature is asked for.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { BaseError, ContractFunctionRevertedError, erc20Abi, parseAbi, type Abi, type Address, type Hex } from 'viem'
import { usePublicClient, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { DESK } from '../../config'
import type { RegistryStatus } from '../../lib/types'

export const deskAbi = parseAbi([
  'function token() view returns (address)',
  'function stable() view returns (address)',
  'function owner() view returns (address)',
  'function subscribe(uint256 stableAmount)',
  'function distribute(uint256 totalStable)',
  'function claim(uint256 id) returns (uint256)',
  'function claimAll() returns (uint256)',
  'function redeem(uint256 units)',
  'function claimable(address investor, uint256 id) view returns (uint256)',
  'function claimableTotal(address investor) view returns (uint256)',
  'function distributionCount() view returns (uint256)',
  'function distributions(uint256 id) view returns (uint256 total, uint256 perUnit)',
  'function outstandingUnits() view returns (uint256)',
  'function isEligible(address subject) view returns (bool)',
  'error NotEligible(address subject)',
  'error ZeroAmount()',
  'error NoUnitsOutstanding()',
  'error AlreadyClaimed(uint256 id)',
  'error NothingToClaim()',
  'error TokenUnset()',
  'error OwnableUnauthorizedAccount(address account)',
])

/** MockStable: ERC-20 plus an open mint (test stablecoin, anyone can mint). */
export const stableAbi = [...erc20Abi, ...parseAbi(['function mint(address to, uint256 amount)'])] as const satisfies Abi

/** Demo constants (case.md section 5): all amounts are fixed. mUSD has 6 decimals, NDF 18. */
export const MINT_STABLE = 1_000_000_000n // 1,000 mUSD
export const SUBSCRIBE_STABLE = 100_000_000n // 100 mUSD
export const DISTRIBUTE_STABLE = 10_000_000n // 10 mUSD
export const REDEEM_UNITS = 50_000_000_000_000_000_000n // 50 NDF
const POLL_MS = 4000

export interface DeskAddresses {
  token?: Address
  stable?: Address
  owner?: Address
}

/** The desk's fund token, stablecoin and owner, read once from the contract. */
export function useDeskAddresses(): DeskAddresses {
  const q = useReadContracts({
    contracts: [
      { address: DESK, abi: deskAbi, functionName: 'token' },
      { address: DESK, abi: deskAbi, functionName: 'stable' },
      { address: DESK, abi: deskAbi, functionName: 'owner' },
    ],
    query: { enabled: Boolean(DESK), staleTime: Infinity },
  })
  const [token, stable, owner] = q.data ?? []
  return { token: token?.result as Address | undefined, stable: stable?.result as Address | undefined, owner: owner?.result as Address | undefined }
}

export interface InvestorBalances {
  stable?: bigint
  units?: bigint
  claimable?: bigint
  eligible?: boolean
}

/** mUSD, NDF and the unclaimed distributions of one address, plus the desk's own answer to isEligible. */
export function useInvestorBalances(addresses: DeskAddresses, holder?: Address): InvestorBalances {
  const enabled = Boolean(DESK && addresses.token && addresses.stable && holder)
  const q = useReadContracts({
    contracts: [
      { address: addresses.stable, abi: stableAbi, functionName: 'balanceOf', args: holder ? [holder] : undefined },
      { address: addresses.token, abi: erc20Abi, functionName: 'balanceOf', args: holder ? [holder] : undefined },
      { address: DESK, abi: deskAbi, functionName: 'claimableTotal', args: holder ? [holder] : undefined },
      { address: DESK, abi: deskAbi, functionName: 'isEligible', args: holder ? [holder] : undefined },
    ],
    query: { enabled, refetchInterval: POLL_MS },
  })
  const [stable, units, claimable, eligible] = q.data ?? []
  return { stable: stable?.result as bigint | undefined, units: units?.result as bigint | undefined, claimable: claimable?.result as bigint | undefined, eligible: eligible?.result as boolean | undefined }
}

export interface DeskState {
  outstandingUnits?: bigint
  deskStable?: bigint
  distributionCount?: bigint
  /** The operator's own mUSD (the treasury a distribution is paid from). */
  operatorStable?: bigint
}

/** What the issuer's desk panel shows. */
export function useDeskState(addresses: DeskAddresses, operator?: Address): DeskState {
  const enabled = Boolean(DESK && addresses.stable)
  const q = useReadContracts({
    contracts: [
      { address: DESK, abi: deskAbi, functionName: 'outstandingUnits' },
      { address: addresses.stable, abi: stableAbi, functionName: 'balanceOf', args: DESK ? [DESK] : undefined },
      { address: DESK, abi: deskAbi, functionName: 'distributionCount' },
      { address: addresses.stable, abi: stableAbi, functionName: 'balanceOf', args: operator ? [operator] : undefined },
    ],
    query: { enabled, refetchInterval: POLL_MS },
  })
  const [outstanding, deskStable, count, operatorStable] = q.data ?? []
  return {
    outstandingUnits: outstanding?.result as bigint | undefined,
    deskStable: deskStable?.result as bigint | undefined,
    distributionCount: count?.result as bigint | undefined,
    operatorStable: operator ? (operatorStable?.result as bigint | undefined) : undefined,
  }
}

/** One distribution (total paid in, stable wei per 1e18 units). */
export function useDistribution(id?: bigint): { total: bigint; perUnit: bigint } | undefined {
  const q = useReadContract({ address: DESK, abi: deskAbi, functionName: 'distributions', args: id !== undefined ? [id] : undefined, query: { enabled: Boolean(DESK) && id !== undefined, refetchInterval: POLL_MS } })
  const r = q.data as readonly [bigint, bigint] | undefined
  return r ? { total: r[0], perUnit: r[1] } : undefined
}

// ---------------------------------------------------------------------------
// receipts (this page's transactions, in memory, newest first; shared between the two panels of one tab)
// ---------------------------------------------------------------------------

export type DeskReceiptKind = 'mint' | 'approve' | 'subscribe' | 'distribute' | 'claim' | 'redeem'

export interface DeskReceipt {
  kind: DeskReceiptKind
  hash: Hex
  /** In plain words: "100 mUSD into the desk", "10 mUSD claimed". */
  what: string
  from?: Address
  at: number
}

let receipts: DeskReceipt[] = []
const listeners = new Set<() => void>()
function pushReceipt(r: DeskReceipt) {
  receipts = [r, ...receipts]
  for (const l of listeners) l()
}
export function useDeskReceipts(): DeskReceipt[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => receipts,
  )
}

export const DESK_RECEIPT_LABEL: Record<DeskReceiptKind, string> = {
  mint: 'Test mUSD minted',
  approve: 'Allowance set',
  subscribe: 'Subscribed',
  distribute: 'Distribution paid in',
  claim: 'Distribution claimed',
  redeem: 'Redeemed',
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export type DeskTxState =
  | { status: 'idle' }
  | { status: 'pending'; label: string }
  | { status: 'done'; hash: Hex; what: string }
  /** The desk (or the token) refused in simulation: nothing was signed or sent. */
  | { status: 'refused'; reason: string }
  | { status: 'error'; message: string }

export interface DeskTx {
  tx: DeskTxState
  reset: () => void
  /** MockStable.mint to the caller (test stablecoin, anyone can mint). */
  mintStable: (amount: bigint) => Promise<void>
  /** approve (when the allowance is short) then FundDesk.subscribe: mUSD into the desk, NDF to the caller. */
  subscribe: (stable: bigint) => Promise<void>
  /** FundDesk.claimAll: every unclaimed distribution for the caller's balance. */
  claimAll: () => Promise<void>
  /** approve the desk for the units (when short) then FundDesk.redeem: units back to the desk, mUSD to the caller. */
  redeem: (units: bigint) => Promise<void>
  /** Owner only: approve (when short) then FundDesk.distribute: mUSD from the operator's treasury into the desk, one distribution. */
  distribute: (stable: bigint) => Promise<void>
}

/** The revert's error name, when the failure is a decoded contract revert. */
function revertName(e: unknown): { name?: string; args?: readonly unknown[] } | undefined {
  if (!(e instanceof BaseError)) return undefined
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined
  return r ? { name: r.data?.errorName, args: r.data?.args } : { name: undefined }
}

function shortError(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { shortMessage?: string; message?: string }
    return anyE.shortMessage ?? anyE.message ?? String(e)
  }
  return String(e)
}

/**
 * The refusal in plain words. `status` is the registry's view of the caller (src/lib/chain.ts useRegistryStatus),
 * used to say why NotEligible: revoked, awaiting approval, expired, or no decision at all.
 */
export function refusalReason(e: unknown, status: RegistryStatus, nowSeconds = BigInt(Math.floor(Date.now() / 1000))): string | undefined {
  const r = revertName(e)
  if (!r) return undefined
  switch (r.name) {
    case 'NotEligible': {
      const why = status.revoked
        ? 'the issuer revoked the decision for this address (manual revocation)'
        : !status.hasDecision
          ? 'there is no eligibility decision on chain for this address yet'
          : !status.approved
            ? 'evidence is on chain but the issuer has not approved it'
            : status.expiry <= nowSeconds
              ? 'the decision expired'
              : 'the decision does not cover the required predicate bits'
      return `Refused by the chain: this wallet is not eligible, because ${why}. Nothing was signed or sent.`
    }
    case 'NothingToClaim':
      return 'Nothing to claim: no unclaimed distribution for this balance.'
    case 'AlreadyClaimed':
      return 'This distribution was already claimed by this wallet.'
    case 'NoUnitsOutstanding':
      return 'No fund units outstanding: nobody has subscribed yet, so there is nothing to distribute over.'
    case 'ZeroAmount':
      return 'The amount is zero.'
    case 'TokenUnset':
      return 'The desk has no fund token yet (setToken was not called).'
    case 'OwnableUnauthorizedAccount':
      return 'Only the desk owner, the issuer operator, may pay a distribution.'
    case 'ERC20InsufficientBalance':
      return 'Not enough balance: get test mUSD first, or subscribe before redeeming.'
    case 'ERC20InsufficientAllowance':
      return 'The allowance for the desk is too small.'
    default:
      return r.name ? `Refused by the contract: ${r.name}.` : undefined
  }
}

const APPROVE_MAX = (1n << 256n) - 1n

export function useDeskTx(actor: Address | undefined, addresses: DeskAddresses, status: RegistryStatus): DeskTx {
  const [tx, setTx] = useState<DeskTxState>({ status: 'idle' })
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const queryClient = useQueryClient()

  // Simulates with the caller's address, then signs and waits for the receipt. Returns the hash.
  const send = useCallback(
    async (kind: DeskReceiptKind, what: string, req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) => {
      if (!client || !actor) throw new Error('no wallet connected')
      await client.simulateContract({ ...req, account: actor })
      const hash = await writeContractAsync({ ...req, account: actor })
      await client.waitForTransactionReceipt({ hash })
      pushReceipt({ kind, hash, what, from: actor, at: Date.now() })
      return hash
    },
    [client, actor, writeContractAsync],
  )

  // Sets the allowance once (max) when the current one is short: one signature less on every later step.
  const ensureAllowance = useCallback(
    async (token: Address, spender: Address, amount: bigint, what: string) => {
      if (!client || !actor) throw new Error('no wallet connected')
      const current = (await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [actor, spender] })) as bigint
      if (current >= amount) return
      setTx({ status: 'pending', label: `approve, ${what}` })
      await send('approve', what, { address: token, abi: erc20Abi, functionName: 'approve', args: [spender, APPROVE_MAX] })
    },
    [client, actor, send],
  )

  const run = useCallback(
    async (label: string, fn: () => Promise<{ hash: Hex; what: string }>) => {
      setTx({ status: 'pending', label })
      try {
        const r = await fn()
        setTx({ status: 'done', ...r })
        await queryClient.invalidateQueries()
      } catch (e) {
        const reason = refusalReason(e, status)
        setTx(reason ? { status: 'refused', reason } : { status: 'error', message: shortError(e) })
        throw e
      }
    },
    [queryClient, status],
  )

  const desk = DESK
  const noDesk = () => {
    throw new Error('VITE_DESK is not set')
  }
  return {
    tx,
    reset: () => setTx({ status: 'idle' }),
    mintStable: (amount) =>
      run('mint, waiting for the receipt', async () => {
        if (!addresses.stable || !actor) return noDesk()
        const what = `${fmtStable(amount)} mUSD minted to this wallet`
        return { hash: await send('mint', what, { address: addresses.stable, abi: stableAbi, functionName: 'mint', args: [actor, amount] }), what }
      }),
    subscribe: (stable) =>
      run('subscribe, waiting for the receipt', async () => {
        if (!desk || !addresses.stable || !actor || !client) return noDesk()
        // The eligibility check is the first thing subscribe() does: a refusal shows here, before any signature.
        await client.simulateContract({ address: desk, abi: deskAbi, functionName: 'subscribe', args: [stable], account: actor }).catch((e) => {
          if (revertName(e)?.name === 'NotEligible') throw e
          // Any other simulation failure (typically the allowance) is retried after the approval below.
        })
        await ensureAllowance(addresses.stable, desk, stable, 'mUSD allowance for the desk')
        setTx({ status: 'pending', label: 'subscribe, waiting for the receipt' })
        const what = `${fmtStable(stable)} mUSD into the desk, ${fmtStable(stable)} NDF to this wallet`
        return { hash: await send('subscribe', what, { address: desk, abi: deskAbi, functionName: 'subscribe', args: [stable] }), what }
      }),
    claimAll: () =>
      run('claim, waiting for the receipt', async () => {
        if (!desk || !actor || !client) return noDesk()
        const owed = (await client.readContract({ address: desk, abi: deskAbi, functionName: 'claimableTotal', args: [actor] })) as bigint
        const what = `${fmtStable(owed)} mUSD claimed`
        return { hash: await send('claim', what, { address: desk, abi: deskAbi, functionName: 'claimAll', args: [] }), what }
      }),
    redeem: (units) =>
      run('redeem, waiting for the receipt', async () => {
        if (!desk || !addresses.token || !actor || !client) return noDesk()
        await client.simulateContract({ address: desk, abi: deskAbi, functionName: 'redeem', args: [units], account: actor }).catch((e) => {
          if (revertName(e)?.name === 'NotEligible') throw e
        })
        await ensureAllowance(addresses.token, desk, units, 'NDF allowance for the desk')
        setTx({ status: 'pending', label: 'redeem, waiting for the receipt' })
        const what = `${fmtUnits(units)} NDF back to the desk, ${fmtUnits(units)} mUSD to this wallet`
        return { hash: await send('redeem', what, { address: desk, abi: deskAbi, functionName: 'redeem', args: [units] }), what }
      }),
    distribute: (stable) =>
      run('distribute, waiting for the receipt', async () => {
        if (!desk || !addresses.stable || !actor || !client) return noDesk()
        await client.simulateContract({ address: desk, abi: deskAbi, functionName: 'distribute', args: [stable], account: actor }).catch((e) => {
          const n = revertName(e)?.name
          if (n === 'OwnableUnauthorizedAccount' || n === 'NoUnitsOutstanding') throw e
        })
        await ensureAllowance(addresses.stable, desk, stable, 'mUSD allowance for the desk')
        setTx({ status: 'pending', label: 'distribute, waiting for the receipt' })
        const what = `${fmtStable(stable)} mUSD paid into the desk as one distribution`
        return { hash: await send('distribute', what, { address: desk, abi: deskAbi, functionName: 'distribute', args: [stable] }), what }
      }),
  }
}

/** 6-decimal amount, at most 2 decimals shown. */
export function fmtStable(v: bigint): string {
  const whole = v / 1_000_000n
  const cents = (v % 1_000_000n) / 10_000n
  return cents === 0n ? whole.toLocaleString('en-US') : `${whole.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`
}

/** 18-decimal amount, at most 2 decimals shown. */
export function fmtUnits(v: bigint): string {
  const whole = v / 10n ** 18n
  const cents = (v % 10n ** 18n) / 10n ** 16n
  return cents === 0n ? whole.toLocaleString('en-US') : `${whole.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`
}
