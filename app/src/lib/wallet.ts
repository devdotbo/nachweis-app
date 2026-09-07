import { useEffect, useState } from 'react'
import { bytesToHex, type Address, type Hex } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
import { MOCK } from '../config'
import { DEV_SIGNER_TYPE, devSignerId } from './devSigner'
import { chain } from './WalletProvider'
import { MOCK_INVESTOR, MOCK_OPERATOR } from './mockChain'
import type { Role } from './role'

export interface Wallet {
  address?: Address
  isConnected: boolean
  wrongChain: boolean
  connect: () => void
  disconnect: () => void
  /** Switches the wallet to the configured chain (VITE_CHAIN_ID). */
  switchToChain: () => void
  chainName: string
  /** EIP-191 personal_sign. */
  signMessage: (message: string) => Promise<Hex>
  connecting: boolean
  error?: string
  /** True while the connection is a dev signer (local testing only). */
  devSigner: boolean
}

const mockConnected: Record<Role, boolean> = { investor: false, issuer: false }
const mockListeners = new Set<() => void>()

function useMockWallet(role: Role): Wallet {
  const [, force] = useState(0)
  const address = role === 'investor' ? MOCK_INVESTOR : MOCK_OPERATOR
  const setConnected = (v: boolean) => {
    mockConnected[role] = v
    force((n) => n + 1)
    for (const l of mockListeners) l()
  }
  return {
    address: mockConnected[role] ? address : undefined,
    isConnected: mockConnected[role],
    wrongChain: false,
    connect: () => setConnected(true),
    disconnect: () => setConnected(false),
    switchToChain: () => {},
    chainName: 'mock',
    devSigner: false,
    signMessage: async () => {
      await new Promise((r) => setTimeout(r, 600))
      return bytesToHex(crypto.getRandomValues(new Uint8Array(65)))
    },
    connecting: false,
  }
}

function useChainWallet(role: Role): Wallet {
  const { address, isConnected, connector: current } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()
  // Dev signer for this role when configured (investor key, operator key), else the injected wallet.
  const devForRole = connectors.find((c) => c.id === devSignerId(role))
  const anyDev = connectors.find((c) => c.type === DEV_SIGNER_TYPE)
  const wanted = devForRole ?? (current?.type === DEV_SIGNER_TYPE ? anyDev : undefined) ?? connectors.find((c) => c.type !== DEV_SIGNER_TYPE) ?? connectors[0]
  // Role switch with a dev signer per role: follow the role, like changing the account in an extension.
  useEffect(() => {
    if (isConnected && current?.type === DEV_SIGNER_TYPE && devForRole && current.id !== devForRole.id) connect({ connector: devForRole, chainId: chain.id })
  }, [isConnected, current, devForRole, connect])
  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== chain.id,
    connect: () => {
      if (wanted) connect({ connector: wanted, chainId: chain.id })
    },
    disconnect: () => disconnect(),
    switchToChain: () => switchChain({ chainId: chain.id }),
    chainName: chain.name,
    signMessage: (message) => signMessageAsync({ message }),
    connecting: isPending,
    error: error?.message,
    devSigner: isConnected && current?.type === DEV_SIGNER_TYPE,
  }
}

export const useWallet: (role: Role) => Wallet = MOCK ? useMockWallet : useChainWallet
