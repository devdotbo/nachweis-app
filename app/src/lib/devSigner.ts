/**
 * Dev signer: a wagmi connector around a viem local account, for local testing only.
 *
 * Enabled only when VITE_DEV_PRIVATE_KEY (investor) or VITE_DEV_OPERATOR_KEY (issuer) is set.
 * It signs EIP-191 messages and transactions in the page with that key and sends the raw
 * transactions to VITE_RPC_URL (anvil). There is no wallet extension, no prompt, no
 * confirmation: whatever the app asks for is signed. Never point it at a key that holds value.
 *
 * vite.config.ts refuses a production build while a dev key is set, and the guarded
 * `__NACHWEIS_DEV_SIGNER__` constant lets the bundler drop this module when no key is set.
 */
import { createWalletClient, http, type Chain, type EIP1193RequestFn, type Hex, type Transport } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createConnector, type CreateConnectorFn } from 'wagmi'

export type DevRole = 'investor' | 'issuer'

export const DEV_SIGNER_TYPE = 'devSigner'

export interface DevSignerOptions {
  privateKey: Hex
  chain: Chain
  rpcUrl: string
  role: DevRole
}

export function devSignerId(role: DevRole): string {
  return `${DEV_SIGNER_TYPE}:${role}`
}

export function devSigner({ privateKey, chain, rpcUrl, role }: DevSignerOptions): CreateConnectorFn {
  const account = privateKeyToAccount(privateKey)
  const transport: Transport = http(rpcUrl)
  const client = createWalletClient({ account, chain, transport })
  // Minimal EIP-1193 surface for callers that bypass getClient: accounts and chain come from
  // the local account, everything else goes to the RPC.
  const request: EIP1193RequestFn = (async ({ method, params }: { method: string; params?: unknown }) => {
    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return [account.address]
      case 'eth_chainId':
        return `0x${chain.id.toString(16)}`
      case 'personal_sign':
        return account.signMessage({ message: { raw: (params as [Hex, string])[0] } })
      default:
        return client.request({ method, params } as never)
    }
  }) as EIP1193RequestFn
  const provider = { request }

  return createConnector(() => ({
    id: devSignerId(role),
    name: `Dev signer (${role}, local only)`,
    type: DEV_SIGNER_TYPE,
    async connect({ withCapabilities } = {}) {
      const accounts = withCapabilities ? [{ address: account.address, capabilities: {} }] : [account.address]
      return { accounts, chainId: chain.id } as never
    },
    async disconnect() {},
    async getAccounts() {
      return [account.address]
    },
    async getChainId() {
      return chain.id
    },
    async getProvider() {
      return provider
    },
    // wagmi uses this client for signMessage and writeContract: local signing, raw tx to the RPC.
    async getClient() {
      return client
    },
    async isAuthorized() {
      return false
    },
    async switchChain({ chainId }) {
      if (chainId !== chain.id) throw new Error(`dev signer only knows chain ${chain.id}`)
      return chain
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }))
}
