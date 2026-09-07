import { useState } from 'react'
import type { Address } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
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
    connecting: false,
  }
}

function useChainWallet(): Wallet {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
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
    connecting: isPending,
    error: error?.message,
  }
}

export const useWallet: (role: Role) => Wallet = MOCK ? useMockWallet : (_role) => useChainWallet()
