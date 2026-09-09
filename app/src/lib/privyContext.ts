/**
 * What the rest of the app may ask Privy for, without importing Privy. The context is provided by
 * src/lib/PrivyWalletProvider.tsx (only when VITE_PRIVY_APP_ID is set) and read by the wallet layer
 * (src/lib/wallet.ts) and the standing-order card. Null means: no Privy in this build.
 */
import { createContext, useContext } from 'react'
import type { Address } from 'viem'

export interface PrivyBridge {
  /** Privy's SDK and wallet list are ready. */
  ready: boolean
  authenticated: boolean
  /** The embedded wallet created at email sign-in, when the user has one. */
  embeddedAddress?: Address
  /** An external wallet connected through Privy's wallet picker (the operator's extension), when there is one. */
  externalAddress?: Address
  /** True when the user's embedded wallet carries a signer (Privy's `delegated` flag on the linked account). */
  delegated: boolean
  /** Opens Privy's login modal (email). */
  login: () => void
  /** Opens Privy's wallet picker for an external wallet. */
  connectWallet: () => void
  /** Logs out of Privy; wagmi follows. */
  logout: () => Promise<void>
  /** Makes the embedded or the external wallet wagmi's active account. */
  activate: (which: 'embedded' | 'external') => Promise<void>
  /** `useSigners().addSigners` with one signer and its override policy; resolves to the wallet's delegated flag afterwards. */
  addSigner: (address: Address, signerId: string, policyId: string) => Promise<boolean>
  /** `useSigners().removeSigners`: only the user can transact on the wallet afterwards. */
  removeSigners: (address: Address) => Promise<void>
}

export const PrivyBridgeContext = createContext<PrivyBridge | null>(null)

export function usePrivyBridge(): PrivyBridge | null {
  return useContext(PrivyBridgeContext)
}
