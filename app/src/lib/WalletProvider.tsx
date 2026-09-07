/**
 * Wallet wiring. Today: wagmi with the injected connector on the chain from
 * VITE_CHAIN_ID (default Sepolia; 31337 gives a plain anvil at VITE_RPC_URL).
 * A Privy provider (PrivyProvider + WagmiProvider from @privy-io/wagmi) would
 * replace the body of this component; the rest of the app only uses wagmi hooks
 * and `useWallet()` from ./wallet.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { defineChain, type Chain } from 'viem'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { CHAIN_ID, RPC_URL } from '../config'

const LOCAL_RPC = 'http://127.0.0.1:8545'

/** Sepolia when VITE_CHAIN_ID is 11155111 (or unset); any other id is a local chain (anvil) at VITE_RPC_URL. */
export const chain: Chain =
  CHAIN_ID === sepolia.id
    ? sepolia
    : defineChain({
        id: CHAIN_ID,
        name: CHAIN_ID === 31337 ? 'Anvil' : `Chain ${CHAIN_ID}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL ?? LOCAL_RPC] } },
      })

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(RPC_URL ?? (chain === sepolia ? undefined : LOCAL_RPC)) },
})

const queryClient = new QueryClient()

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
