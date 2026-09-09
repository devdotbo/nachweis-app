/**
 * ABI subsets for the swap door, hand-copied from the Solidity mirrors in contracts/src/uniswap
 * (interfaces/*Lite.sol, which carry the v4-periphery and universal-router commit they were checked
 * against) and from MockStable.sol. Only the members the door calls.
 */

/** IPermissionsAdapterLite (v4-periphery dce236d, src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol). */
export const adapterAbi = [
  { type: 'function', name: 'isAllowed', stateMutability: 'view', inputs: [{ type: 'address', name: 'account' }, { type: 'bytes2', name: 'permission' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowListChecker', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'swappingEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowedHooks', stateMutability: 'view', inputs: [{ type: 'address', name: 'hook' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowedWrappers', stateMutability: 'view', inputs: [{ type: 'address', name: 'wrapper' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'PERMISSIONED_TOKEN', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address', name: 'account' }], outputs: [{ type: 'uint256' }] },
] as const

/** EudiAllowlistChecker (contracts/src/uniswap/EudiAllowlistChecker.sol) and IAllowlistChecker. */
export const checkerAbi = [
  { type: 'function', name: 'registry', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'policyId', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'requiredBits', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'checkAllowlist', stateMutability: 'view', inputs: [{ type: 'address', name: 'account' }, { type: 'address', name: 'tokenAddress' }], outputs: [{ type: 'bytes2' }] },
] as const

/** IStateViewLite (v4-periphery src/lens/StateView.sol). */
export const stateViewAbi = [
  { type: 'function', name: 'getSlot0', stateMutability: 'view', inputs: [{ type: 'bytes32', name: 'poolId' }], outputs: [{ type: 'uint160', name: 'sqrtPriceX96' }, { type: 'int24', name: 'tick' }, { type: 'uint24', name: 'protocolFee' }, { type: 'uint24', name: 'lpFee' }] },
  { type: 'function', name: 'getLiquidity', stateMutability: 'view', inputs: [{ type: 'bytes32', name: 'poolId' }], outputs: [{ type: 'uint128' }] },
] as const

/** IUniversalRouterLite (universal-router main, permissioned-pools build). */
export const routerAbi = [
  { type: 'function', name: 'execute', stateMutability: 'payable', inputs: [{ type: 'bytes', name: 'commands' }, { type: 'bytes[]', name: 'inputs' }, { type: 'uint256', name: 'deadline' }], outputs: [] },
] as const

/** IPermit2Lite (Uniswap/permit2 IAllowanceTransfer). */
export const permit2Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'token' }, { type: 'address', name: 'spender' }, { type: 'uint160', name: 'amount' }, { type: 'uint48', name: 'expiration' }], outputs: [] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address', name: 'user' }, { type: 'address', name: 'token' }, { type: 'address', name: 'spender' }], outputs: [{ type: 'uint160', name: 'amount' }, { type: 'uint48', name: 'expiration' }, { type: 'uint48', name: 'nonce' }] },
] as const

/** MockStable.mint (contracts/src/test/MockStable.sol): anyone can mint, testnets only. */
export const mockStableAbi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ type: 'address', name: 'to' }, { type: 'uint256', name: 'amount' }], outputs: [] },
] as const

/**
 * Errors a refused swap can surface, for decoding the revert data. WrappedError and HookCallFailed are
 * v4-core (CustomRevert, Hooks); Unauthorized, SwappingDisabled and HookNotAllowed are PermissionedHooks
 * and PermissionedV4Router; ExecutionFailed and TransactionDeadlinePassed are the Universal Router;
 * NotEligible is the FundToken's transfer gate; UnexpectedRevertBytes is the V4Quoter's wrapper.
 */
export const revertAbi = [
  { type: 'error', name: 'WrappedError', inputs: [{ type: 'address', name: 'target' }, { type: 'bytes4', name: 'selector' }, { type: 'bytes', name: 'reason' }, { type: 'bytes', name: 'details' }] },
  { type: 'error', name: 'HookCallFailed', inputs: [] },
  { type: 'error', name: 'Unauthorized', inputs: [] },
  { type: 'error', name: 'SwappingDisabled', inputs: [] },
  { type: 'error', name: 'HookNotAllowed', inputs: [] },
  { type: 'error', name: 'ExecutionFailed', inputs: [{ type: 'uint256', name: 'commandIndex' }, { type: 'bytes', name: 'message' }] },
  { type: 'error', name: 'TransactionDeadlinePassed', inputs: [] },
  { type: 'error', name: 'NotEligible', inputs: [{ type: 'address', name: 'subject' }] },
  { type: 'error', name: 'UnexpectedRevertBytes', inputs: [{ type: 'bytes', name: 'revertData' }] },
  { type: 'error', name: 'V4TooLittleReceived', inputs: [{ type: 'uint256', name: 'minAmountOutReceived' }, { type: 'uint256', name: 'amountReceived' }] },
  { type: 'error', name: 'DeadlinePassed', inputs: [{ type: 'uint256', name: 'deadline' }] },
] as const
