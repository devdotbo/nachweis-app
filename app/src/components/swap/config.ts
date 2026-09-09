/**
 * The Uniswap v4 permissioned pool the Swap door trades in. Two addresses configure it (the
 * PermissionsAdapter that wraps the FundToken and the demo stable); fee and tick spacing default to
 * the values CreatePermissionedPool.s.sol uses. Uniswap's own contracts are the Sepolia deployment
 * (contracts/src/uniswap/UniswapSepolia.sol), which an anvil fork of Sepolia carries at the same
 * addresses (scripts/pool-local.sh).
 */
import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem'

const env = import.meta.env

function addressOr(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined
}

/** Uniswap permissioned-pool contracts on Sepolia (chain id 11155111), verified 2026-09-07; see UniswapSepolia.sol. */
export const UNISWAP_SEPOLIA = {
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
  permissionsAdapterFactory: '0xE6B0d96919334C33d06266d1420F97f6f434fA2B',
  permissionedPositionManager: '0xf99D553912084c99F6299291b75Fe9B7119Aa1A7',
  permissionedHooks: '0x51247E2291d290d17C08813A175AC86465EdE8c0',
  universalRouter: '0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7',
  v4Quoter: '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  stateView: '0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C',
} as const satisfies Record<string, Address>

/** v4-core PoolKey (Currency and IHooks are address-sized, so the ABI encoding is the same). */
export interface PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

type UniswapAddresses = typeof UNISWAP_SEPOLIA

export interface PoolConfig extends UniswapAddresses {
  adapter: Address
  stable: Address
  key: PoolKey
  /** keccak256(abi.encode(key)), the v4-core PoolId. */
  poolId: Hex
  /** True when the stable is currency0: a stable-in swap is then zeroForOne. */
  stableIsCurrency0: boolean
}

export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address', name: 'currency0' },
        { type: 'address', name: 'currency1' },
        { type: 'uint24', name: 'fee' },
        { type: 'int24', name: 'tickSpacing' },
        { type: 'address', name: 'hooks' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  )
}

function build(): PoolConfig | undefined {
  const adapter = addressOr(env.VITE_POOL_ADAPTER)
  const stable = addressOr(env.VITE_POOL_STABLE)
  if (!adapter || !stable) return undefined
  const fee = env.VITE_POOL_FEE && /^\d+$/.test(env.VITE_POOL_FEE) ? Number(env.VITE_POOL_FEE) : 3000
  const tickSpacing = env.VITE_POOL_TICK_SPACING && /^\d+$/.test(env.VITE_POOL_TICK_SPACING) ? Number(env.VITE_POOL_TICK_SPACING) : 60
  const stableIsCurrency0 = BigInt(stable) < BigInt(adapter)
  const key: PoolKey = {
    currency0: stableIsCurrency0 ? stable : adapter,
    currency1: stableIsCurrency0 ? adapter : stable,
    fee,
    tickSpacing,
    hooks: UNISWAP_SEPOLIA.permissionedHooks,
  }
  return { ...UNISWAP_SEPOLIA, adapter, stable, key, poolId: poolIdOf(key), stableIsCurrency0 }
}

/** Undefined until VITE_POOL_ADAPTER and VITE_POOL_STABLE are set; the door then stays a placeholder. */
export const POOL_CONFIG: PoolConfig | undefined = build()

/** The fixed demo input: 100 units of the 6-decimal demo stable, the amount SwapPermissioned.s.sol sends. */
export const SWAP_AMOUNT_IN = 100_000_000n

/** Permit2 allowance and router deadline horizon, seconds. */
export const SWAP_DEADLINE_SECONDS = 3600
