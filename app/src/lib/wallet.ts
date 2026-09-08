import { useEffect, useState } from 'react'
import { bytesToHex, type Address, type Hex } from 'viem'
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi'
import { MOCK } from '../config'
import { DEV_SIGNER_TYPE, devSignerId } from './devSigner'
import { chain } from './WalletProvider'
import { MOCK_INVESTOR, MOCK_OPERATOR } from './mockChain'
import type { Role } from './role'

/** How a connection is made. `dev` and `mock` exist for local testing only. */
export type WalletKind = 'injected' | 'dev' | 'mock'

/**
 * One way to connect, shown as a button on the connect step. A Privy option (embedded wallet,
 * email or social login) would be one more entry in `Wallet.options`; the connect step renders
 * whatever the wallet layer offers.
 */
export interface WalletOption {
  id: string
  kind: WalletKind
  /** Button text, e.g. "Connect dev signer", "Connect MetaMask". */
  label: string
  /** One sentence under the button: what this option is and where the key lives. */
  hint: string
  connect: () => void
}

export interface Wallet {
  address?: Address
  isConnected: boolean
  wrongChain: boolean
  /** Connects with the preferred option (the first of `options`). */
  connect: () => void
  disconnect: () => void
  /** Switches the wallet to the configured chain (VITE_CHAIN_ID). */
  switchToChain: () => void
  chainId: number
  chainName: string
  /** EIP-191 personal_sign. */
  signMessage: (message: string) => Promise<Hex>
  connecting: boolean
  error?: string
  /** True while the connection is a dev signer (local testing only). */
  devSigner: boolean
  /** Kind of the active connection, undefined while disconnected. */
  kind?: WalletKind
  /** Name of the active connector ("MetaMask", "dev signer (investor)", "mock"). */
  connectorName?: string
  /** Ways to connect, preferred first. */
  options: WalletOption[]
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
  const connect = () => setConnected(true)
  return {
    address: mockConnected[role] ? address : undefined,
    isConnected: mockConnected[role],
    wrongChain: false,
    connect,
    disconnect: () => setConnected(false),
    switchToChain: () => {},
    chainId: 0,
    chainName: 'mock chain',
    devSigner: false,
    kind: mockConnected[role] ? 'mock' : undefined,
    connectorName: mockConnected[role] ? 'mock wallet' : undefined,
    options: [{ id: 'mock', kind: 'mock', label: 'Connect (mock wallet)', hint: 'In-memory wallet with a fixed address. No key, no network.', connect }],
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
  const injectedConnector = connectors.find((c) => c.type !== DEV_SIGNER_TYPE)
  const wanted = devForRole ?? (current?.type === DEV_SIGNER_TYPE ? anyDev : undefined) ?? injectedConnector ?? connectors[0]
  // Role switch with a dev signer per role: follow the role, like changing the account in an extension.
  useEffect(() => {
    if (isConnected && current?.type === DEV_SIGNER_TYPE && devForRole && current.id !== devForRole.id) connect({ connector: devForRole, chainId: chain.id })
  }, [isConnected, current, devForRole, connect])

  const options: WalletOption[] = []
  if (devForRole) {
    options.push({
      id: devForRole.id,
      kind: 'dev',
      label: 'Connect dev signer',
      hint: `Local testing only: this page holds the ${role === 'issuer' ? 'operator' : 'investor'} key and signs without a prompt.`,
      connect: () => connect({ connector: devForRole, chainId: chain.id }),
    })
  }
  if (injectedConnector) {
    const named = injectedConnector.name && injectedConnector.name !== 'Injected'
    options.push({
      id: injectedConnector.id,
      kind: 'injected',
      label: named ? `Connect ${injectedConnector.name}` : 'Connect injected wallet',
      hint: named ? `${injectedConnector.name} signs the session and every transaction; the key stays in the extension.` : 'A browser extension wallet signs the session and every transaction; the key stays in the extension.',
      connect: () => connect({ connector: injectedConnector, chainId: chain.id }),
    })
  }
  const devActive = isConnected && current?.type === DEV_SIGNER_TYPE
  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== chain.id,
    connect: () => {
      if (wanted) connect({ connector: wanted, chainId: chain.id })
    },
    disconnect: () => disconnect(),
    switchToChain: () => switchChain({ chainId: chain.id }),
    chainId: chain.id,
    chainName: chain.name,
    signMessage: (message) => signMessageAsync({ message }),
    connecting: isPending,
    error: error?.message,
    devSigner: devActive,
    kind: isConnected ? (devActive ? 'dev' : 'injected') : undefined,
    connectorName: isConnected ? current?.name : undefined,
    options,
  }
}

export const useWallet: (role: Role) => Wallet = MOCK ? useMockWallet : useChainWallet
