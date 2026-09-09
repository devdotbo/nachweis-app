/**
 * The bytes of a permissioned swap and the words for its refusal.
 *
 * Calldata: the same layout PermissionedPoolActions.swapExactInSingle encodes and the fork test sent
 * (contracts/docs/uniswap-permissioned-pool.md, "Swap from the app"): one V4_SWAP command whose input
 * is SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL with the six-field ExactInputSingleParams of v4-periphery
 * main (minHopPriceX36 included).
 *
 * Quote: the V4Quoter deployed with the permissioned-pools set cannot quote this pool. PermissionedHooks
 * asks its caller for msgSender() and the quoter has no such function, so beforeSwap fails with empty
 * data for every caller (checked on the fork 2026-09-09, FEEDBACK.md). The door therefore estimates
 * from slot0 and the pool's liquidity with the single-range constant-product formula, which is exact
 * while the swap stays inside the one full-range position of the demo pool (the script's swap matched
 * it to the wei).
 */
import { decodeErrorResult, encodeAbiParameters, encodeFunctionData, encodePacked, toFunctionSelector, type Address, type Hex } from 'viem'
import { revertAbi, routerAbi } from './abi'
import type { PoolConfig } from './config'

// v4-periphery Actions and universal-router Commands, the constants PermissionedPoolActions.sol carries.
const SWAP_EXACT_IN_SINGLE = 0x06
const SETTLE_ALL = 0x0c
const TAKE_ALL = 0x0f
const COMMAND_V4_SWAP: Hex = '0x10'

const Q96 = 1n << 96n
const FEE_DENOMINATOR = 1_000_000n

export const SWAP_ALLOWED: Hex = '0x0001'
export const LIQUIDITY_ALLOWED: Hex = '0x0002'

const BEFORE_SWAP = toFunctionSelector('beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)')
const BEFORE_ADD_LIQUIDITY = toFunctionSelector('beforeAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)')

/** UniversalRouter.execute(commands, inputs, deadline) for a stable-in, FundToken-out exact-input swap. */
export function swapCalldata(cfg: PoolConfig, amountIn: bigint, amountOutMinimum: bigint, deadline: bigint): Hex {
  const zeroForOne = cfg.stableIsCurrency0
  const input = zeroForOne ? cfg.key.currency0 : cfg.key.currency1
  const output = zeroForOne ? cfg.key.currency1 : cfg.key.currency0
  const actions = encodePacked(['uint8', 'uint8', 'uint8'], [SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
  const swapParams = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            name: 'poolKey',
            components: [
              { type: 'address', name: 'currency0' },
              { type: 'address', name: 'currency1' },
              { type: 'uint24', name: 'fee' },
              { type: 'int24', name: 'tickSpacing' },
              { type: 'address', name: 'hooks' },
            ],
          },
          { type: 'bool', name: 'zeroForOne' },
          { type: 'uint128', name: 'amountIn' },
          { type: 'uint128', name: 'amountOutMinimum' },
          { type: 'uint256', name: 'minHopPriceX36' },
          { type: 'bytes', name: 'hookData' },
        ],
      },
    ],
    [{ poolKey: cfg.key, zeroForOne, amountIn, amountOutMinimum, minHopPriceX36: 0n, hookData: '0x' }],
  )
  const settleAll = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [input, amountIn])
  const takeAll = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [output, amountOutMinimum])
  const v4SwapInput = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settleAll, takeAll]])
  return encodeFunctionData({ abi: routerAbi, functionName: 'execute', args: [COMMAND_V4_SWAP, [v4SwapInput], deadline] })
}

export interface Quote {
  amountOut: bigint
  sqrtPriceX96After: bigint
  /** Input after the LP fee, what actually moves the price. */
  amountInAfterFee: bigint
}

/**
 * Exact-input quote inside one liquidity range: constant product on the active liquidity after the fee.
 * zeroForOne: sqrtP' = L sqrtP / (L + dx sqrtP), out = L (sqrtP - sqrtP'); else sqrtP' = sqrtP + dy / L,
 * out = L (sqrtP' - sqrtP) / (sqrtP sqrtP'), all in Q96 fixed point.
 */
export function quoteExactIn(sqrtPriceX96: bigint, liquidity: bigint, fee: number, amountIn: bigint, zeroForOne: boolean): Quote | undefined {
  if (sqrtPriceX96 === 0n || liquidity === 0n || amountIn === 0n) return undefined
  const amountInAfterFee = (amountIn * (FEE_DENOMINATOR - BigInt(fee))) / FEE_DENOMINATOR
  if (zeroForOne) {
    const sqrtPriceX96After = (liquidity * Q96 * sqrtPriceX96) / (liquidity * Q96 + amountInAfterFee * sqrtPriceX96)
    return { amountOut: (liquidity * (sqrtPriceX96 - sqrtPriceX96After)) / Q96, sqrtPriceX96After, amountInAfterFee }
  }
  const sqrtPriceX96After = sqrtPriceX96 + (amountInAfterFee * Q96) / liquidity
  return { amountOut: (liquidity * Q96 * (sqrtPriceX96After - sqrtPriceX96)) / (sqrtPriceX96 * sqrtPriceX96After), sqrtPriceX96After, amountInAfterFee }
}

/** Price of one whole currency1 in whole currency0 units, from sqrtPriceX96 and the two decimals. */
export function priceFromSqrt(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const s = Number(sqrtPriceX96) / 2 ** 96
  // raw token1 per raw token0 is s^2; whole units need the decimal shift.
  const token1PerToken0 = s * s * 10 ** (decimals0 - decimals1)
  return token1PerToken0 === 0 ? 0 : 1 / token1PerToken0
}

export interface Refusal {
  /** One line: who refused. */
  title: string
  /** Plain words: why. */
  plain: string
  /** The decoded revert, one line per layer, for the details block. */
  decoded: string[]
  /** The raw revert data. */
  raw?: Hex
}

function decode(data: Hex): { errorName: string; args: readonly unknown[] } | undefined {
  try {
    const d = decodeErrorResult({ abi: revertAbi, data })
    return { errorName: d.errorName, args: (d.args ?? []) as readonly unknown[] }
  } catch {
    return undefined
  }
}

function short(a: string): string {
  return `${a.slice(0, 8)}...${a.slice(-4)}`
}

/** Words for the revert data of a refused swap; every layer of an ERC-7751 WrappedError is unwrapped. */
export function explainRevert(data: Hex | undefined, cfg: PoolConfig): Refusal {
  if (!data || data === '0x') {
    return { title: 'Refused without revert data', plain: 'The call reverted and returned no data.', decoded: ['(empty)'], raw: data }
  }
  const d = decode(data)
  if (!d) {
    return { title: `Refused with custom error ${data.slice(0, 10)}`, plain: 'The revert selector is not one the door knows; the raw data is below.', decoded: [`custom error ${data.slice(0, 10)}`], raw: data }
  }
  switch (d.errorName) {
    case 'WrappedError': {
      const [target, selector, reason, details] = d.args as [Address, Hex, Hex, Hex]
      const where = target.toLowerCase() === cfg.permissionedHooks.toLowerCase() ? 'PermissionedHooks' : `contract ${short(target)}`
      const call = selector === BEFORE_SWAP ? 'beforeSwap' : selector === BEFORE_ADD_LIQUIDITY ? 'beforeAddLiquidity' : `selector ${selector}`
      const inner = reason && reason !== '0x' ? explainRevert(reason, cfg) : undefined
      const detailsName = details && details !== '0x' ? (decode(details)?.errorName ?? details.slice(0, 10)) : '(none)'
      return {
        title: `Refused by ${where}.${call}`,
        plain: inner ? inner.plain : `${where}.${call} reverted without data (the PoolManager reports ${detailsName}).`,
        decoded: [`WrappedError(target ${target}, selector ${selector} = ${call})`, ...(inner ? inner.decoded.map((l) => `  reason: ${l}`) : ['  reason: (empty)']), `  details: ${detailsName}`],
        raw: data,
      }
    }
    case 'Unauthorized':
      return {
        title: 'Unauthorized()',
        plain: 'Unauthorized(): this address is not SWAP_ALLOWED. The hook asked the adapter, the adapter asked the checker, the checker asked the registry: isEligible(you, policy, bits) is false right now. After the issuer approves again, the same swap goes through.',
        decoded: ['Unauthorized()'],
        raw: data,
      }
    case 'SwappingDisabled':
      return { title: 'SwappingDisabled()', plain: 'The adapter owner (the issuer) has disabled swapping on this pool. Nobody can swap until it is enabled again.', decoded: ['SwappingDisabled()'], raw: data }
    case 'HookNotAllowed':
      return { title: 'HookNotAllowed()', plain: 'The pool hook is not allow-listed on the adapter (onboarding step 5 missing).', decoded: ['HookNotAllowed()'], raw: data }
    case 'TransactionDeadlinePassed':
    case 'DeadlinePassed':
      return { title: 'Deadline passed', plain: 'The router refused because the deadline in the calldata is in the past. Try again.', decoded: [`${d.errorName}()`], raw: data }
    case 'NotEligible': {
      const [subject] = d.args as [Address]
      return { title: 'NotEligible(address)', plain: `The FundToken refused to deliver to ${short(subject)}: the token's own transfer check reads the registry again when the adapter unwraps the output.`, decoded: [`NotEligible(${subject})`], raw: data }
    }
    case 'ExecutionFailed': {
      const [index, message] = d.args as [bigint, Hex]
      const inner = explainRevert(message, cfg)
      return { title: inner.title, plain: inner.plain, decoded: [`ExecutionFailed(command ${index})`, ...inner.decoded.map((l) => `  ${l}`)], raw: data }
    }
    case 'UnexpectedRevertBytes': {
      const [revertData] = d.args as [Hex]
      const inner = explainRevert(revertData, cfg)
      return { title: inner.title, plain: inner.plain, decoded: ['UnexpectedRevertBytes', ...inner.decoded.map((l) => `  ${l}`)], raw: data }
    }
    case 'V4TooLittleReceived': {
      const [min, got] = d.args as [bigint, bigint]
      return { title: 'V4TooLittleReceived', plain: `Slippage: the pool would deliver ${got} wei, below the minimum ${min}.`, decoded: [`V4TooLittleReceived(${min}, ${got})`], raw: data }
    }
    default:
      return { title: d.errorName, plain: `${d.errorName} reverted the swap.`, decoded: [d.errorName], raw: data }
  }
}

/**
 * The revert data inside a viem error: `data` or `raw` on the error or any cause (RPC errors carry it as
 * a hex string, contract errors as an object with `data`), else the first long hex in a message.
 */
export function revertDataOf(e: unknown): Hex | undefined {
  const seen = new Set<object>()
  const stack: unknown[] = [e]
  let fromMessage: Hex | undefined
  while (stack.length) {
    const x = stack.pop()
    if (!x || typeof x !== 'object' || seen.has(x)) continue
    seen.add(x)
    const o = x as Record<string, unknown>
    for (const k of ['raw', 'data']) {
      const v = o[k]
      if (typeof v === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(v)) return v as Hex
      if (v && typeof v === 'object') stack.push(v)
    }
    for (const k of ['details', 'message', 'shortMessage']) {
      const v = o[k]
      if (typeof v === 'string' && !fromMessage) {
        const m = v.match(/0x[0-9a-fA-F]{8,}/)
        if (m) fromMessage = m[0] as Hex
      }
    }
    if (o.cause) stack.push(o.cause)
    if (o.error) stack.push(o.error)
  }
  return fromMessage
}
