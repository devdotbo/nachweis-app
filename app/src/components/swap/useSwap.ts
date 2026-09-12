/**
 * Chain access for the Swap door: the pool's state, the three answers the pool relies on for this
 * address (registry, checker, adapter), and the swap itself through the permissioned Universal Router
 * from the connected wallet. Reads go through react-query with the app's 8 s poll; the swap runs its
 * steps in order and records the receipt in the receipts store.
 */
import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erc20Abi, type Address, type Hex } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { FUND_TOKEN } from '../../config'
import { registryAbi } from '../../lib/contracts'
import { addReceipt } from '../../lib/receipts'
import { adapterAbi, checkerAbi, mockStableAbi, permit2Abi, stateViewAbi } from './abi'
import { classifyPreflightError, classifySendError, explainRevert, quoteExactIn, SWAP_ALLOWED, swapCalldata, unexplainedRevert, type Quote, type Refusal } from './calldata'
import { POOL_CONFIG, SWAP_AMOUNT_IN, SWAP_DEADLINE_SECONDS, type PoolConfig } from './config'

const POLL_MS = 8000
/** Gas for a swap that the preflight already refused, so the wallet does not estimate (which would fail) and the refusal lands on chain. */
const REFUSED_SWAP_GAS = 800_000n

export interface PoolState {
  sqrtPriceX96: bigint
  tick: number
  lpFee: number
  liquidity: bigint
  checker: Address
  checkerRegistry: Address
  checkerPolicyId: Hex
  checkerRequiredBits: bigint
  swappingEnabled: boolean
  hookAllowed: boolean
  routerAllowed: boolean
  permissionedToken: Address
  adapterOwner: Address
  /** Virtual FundToken the PoolManager holds, the pool's FundToken side. */
  wrappedInPool: bigint
  stableSymbol: string
  stableDecimals: number
  fundSymbol: string
  fundDecimals: number
  /** Demo stable held by the adapter? No: by the PoolManager (the pool's stable side). */
  stableInPool: bigint
}

export function usePoolState(cfg: PoolConfig | undefined = POOL_CONFIG) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['swap', 'pool', cfg?.poolId],
    enabled: Boolean(cfg && client),
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<PoolState> => {
      if (!cfg || !client) throw new Error('no pool')
      const read = client.readContract.bind(client)
      const [slot0, liquidity, checker, swappingEnabled, hookAllowed, routerAllowed, permissionedToken, adapterOwner, wrappedInPool, stableSymbol, stableDecimals, fundSymbol, fundDecimals, stableInPool] = await Promise.all([
        read({ address: cfg.stateView, abi: stateViewAbi, functionName: 'getSlot0', args: [cfg.poolId] }),
        read({ address: cfg.stateView, abi: stateViewAbi, functionName: 'getLiquidity', args: [cfg.poolId] }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'allowListChecker' }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'swappingEnabled' }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'allowedHooks', args: [cfg.permissionedHooks] }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'allowedWrappers', args: [cfg.universalRouter] }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'PERMISSIONED_TOKEN' }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'owner' }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'balanceOf', args: [cfg.poolManager] }),
        read({ address: cfg.stable, abi: erc20Abi, functionName: 'symbol' }),
        read({ address: cfg.stable, abi: erc20Abi, functionName: 'decimals' }),
        read({ address: FUND_TOKEN, abi: erc20Abi, functionName: 'symbol' }),
        read({ address: FUND_TOKEN, abi: erc20Abi, functionName: 'decimals' }),
        read({ address: cfg.stable, abi: erc20Abi, functionName: 'balanceOf', args: [cfg.poolManager] }),
      ])
      const [checkerRegistry, checkerPolicyId, checkerRequiredBits] = await Promise.all([
        read({ address: checker, abi: checkerAbi, functionName: 'registry' }),
        read({ address: checker, abi: checkerAbi, functionName: 'policyId' }),
        read({ address: checker, abi: checkerAbi, functionName: 'requiredBits' }),
      ])
      return {
        sqrtPriceX96: slot0[0],
        tick: slot0[1],
        lpFee: slot0[3],
        liquidity,
        checker,
        checkerRegistry,
        checkerPolicyId,
        checkerRequiredBits,
        swappingEnabled,
        hookAllowed,
        routerAllowed,
        permissionedToken,
        adapterOwner,
        wrappedInPool,
        stableSymbol,
        stableDecimals,
        fundSymbol,
        fundDecimals,
        stableInPool,
      }
    },
  })
}

export interface SwapCheck {
  /** registry.isEligible(you, checker.policyId, checker.requiredBits): the one fact the checker reads. */
  registryEligible: boolean
  /** checker.checkAllowlist(you, fundToken): the flags the checker grants (0x0003 or 0x0000). */
  checkerFlags: Hex
  /** adapter.isAllowed(you, SWAP_ALLOWED): what the hook and the router ask. */
  adapterAllowed: boolean
  stableBalance: bigint
}

/** The three answers the pool relies on, in the order they are asked in reverse: registry, checker, adapter. */
export function useSwapCheck(address: Address | undefined, pool: PoolState | undefined, cfg: PoolConfig | undefined = POOL_CONFIG) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['swap', 'check', cfg?.poolId, address, pool?.checker],
    enabled: Boolean(cfg && client && address && pool),
    refetchInterval: POLL_MS,
    queryFn: async (): Promise<SwapCheck> => {
      if (!cfg || !client || !address || !pool) throw new Error('no pool')
      const read = client.readContract.bind(client)
      const [registryEligible, checkerFlags, adapterAllowed, stableBalance] = await Promise.all([
        read({ address: pool.checkerRegistry, abi: registryAbi, functionName: 'isEligible', args: [address, pool.checkerPolicyId, pool.checkerRequiredBits] }) as Promise<boolean>,
        read({ address: pool.checker, abi: checkerAbi, functionName: 'checkAllowlist', args: [address, FUND_TOKEN] }),
        read({ address: cfg.adapter, abi: adapterAbi, functionName: 'isAllowed', args: [address, SWAP_ALLOWED] }),
        read({ address: cfg.stable, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
      ])
      return { registryEligible, checkerFlags, adapterAllowed, stableBalance }
    },
  })
}

export function useQuote(pool: PoolState | undefined, cfg: PoolConfig | undefined = POOL_CONFIG, amountIn = SWAP_AMOUNT_IN): Quote | undefined {
  if (!pool || !cfg) return undefined
  return quoteExactIn(pool.sqrtPriceX96, pool.liquidity, cfg.key.fee, amountIn, cfg.stableIsCurrency0)
}

export type SwapStepId = 'faucet' | 'approve' | 'permit2' | 'swap'

export interface SwapStep {
  id: SwapStepId
  label: string
  hash?: Hex
  skipped?: boolean
}

/**
 * How far a refused swap got: `reverted` is the only outcome the chain confirmed (mined, status 0);
 * `declined` and `notSent` mean no transaction exists and the refusal is the simulation's word alone;
 * `unconfirmed` means a hash exists but no receipt arrived within the wait.
 */
export type RefusedOutcome = 'reverted' | 'declined' | 'notSent' | 'unconfirmed'

export type SwapTxState =
  | { status: 'idle' }
  | { status: 'running'; current: SwapStepId; steps: SwapStep[] }
  | { status: 'done'; hash: Hex; stableIn: bigint; fundOut: bigint; gasUsed: bigint; steps: SwapStep[]; note?: string }
  | { status: 'refused'; refusal: Refusal; hash?: Hex; outcome: RefusedOutcome; steps: SwapStep[]; note?: string }
  | { status: 'error'; message: string; hash?: Hex; steps: SwapStep[] }

function shortError(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { shortMessage?: string; message?: string }
    return anyE.shortMessage ?? anyE.message ?? String(e)
  }
  return String(e)
}

/**
 * The swap from the connected wallet, four steps: demo stable from the MockStable faucet when the
 * balance is short, ERC-20 approval to Permit2, Permit2 allowance to the router, then
 * UniversalRouter.execute. The execute call is simulated first; a refusal is decoded into words and then
 * sent anyway with a fixed gas limit, so the refused swap is on chain with a hash like the accepted one.
 * The mined receipt is authoritative either way: status 1 is a swap whatever the simulation said, status 0
 * is a refusal with the simulation's reason (or a replay's). A simulation that failed without a revert
 * (timeout, HTTP error) is no verdict on the contract: the swap is sent as usual with a note.
 */
export function useSwapTx(address: Address | undefined, cfg: PoolConfig | undefined = POOL_CONFIG, amountIn = SWAP_AMOUNT_IN) {
  const [state, setState] = useState<SwapTxState>({ status: 'idle' })
  const client = usePublicClient()
  const { data: wallet } = useWalletClient()
  const queryClient = useQueryClient()

  const swap = useCallback(async () => {
    if (!cfg || !address || !client || !wallet) return
    const steps: SwapStep[] = []
    const running = (current: SwapStepId) => setState({ status: 'running', current, steps: [...steps] })
    const wait = (hash: Hex) => client.waitForTransactionReceipt({ hash })
    /** The swap transaction's hash once sent, so an error after the send still shows it. */
    let sentHash: Hex | undefined
    /** A balance read after the swap is best-effort: the chain confirmed the swap, a failed read must not undo that. */
    const balanceOf = async (token: Address): Promise<bigint | undefined> => {
      try {
        return await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      } catch {
        return undefined
      }
    }
    /** Simulated clean, reverted when mined (state changed in between): replay the call at that block for the reason. */
    const lateReason = async (data: Hex, blockNumber: bigint): Promise<Refusal> => {
      try {
        await client.call({ account: address, to: cfg.universalRouter, data, blockNumber })
        return unexplainedRevert('A replay of the call at that block does not revert, so the reason is not recoverable from here.')
      } catch (e) {
        const verdict = classifyPreflightError(e)
        return verdict.kind === 'reverted' ? explainRevert(verdict.data, cfg) : unexplainedRevert(`The replay for the reason failed: ${verdict.reason}.`)
      }
    }
    try {
      running('faucet')
      const stableBefore = await client.readContract({ address: cfg.stable, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      if (stableBefore < amountIn) {
        const hash = await wallet.writeContract({ address: cfg.stable, abi: mockStableAbi, functionName: 'mint', args: [address, amountIn - stableBefore], chain: wallet.chain, account: wallet.account })
        await wait(hash)
        steps.push({ id: 'faucet', label: 'demo stable minted (MockStable faucet, test chain only)', hash })
      } else steps.push({ id: 'faucet', label: 'demo stable already held', skipped: true })

      running('approve')
      const allowance = await client.readContract({ address: cfg.stable, abi: erc20Abi, functionName: 'allowance', args: [address, cfg.permit2] })
      if (allowance < amountIn) {
        const hash = await wallet.writeContract({ address: cfg.stable, abi: erc20Abi, functionName: 'approve', args: [cfg.permit2, amountIn], chain: wallet.chain, account: wallet.account })
        await wait(hash)
        steps.push({ id: 'approve', label: 'stable approved to Permit2 (ERC-20 approve)', hash })
      } else steps.push({ id: 'approve', label: 'Permit2 already approved on the stable', skipped: true })

      running('permit2')
      const block = await client.getBlock()
      const now = Number(block.timestamp)
      const [permitAmount, permitExpiry] = await client.readContract({ address: cfg.permit2, abi: permit2Abi, functionName: 'allowance', args: [address, cfg.stable, cfg.universalRouter] })
      if (permitAmount < amountIn || permitExpiry <= now) {
        const hash = await wallet.writeContract({ address: cfg.permit2, abi: permit2Abi, functionName: 'approve', args: [cfg.stable, cfg.universalRouter, amountIn, now + SWAP_DEADLINE_SECONDS], chain: wallet.chain, account: wallet.account })
        await wait(hash)
        steps.push({ id: 'permit2', label: 'Permit2 allowance for the permissioned router', hash })
      } else steps.push({ id: 'permit2', label: 'Permit2 allowance for the router already set', skipped: true })

      running('swap')
      const deadline = BigInt(now + SWAP_DEADLINE_SECONDS)
      const data = swapCalldata(cfg, amountIn, 0n, deadline)
      const stableStart = await client.readContract({ address: cfg.stable, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      const fundStart = await client.readContract({ address: FUND_TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

      let refusal: Refusal | undefined
      let note: string | undefined
      try {
        await client.call({ account: address, to: cfg.universalRouter, data })
      } catch (e) {
        const verdict = classifyPreflightError(e)
        if (verdict.kind === 'reverted') refusal = explainRevert(verdict.data, cfg)
        else note = `simulation unavailable (${verdict.reason}), sending without it`
      }
      const finish = (next: SwapTxState) => {
        setState(next)
        void queryClient.invalidateQueries()
      }

      // Send. A refusal the simulation predicted goes out with a fixed gas limit (the wallet's estimate would fail), so it lands on chain like an accepted swap.
      let hash: Hex
      try {
        hash = await wallet.sendTransaction({ to: cfg.universalRouter, data, ...(refusal ? { gas: REFUSED_SWAP_GAS } : {}), chain: wallet.chain, account: wallet.account })
      } catch (e) {
        const verdict = classifySendError(e)
        // The wallet's own gas estimate reverted: a refusal, nothing sent.
        if (verdict.kind === 'reverted' && !refusal) refusal = explainRevert(verdict.data, cfg)
        if (verdict.kind === 'declined' && !refusal) {
          steps.push({ id: 'swap', label: 'UniversalRouter.execute declined in wallet, not sent' })
          finish({ status: 'error', message: 'declined in wallet, not sent', steps })
          return
        }
        if (!refusal) throw e
        const declined = verdict.kind === 'declined'
        steps.push({ id: 'swap', label: declined ? 'UniversalRouter.execute refused (declined in wallet; the refusal is the simulation\'s)' : 'UniversalRouter.execute refused (not sent; the refusal is the simulation\'s)' })
        finish({ status: 'refused', refusal, outcome: declined ? 'declined' : 'notSent', steps, note })
        return
      }

      sentHash = hash
      let receipt: Awaited<ReturnType<typeof wait>>
      try {
        receipt = await wait(hash)
      } catch (e) {
        // Sent, no receipt within the wait: neither confirmed nor refused by the chain.
        steps.push({ id: 'swap', label: 'UniversalRouter.execute sent, not confirmed within the wait', hash })
        if (refusal) finish({ status: 'refused', refusal, hash, outcome: 'unconfirmed', steps, note })
        else finish({ status: 'error', message: `sent, not confirmed: ${shortError(e)}`, hash, steps })
        return
      }

      if (receipt.status !== 'success') {
        // Mined and reverted. The reason: the simulation's, else a replay of the call at that block.
        const reason = refusal ?? (await lateReason(data, receipt.blockNumber))
        addReceipt({ kind: 'swapRefused', hash, subject: address, from: address, at: Date.now() })
        steps.push({ id: 'swap', label: refusal ? 'UniversalRouter.execute refused' : 'UniversalRouter.execute reverted when mined', hash })
        finish({ status: 'refused', refusal: reason, hash, outcome: 'reverted', steps, note })
        return
      }

      // Mined with status 1: a swap, whatever the simulation predicted.
      if (refusal) note = `${note ? `${note}; ` : ''}the simulation predicted "${refusal.title}", the mined transaction succeeded`
      addReceipt({ kind: 'swap', hash, subject: address, from: address, at: Date.now() })
      steps.push({ id: 'swap', label: 'UniversalRouter.execute (V4_SWAP: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL)', hash })
      const stableEnd = await balanceOf(cfg.stable)
      const fundEnd = await balanceOf(FUND_TOKEN)
      if (stableEnd === undefined || fundEnd === undefined) note = `${note ? `${note}; ` : ''}the balances after the swap could not be read, the amounts below are not known (0 shown)`
      finish({ status: 'done', hash, stableIn: stableEnd === undefined ? 0n : stableStart - stableEnd, fundOut: fundEnd === undefined ? 0n : fundEnd - fundStart, gasUsed: receipt.gasUsed, steps, note })
    } catch (e) {
      setState({ status: 'error', message: shortError(e), hash: sentHash, steps })
    }
  }, [cfg, address, client, wallet, amountIn, queryClient])

  return { state, swap, reset: () => setState({ status: 'idle' }), ready: Boolean(cfg && address && client && wallet) }
}
