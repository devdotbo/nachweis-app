/**
 * The registry operator wallet behind one interface. LocalOperator plays the key quorum and the
 * policy in memory (simulated) before signing with a dev key; PrivyOperator sends through Privy,
 * whose TEE enforces both and answers with an API error when it refuses.
 */
import { APIError } from '@privy-io/node'
import { BaseError, createWalletClient, decodeErrorResult, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { registryAbi } from './abi'
import { chainFor, decodeFunctionName, shortError } from './chain'
import type { Config } from './config'
import { evaluate, registryOperatorRules, type PolicyRule } from './policy'
import { keysFor, privyClient } from './privy'
import type { DeskMode, Role } from './types'

export type RefusedBy = 'privy-policy' | 'privy-quorum' | 'privy-precheck' | 'simulated-policy' | 'simulated-quorum'

export class Refused extends Error {
  constructor(
    public readonly by: RefusedBy,
    message: string,
  ) {
    super(message)
    this.name = 'Refused'
  }
}

/** The chain refused the call before broadcast (gas estimation reverted); the registry's error name is decoded when it is one of its own. */
export class Reverted extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Reverted'
  }
}

/** viem wraps the RPC's revert data several errors deep; this finds it and names the registry error. */
export function toReverted(e: unknown): unknown {
  if (!(e instanceof BaseError)) return e
  const withData = e.walk((x) => typeof (x as { data?: unknown }).data === 'string' && /^0x[0-9a-fA-F]{8,}$/.test((x as { data: string }).data)) as { data?: Hex } | null
  const raw = withData?.data
  if (!raw) return /revert/i.test(e.shortMessage) ? new Reverted(`reverted before broadcast: ${shortError(e)}`) : e
  try {
    const d = decodeErrorResult({ abi: registryAbi, data: raw })
    return new Reverted(`reverted before broadcast: ${d.errorName}(${(d.args ?? []).map(String).join(', ')})`)
  } catch {
    return new Reverted(`reverted before broadcast: ${raw}`)
  }
}

export interface Tx {
  to: Address
  data: Hex
  value?: bigint
}

export interface Operator {
  mode: DeskMode
  address: Address
  walletId?: string
  send(tx: Tx, signers: Role[]): Promise<Hex>
  /** personal_sign: the policy has no rule for it, so it is refused without touching a chain. */
  signMessage(message: string, signers: Role[]): Promise<Hex>
}

export const QUORUM_THRESHOLD = 2

export class LocalOperator implements Operator {
  readonly mode = 'local' as const
  readonly address: Address
  private readonly rules: PolicyRule[]
  private readonly account
  constructor(private readonly cfg: Config) {
    if (!cfg.local) throw new Error('LocalOperator needs local config')
    this.account = privateKeyToAccount(cfg.local.operatorKey)
    this.address = this.account.address
    this.rules = registryOperatorRules(cfg.registry, [cfg.chainId])
  }

  async send(tx: Tx, signers: Role[]): Promise<Hex> {
    // Simulated policy: the same rule JSON Privy would enforce, evaluated here.
    const verdict = evaluate(this.rules, {
      method: 'eth_sendTransaction',
      to: tx.to,
      chainId: this.cfg.chainId,
      functionName: decodeFunctionName(tx.data),
      value: tx.value,
    })
    if (!verdict.allowed) throw new Refused('simulated-policy', `simulated policy (local): ${verdict.reason}`)
    // Simulated key quorum: two distinct roles must sign.
    const distinct = new Set(signers)
    if (distinct.size < QUORUM_THRESHOLD) {
      throw new Refused('simulated-quorum', `simulated key quorum (local): ${distinct.size} of ${QUORUM_THRESHOLD} signatures`)
    }
    const wallet = createWalletClient({
      account: this.account,
      chain: chainFor(this.cfg.chainId, this.cfg.rpcUrl),
      transport: http(this.cfg.rpcUrl),
    })
    try {
      return await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
    } catch (e) {
      throw toReverted(e)
    }
  }

  async signMessage(message: string, signers: Role[]): Promise<Hex> {
    const verdict = evaluate(this.rules, { method: 'personal_sign', chainId: this.cfg.chainId })
    if (!verdict.allowed) throw new Refused('simulated-policy', `simulated policy (local): ${verdict.reason}`)
    if (new Set(signers).size < QUORUM_THRESHOLD) throw new Refused('simulated-quorum', `simulated key quorum (local): ${new Set(signers).size} of ${QUORUM_THRESHOLD} signatures`)
    return this.account.signMessage({ message })
  }
}

export class PrivyOperator implements Operator {
  readonly mode = 'privy' as const
  readonly address: Address
  readonly walletId: string
  constructor(private readonly cfg: Config) {
    if (!cfg.privy) throw new Error('PrivyOperator needs privy config')
    this.address = cfg.privy.operatorAddress
    this.walletId = cfg.privy.walletId
  }

  async send(tx: Tx, signers: Role[]): Promise<Hex> {
    // No local evaluation: Privy's TEE checks the key quorum and the policy.
    try {
      const r = await privyClient(this.cfg).wallets().ethereum().sendTransaction(this.walletId, {
        caip2: `eip155:${this.cfg.chainId}`,
        params: {
          transaction: {
            to: tx.to,
            data: tx.data,
            ...(tx.value !== undefined ? { value: `0x${tx.value.toString(16)}` } : {}),
            chain_id: this.cfg.chainId,
          },
        },
        authorization_context: { authorization_private_keys: keysFor(this.cfg, signers) },
      })
      return r.hash as Hex
    } catch (e) {
      throw toRefused(e)
    }
  }

  async signMessage(message: string, signers: Role[]): Promise<Hex> {
    try {
      const r = await privyClient(this.cfg).wallets().ethereum().signMessage(this.walletId, {
        message,
        authorization_context: { authorization_private_keys: keysFor(this.cfg, signers) },
      })
      return r.signature as Hex
    } catch (e) {
      throw toRefused(e)
    }
  }
}

/** Privy's error body as observed 2026-09-09: `{"error": "...", "code": "policy_violation" | "invalid_data" | "transaction_broadcast_failure" | ...}`. */
export function parsePrivyError(message: string): { error: string; code?: string } {
  const m = message.match(/\{.*\}/s)
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { error?: unknown; code?: unknown }
      if (typeof j.error === 'string') return { error: j.error, code: typeof j.code === 'string' ? j.code : undefined }
    } catch {
      // not JSON: fall through
    }
  }
  return { error: message.replace(/^\d+\s*/, '') }
}

/**
 * A 4xx Privy API error becomes Refused with Privy's wording verbatim. Observed on 2026-09-09 (probe-privy.ts):
 * policy refusal `400 policy_violation "RPC request denied due to policy violation"`; quorum refusal
 * `401 invalid_data "Number of signatures in privy-authorization-signature header does not match the wallet's
 * authorization threshold."`; and, for a wallet without gas, `400 transaction_broadcast_failure "insufficient funds"`,
 * which Privy answers before the policy is consulted: that one is `privy-precheck`, not a verdict on the policy.
 */
export function toRefused(e: unknown): unknown {
  if (e instanceof APIError && typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
    const { error, code } = parsePrivyError(e.message)
    const text = `${e.status}${code ? ` ${code}` : ''}: ${error}`
    const by: RefusedBy = code === 'policy_violation' ? 'privy-policy' : /authorization threshold|signature/i.test(error) ? 'privy-quorum' : 'privy-precheck'
    return new Refused(by, text)
  }
  return e
}

export function makeOperator(cfg: Config): Operator {
  return cfg.mode === 'privy' ? new PrivyOperator(cfg) : new LocalOperator(cfg)
}
