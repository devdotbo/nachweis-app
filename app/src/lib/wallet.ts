import { useState } from 'react'
import { bytesToHex, type Address, type Hex } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { MOCK } from '../config'
import { MOCK_INVESTOR, MOCK_OPERATOR } from './mockChain'
import type { Role } from './role'

export interface Wallet {
  address?: Address
  isConnected: boolean
  wrongChain: boolean
  connect: () => void
  disconnect: () => void
  switchToSepolia: () => void
  /** EIP-191 personal_sign. */
  signMessage: (message: string) => Promise<Hex>
  connecting: boolean
  error?: string
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
    switchToSepolia: () => {},
    signMessage: async () => {
      await new Promise((r) => setTimeout(r, 600))
      return bytesToHex(crypto.getRandomValues(new Uint8Array(65)))
    },
    connecting: false,
  }
}

function useChainWallet(): Wallet {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()
  const injectedConnector = connectors[0]
  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== sepolia.id,
    connect: () => {
      if (injectedConnector) connect({ connector: injectedConnector, chainId: sepolia.id })
    },
    disconnect: () => disconnect(),
    switchToSepolia: () => switchChain({ chainId: sepolia.id }),
    signMessage: (message) => signMessageAsync({ message }),
    connecting: isPending,
    error: error?.message,
  }
}

export const useWallet: (role: Role) => Wallet = MOCK ? useMockWallet : (_role) => useChainWallet()
