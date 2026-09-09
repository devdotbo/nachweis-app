/**
 * The provider tree with Privy (VITE_PRIVY_APP_ID set): PrivyProvider (email login, embedded wallet
 * created for users without one), then QueryClientProvider, then WagmiProvider from @privy-io/wagmi,
 * whose `createConfig` keeps no connector of ours and syncs Privy's wallets (the embedded wallet and
 * wallets connected through Privy's picker) into wagmi (FACT, @privy-io/wagmi 4.0.17
 * dist/esm/createConfig.mjs and useSyncPrivyWallets.mjs, read 2026-09-09). So while the app id is
 * set, the dev signer and the plain injected connector are not available; the operator connects
 * through Privy's wallet picker. wagmi's useDisconnect is not supported with Privy; disconnect is
 * Privy's logout().
 *
 * The inner Bridge publishes the few Privy calls the app needs (src/lib/privyContext.ts). The
 * bridge's EIP-191 session signature is unchanged: wagmi's signMessage reaches the embedded wallet
 * through the synced connector.
 */
import { PrivyProvider, usePrivy, useSigners, useWallets, type User } from '@privy-io/react-auth'
import { WagmiProvider, createConfig, useSetActiveWallet } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import type { Address } from 'viem'
import { http } from 'wagmi'
import { chain, transportUrl } from './chainConfig'
import { PrivyBridgeContext, type PrivyBridge } from './privyContext'

const wagmiConfig = createConfig({
  chains: [chain],
  transports: { [chain.id]: http(transportUrl) },
})

const queryClient = new QueryClient()

function delegatedOf(user: User | null): boolean {
  return Boolean(user?.linkedAccounts.some((a) => a.type === 'wallet' && a.walletClientType === 'privy' && (a as { delegated?: boolean }).delegated))
}

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, connectWallet } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { addSigners, removeSigners } = useSigners()
  const { setActiveWallet } = useSetActiveWallet()
  const embedded = wallets.find((w) => w.walletClientType === 'privy')
  const external = wallets.find((w) => w.walletClientType !== 'privy')

  const activate = useCallback(
    async (which: 'embedded' | 'external') => {
      const w = which === 'embedded' ? embedded : external
      if (w) await setActiveWallet(w)
    },
    [embedded, external, setActiveWallet],
  )
  const addSigner = useCallback(
    async (address: Address, signerId: string, policyId: string) => {
      const r = await addSigners({ address, signers: [{ signerId, policyIds: [policyId] }] })
      return delegatedOf(r.user)
    },
    [addSigners],
  )
  const removeAll = useCallback(
    async (address: Address) => {
      await removeSigners({ address })
    },
    [removeSigners],
  )
  const value = useMemo<PrivyBridge>(
    () => ({
      ready: ready && walletsReady,
      authenticated,
      embeddedAddress: embedded?.address as Address | undefined,
      externalAddress: external?.address as Address | undefined,
      delegated: delegatedOf(user),
      login: () => login(),
      connectWallet: () => connectWallet(),
      logout,
      activate,
      addSigner,
      removeSigners: removeAll,
    }),
    [ready, walletsReady, authenticated, embedded, external, user, login, connectWallet, logout, activate, addSigner, removeAll],
  )
  return <PrivyBridgeContext.Provider value={value}>{children}</PrivyBridgeContext.Provider>
}

export function PrivyWalletProvider({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        supportedChains: [chain],
        defaultChain: chain,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <Bridge>{children}</Bridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
