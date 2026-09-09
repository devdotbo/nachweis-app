/**
 * Who signs for the treasury. privy: the Privy server wallet signs (eth_signTransaction) under its policy in
 * Privy's TEE and this service broadcasts the signed transaction; a refusal arrives as an API error before
 * anything is signed. local: LOCAL_TREASURY_KEY on anvil, and the evaluator in policy.ts plays the policy
 * ("simulated Privy policy (local)").
 */
import { APIError } from '@privy-io/node'
import { createWalletClient, getAddress, http, type Address, type Hex, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainOf, shortError } from './chain'
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

export interface TxRequest {
  to: Address
  data: Hex
}

export interface Signer {
  readonly mode: 'privy' | 'local'
  /** The treasury address. */
  address(): Promise<Address>
  /** Privy wallet id (privy mode). */
  readonly walletId?: string
  /**
   * Signs and broadcasts; throws PolicyDenied when the policy refuses before broadcast. Returns the hash.
   * `officers` is the subset of officer keys used for this request (privy mode; both by default).
   */
  send(tx: TxRequest, rules: PolicyRule[], officers?: ('A' | 'B')[]): Promise<Hex>
}

class LocalSigner implements Signer {
  readonly mode = 'local' as const
  private account
  constructor(
    private cfg: Config,
    private client: PublicClient,
  ) {
    if (!cfg.localTreasuryKey) throw new Error('LOCAL_TREASURY_KEY missing')
    this.account = privateKeyToAccount(cfg.localTreasuryKey)
  }
  async address() {
    return this.account.address
  }
  async send(tx: TxRequest, rules: PolicyRule[]) {
    const verdict = evaluate(rules, { method: 'eth_signTransaction', to: tx.to, chainId: this.cfg.chainId, data: tx.data })
    if (!verdict.allowed) throw new PolicyDenied(`simulated Privy policy (local): ${verdict.reason}`)
    const wc = createWalletClient({ account: this.account, chain: chainOf(this.cfg), transport: http(this.cfg.rpcUrl) })
    const hash = await wc.sendTransaction({ to: tx.to, data: tx.data })
    await this.client.waitForTransactionReceipt({ hash })
    return hash
  }
}

class PrivySigner implements Signer {
  readonly mode = 'privy' as const
  readonly walletId: string
  private cached?: Address
  constructor(
    private cfg: Config,
    private client: PublicClient,
  ) {
    this.walletId = cfg.privy!.walletId
  }
  async address() {
    if (!this.cached) {
      const w = await privyClient(this.cfg).wallets().get(this.walletId)
      this.cached = getAddress(w.address)
    }
    return this.cached
  }
  async send(tx: TxRequest, _rules: PolicyRule[], officers: ('A' | 'B')[] = ['A', 'B']) {
    const from = await this.address()
    const [nonce, fees] = await Promise.all([this.client.getTransactionCount({ address: from, blockTag: 'pending' }), this.client.estimateFeesPerGas()])
    let gas: bigint
    try {
      gas = await this.client.estimateGas({ account: from, to: tx.to, data: tx.data })
    } catch (e) {
      // The chain refuses (for example NotEligible): report the revert before asking Privy to sign.
      throw new Error(`the chain refuses this transaction: ${shortError(e)}`)
    }
    let signed: string
    try {
      const r = await privyClient(this.cfg)
        .wallets()
        .ethereum()
        .signTransaction(this.walletId, {
          params: {
            transaction: {
              to: tx.to,
              data: tx.data,
              value: '0x0',
              chain_id: this.cfg.chainId,
              nonce,
              gas_limit: Number((gas * 12n) / 10n),
              max_fee_per_gas: `0x${fees.maxFeePerGas.toString(16)}`,
              max_priority_fee_per_gas: `0x${fees.maxPriorityFeePerGas.toString(16)}`,
              type: 2,
            },
          },
          authorization_context: authorizationContext(this.cfg, officers),
        })
      signed = r.signed_transaction
    } catch (e) {
      // A policy or quorum refusal comes back as an API error before anything is signed. Status and wording
      // are logged verbatim (docs/showcase/payout-desk.md records the ones seen).
      if (e instanceof APIError && typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
        throw new PolicyDenied(`Privy refused (${e.status}): ${shortError(e).replace(/^\d+: /, '')}`, e.status)
      }
      throw e
    }
    const hash = await this.client.sendRawTransaction({ serializedTransaction: signed as Hex })
    await this.client.waitForTransactionReceipt({ hash })
    return hash
  }
}

export function makeSigner(cfg: Config, client: PublicClient): Signer {
  return cfg.signer === 'privy' ? new PrivySigner(cfg, client) : new LocalSigner(cfg, client)
}
