/**
 * The classification behind the Swap door's refusal claim: only an error that carries a revert is a
 * refusal; a transport failure (timeout, HTTP error, RPC error without revert data) is "unavailable",
 * even when its text quotes calldata or addresses. Pure module, `bun test` from app/.
 */
import { describe, expect, test } from 'bun:test'
import { CallExecutionError, ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult, ExecutionRevertedError, HttpRequestError, RpcRequestError, TimeoutError, toFunctionSelector, UserRejectedRequestError, type Hex } from 'viem'
import { revertAbi } from './abi'
import { classifyPreflightError, classifySendError, explainRevert, revertDataOf } from './calldata'
import type { PoolConfig } from './config'

const URL = 'http://127.0.0.1:8545'
const ROUTER = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD'
const HOOKS = '0x00000000000000000000000000000000000000c0'
const CALLDATA: Hex = '0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0'
const body = { method: 'eth_call', params: [{ from: ROUTER, to: ROUTER, data: CALLDATA }, 'latest'] }
const cfg = { permissionedHooks: HOOKS } as PoolConfig

const UNAUTHORIZED = encodeErrorResult({ abi: revertAbi, errorName: 'Unauthorized' })
const BEFORE_SWAP = toFunctionSelector('beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)')
const WRAPPED = encodeErrorResult({ abi: revertAbi, errorName: 'WrappedError', args: [HOOKS, BEFORE_SWAP, UNAUTHORIZED, '0x'] })

/** What viem's client.call throws when anvil answers eth_call with code 3 and revert data. */
function callReverted(data: Hex | undefined) {
  const rpc = new RpcRequestError({ body, error: { code: 3, message: 'execution reverted', data }, url: URL })
  const node = new ExecutionRevertedError({ cause: rpc, message: rpc.details })
  return new CallExecutionError(node, { to: ROUTER, data: CALLDATA })
}

describe('classifyPreflightError', () => {
  test('a viem TimeoutError is unavailable, although its text quotes the calldata', () => {
    const e = new CallExecutionError(new TimeoutError({ body, url: URL }), { to: ROUTER, data: CALLDATA })
    expect(e.message).toContain(CALLDATA)
    expect(revertDataOf(e)).toBeUndefined()
    expect(classifyPreflightError(e)).toEqual({ kind: 'unavailable', reason: 'The request took too long to respond.' })
  })

  test('a viem HttpRequestError is unavailable', () => {
    const e = new CallExecutionError(new HttpRequestError({ body, url: URL, status: 502, details: 'Bad Gateway' }), { to: ROUTER, data: CALLDATA })
    expect(e.message).toContain(CALLDATA)
    expect(classifyPreflightError(e)).toEqual({ kind: 'unavailable', reason: 'HTTP request failed.' })
  })

  test('an RPC error without revert data whose message names an address is unavailable', () => {
    const rpc = new RpcRequestError({ body, error: { code: -32603, message: `internal error: upstream ${ROUTER} unreachable` }, url: URL })
    expect(revertDataOf(rpc)).toBeUndefined()
    expect(classifyPreflightError(rpc).kind).toBe('unavailable')
    const plain = new Error(`proxy ${HOOKS}${'ab'.repeat(20)} refused the connection`)
    expect(classifyPreflightError(plain)).toEqual({ kind: 'unavailable', reason: plain.message })
  })

  test('a ContractFunctionRevertedError carrying Unauthorized() is a revert with that data', () => {
    const reverted = new ContractFunctionRevertedError({ abi: revertAbi, data: UNAUTHORIZED, functionName: 'execute' })
    const e = new ContractFunctionExecutionError(reverted, { abi: revertAbi, functionName: 'execute', contractAddress: ROUTER })
    expect(classifyPreflightError(e)).toEqual({ kind: 'reverted', data: UNAUTHORIZED })
    expect(explainRevert(UNAUTHORIZED, cfg).title).toBe('Unauthorized()')
  })

  test('eth_call revert data from the node (WrappedError around Unauthorized) is a revert and decodes to the door’s words', () => {
    const verdict = classifyPreflightError(callReverted(WRAPPED))
    expect(verdict).toEqual({ kind: 'reverted', data: WRAPPED })
    const refusal = explainRevert(WRAPPED, cfg)
    expect(refusal.title).toBe('Refused by PermissionedHooks.beforeSwap')
    expect(refusal.plain).toContain('Unauthorized(): this address is not SWAP_ALLOWED')
    expect(refusal.plain).toContain('isEligible(you, policy, bits) is false')
  })

  test('an execution-reverted answer without data is a revert with no data (never "unavailable", never invented)', () => {
    expect(classifyPreflightError(callReverted(undefined))).toEqual({ kind: 'reverted', data: undefined })
    expect(classifyPreflightError(new ExecutionRevertedError({ message: 'execution reverted' }))).toEqual({ kind: 'reverted', data: undefined })
  })
})

describe('classifySendError', () => {
  test('the wallet holder declining is "declined", at any depth', () => {
    const rejected = new UserRejectedRequestError(new Error('User rejected the request.'))
    expect(classifySendError(rejected)).toEqual({ kind: 'declined' })
    expect(classifySendError({ name: 'TransactionExecutionError', cause: rejected })).toEqual({ kind: 'declined' })
  })

  test('a reverted gas estimate is a revert with its data; a transport failure is "failed"', () => {
    expect(classifySendError(callReverted(UNAUTHORIZED))).toEqual({ kind: 'reverted', data: UNAUTHORIZED })
    expect(classifySendError(new TimeoutError({ body, url: URL }))).toEqual({ kind: 'failed', reason: 'The request took too long to respond.' })
  })
})
