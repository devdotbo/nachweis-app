/**
 * Wallet wiring. Today: wagmi with the injected connector on Sepolia.
 * A Privy provider (PrivyProvider + WagmiProvider from @privy-io/wagmi) would
 * replace the body of this component; the rest of the app only uses wagmi hooks
 * and `useWallet()` from ./wallet.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { RPC_URL } from '../config'

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(RPC_URL) },
})

const queryClient = new QueryClient()

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
