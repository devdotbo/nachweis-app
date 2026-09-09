/**
 * Block explorer links. Only Sepolia has one; on anvil or the mock chain the helpers return
 * undefined and the UI shows the plain hash.
 */
import { sepolia } from 'wagmi/chains'
import { MOCK } from '../config'
import { chain } from './WalletProvider'

const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io'

export const EXPLORER_BASE: string | undefined = !MOCK && chain.id === sepolia.id ? SEPOLIA_EXPLORER : undefined

export function txUrl(hash: string): string | undefined {
  return EXPLORER_BASE ? `${EXPLORER_BASE}/tx/${hash}` : undefined
}

export function addressUrl(address: string): string | undefined {
  return EXPLORER_BASE ? `${EXPLORER_BASE}/address/${address}` : undefined
}
