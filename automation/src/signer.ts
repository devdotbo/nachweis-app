/**
 * Who signs the tick. privy: the delegated signer on the investor's embedded wallet, Privy enforces the
 * policy before anything is broadcast. local: a dev key on anvil, the evaluator in policy.ts plays the
 * policy ("simulated Privy policy (local)"), and `system.current_unix_timestamp` is anvil's block time
 * so `evm_increaseTime` moves the clock the rule reads.
 */
import { APIError } from '@privy-io/node'
import { createWalletClient, decodeFunctionData, getAddress, http, type Address, type Hex, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainOf, shortError, subscriptionAbi } from './chain'
import type { Config } from './config'
import { evaluate, type PolicyRule } from './policy'
import { authorizationContext, privyClient } from './privy'

export class PolicyDenied extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'PolicyDenied'
  }
}

export interface DelegatedWallet {
  address: Address
  /** Privy wallet id (privy mode). */
  walletId?: string
}

export interface TxRequest {
  to: Address
  data: Hex
}

export interface Signer {
  readonly mode: 'privy' | 'local'
  /** The wallet the automation may sign for at this address, or undefined ("no delegated wallet"). */
  delegated(address: Address): Promise<DelegatedWallet | undefined>
  /** Signs and broadcasts; throws PolicyDenied when the policy refuses before broadcast. Returns the hash. */
  send(wallet: DelegatedWallet, tx: TxRequest, rules: PolicyRule[]): Promise<Hex>
}

class LocalSigner implements Signer {
  readonly mode = 'local' as const
  private accounts = new Map<string, ReturnType<typeof privateKeyToAccount>>()
  constructor(
    private cfg: Config,
    private client: PublicClient,
  ) {
    for (const k of cfg.localKeys) {
      const a = privateKeyToAccount(k)
      this.accounts.set(a.address.toLowerCase(), a)
    }
  }
  async delegated(address: Address) {
    return this.accounts.has(address.toLowerCase()) ? { address: getAddress(address) } : undefined
  }
  async send(wallet: DelegatedWallet, tx: TxRequest, rules: PolicyRule[]) {
    const account = this.accounts.get(wallet.address.toLowerCase())
    if (!account) throw new Error(`no local key for ${wallet.address}`)
    let functionName: string | undefined
    try {
      functionName = decodeFunctionData({ abi: subscriptionAbi, data: tx.data }).functionName
    } catch {
      functionName = undefined
    }
    const block = await this.client.getBlock()
    const verdict = evaluate(rules, { method: 'eth_sendTransaction', to: tx.to, chainId: this.cfg.chainId, functionName, now: block.timestamp })
    if (!verdict.allowed) throw new PolicyDenied(`simulated Privy policy (local): ${verdict.reason}`)
    const wc = createWalletClient({ account, chain: chainOf(this.cfg), transport: http(this.cfg.rpcUrl) })
    return wc.sendTransaction({ to: tx.to, data: tx.data })
  }
}

class PrivySigner implements Signer {
  readonly mode = 'privy' as const
  constructor(private cfg: Config) {}
  async delegated(address: Address) {
    const signerId = this.cfg.privy!.signerId
    const page = privyClient(this.cfg).wallets().list({ address: getAddress(address), chain_type: 'ethereum' })
    for await (const w of page) {
      if (w.address.toLowerCase() !== address.toLowerCase()) continue
      if ((w.additional_signers ?? []).some((s) => s.signer_id === signerId)) return { address: getAddress(w.address), walletId: w.id }
    }
    return undefined
  }
  async send(wallet: DelegatedWallet, tx: TxRequest) {
    if (!wallet.walletId) throw new Error('privy wallet id missing')
    try {
      const r = await privyClient(this.cfg)
        .wallets()
        .ethereum()
        .sendTransaction(wallet.walletId, {
          caip2: `eip155:${this.cfg.chainId}`,
          params: { transaction: { to: tx.to, data: tx.data, chain_id: this.cfg.chainId } },
          authorization_context: authorizationContext(this.cfg),
        })
      return r.hash as Hex
    } catch (e) {
      // A policy refusal comes back as an API error before anything is broadcast. Exact status and
      // wording unverified until the first Sepolia run; both are logged verbatim (docs, evidence template).
      if (e instanceof APIError && typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
        throw new PolicyDenied(`Privy refused (${e.status}): ${shortError(e).replace(/^\d+: /, '')}`, e.status)
      }
      throw e
    }
  }
}

export function makeSigner(cfg: Config, client: PublicClient): Signer {
  return cfg.signer === 'privy' ? new PrivySigner(cfg) : new LocalSigner(cfg, client)
}
