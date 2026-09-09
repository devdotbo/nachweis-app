/** The chain the wallet must be on and its RPC, shared by both provider trees (WalletProvider, PrivyWalletProvider). */
import { defineChain, type Chain } from 'viem'
import { sepolia } from 'wagmi/chains'
import { CHAIN_ID, RPC_URL } from '../config'

export const LOCAL_RPC = 'http://127.0.0.1:8545'

/** Sepolia when VITE_CHAIN_ID is 11155111 (or unset); any other id is a local chain (anvil) at VITE_RPC_URL. */
export const chain: Chain =
  CHAIN_ID === sepolia.id
    ? sepolia
    : defineChain({
        id: CHAIN_ID,
        name: CHAIN_ID === 31337 ? 'Anvil' : `Chain ${CHAIN_ID}`,
        rpcUrls: { default: { http: [RPC_URL ?? LOCAL_RPC] } },
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      })

export const rpcUrl = RPC_URL ?? (chain === sepolia ? sepolia.rpcUrls.default.http[0] : LOCAL_RPC)

/** Transport URL for wagmi: undefined lets viem use Sepolia's public endpoint. */
export const transportUrl: string | undefined = RPC_URL ?? (chain === sepolia ? undefined : LOCAL_RPC)
