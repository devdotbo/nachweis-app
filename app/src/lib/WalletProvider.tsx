/**
 * Wallet wiring. Today: wagmi with the injected connector on the chain from
 * VITE_CHAIN_ID (default Sepolia; 31337 gives a plain anvil at VITE_RPC_URL).
 * With VITE_DEV_PRIVATE_KEY / VITE_DEV_OPERATOR_KEY set (local testing only) a dev
 * signer connector per role is added in front of the injected one (src/lib/devSigner.ts).
 * With VITE_PRIVY_APP_ID set, src/lib/PrivyBoundary.tsx swaps the tree below for
 * src/lib/PrivyWalletProvider.tsx (PrivyProvider, then QueryClientProvider, then WagmiProvider
 * from @privy-io/wagmi); unset, the tree below renders unchanged. The rest of the app only uses
 * wagmi hooks and `useWallet()` from ./wallet.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { WagmiProvider, createConfig, http, type CreateConnectorFn } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { DEV_OPERATOR_KEY, DEV_PRIVATE_KEY } from '../config'
import { chain, rpcUrl, transportUrl } from './chainConfig'
import { devSigner } from './devSigner'
import { PrivyBoundary } from './PrivyBoundary'

export { chain } from './chainConfig'

const connectors: CreateConnectorFn[] = []
if (__NACHWEIS_DEV_SIGNER__) {
  if (DEV_PRIVATE_KEY) connectors.push(devSigner({ privateKey: DEV_PRIVATE_KEY, chain, rpcUrl, role: 'investor' }))
  if (DEV_OPERATOR_KEY) connectors.push(devSigner({ privateKey: DEV_OPERATOR_KEY, chain, rpcUrl, role: 'issuer' }))
}
connectors.push(injected())

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(transportUrl) },
})

const queryClient = new QueryClient()

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyBoundary
      plain={
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
      }
    >
      {children}
    </PrivyBoundary>
  )
}
