/**
 * The tick: for every investor with a policy and a delegated wallet, send `subscribe()` from that
 * wallet. The scheduler is the caller (POST /tick, "simulated by the Run the month button").
 */
import type { Address, Hex, PublicClient } from 'viem'
import { chainAllowsSubscribe, readEligible, shortError, SUBSCRIBE_DATA } from './chain'
import type { Config } from './config'
import { PolicyDenied, type Signer } from './signer'
import type { Store } from './store'

export type TickOutcome = 'ok' | 'denied-policy' | 'denied-chain' | 'no-delegated-wallet' | 'no-policy' | 'error'

export interface TickResult {
  address: Address
  outcome: TickOutcome
  hash?: Hex
  detail: string
  /** The chain's answer after a policy refusal: would subscribe() go through, and does isEligible read true. */
  chain?: { allows: boolean; eligible: boolean; reason?: string }
}

export interface TickOptions {
  /** Debug: send the same calldata to the fund token instead of the Subscription contract (refused by policy). */
  target?: 'subscription' | 'fundToken'
  /** Only this investor. */
  address?: Address
}

export async function runTick(cfg: Config, client: PublicClient, store: Store, signer: Signer, opts: TickOptions = {}): Promise<TickResult[]> {
  const to = opts.target === 'fundToken' ? cfg.fundToken : cfg.subscription
  if (!to) throw new Error('target fundToken needs FUND_TOKEN in the environment')
  const investors = [...store.policies.values()].filter((p) => !opts.address || p.address.toLowerCase() === opts.address.toLowerCase())
  const results: TickResult[] = []
  const targetNote = opts.target === 'fundToken' ? ' (debug target: fund token)' : ''
  store.add('tick', `TICK START ${investors.length} investor(s)${targetNote}${cfg.signer === 'local' ? ', simulated Privy policy (local)' : ''}`)
  for (const p of investors) {
    const address = p.address
    const wallet = await signer.delegated(address).catch((e) => {
      store.add('error', `TICK ERROR ${address}: wallet lookup failed: ${shortError(e)}`, { address })
      return undefined
    })
    if (!wallet) {
      results.push({ address, outcome: 'no-delegated-wallet', detail: 'no delegated wallet: the signer is not on this wallet (not allowed yet, or removed by the investor)' })
      store.add('tick', `TICK SKIP ${address}: no delegated wallet`, { address })
      continue
    }
    try {
      const hash = await signer.send(wallet, { to, data: SUBSCRIBE_DATA }, p.rules)
      store.add('tick', `TICK SENT ${address} ${hash}`, { address, hash })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        results.push({ address, outcome: 'ok', hash, detail: `subscribe() mined in block ${receipt.blockNumber}, gas ${receipt.gasUsed}` })
        store.add('tick', `TICK OK ${address} ${hash} block ${receipt.blockNumber}`, { address, hash })
      } else {
        results.push({ address, outcome: 'denied-chain', hash, detail: `subscribe() reverted on chain (block ${receipt.blockNumber})` })
        store.add('tick', `TICK DENIED chain ${address} ${hash} reverted`, { address, hash })
      }
    } catch (e) {
      if (e instanceof PolicyDenied) {
        store.add('tick', `TICK DENIED policy ${address}: ${e.message}`, { address })
        const chain = await chainAllowsSubscribe(client, address, cfg.subscription)
        const eligible = await readEligible(client, cfg, address).catch(() => false)
        if (!chain.ok) store.add('tick', `TICK DENIED chain ${address}: ${chain.reason} (isEligible ${eligible})`, { address })
        else store.add('tick', `TICK NOTE chain ${address}: the chain would allow subscribe() right now (isEligible ${eligible})`, { address })
        results.push({ address, outcome: 'denied-policy', detail: e.message, chain: { allows: chain.ok, eligible, reason: chain.reason } })
      } else {
        results.push({ address, outcome: 'error', detail: shortError(e) })
        store.add('error', `TICK ERROR ${address}: ${shortError(e)}`, { address })
      }
    }
  }
  store.add('tick', `TICK END ${results.map((r) => r.outcome).join(', ') || 'nothing to do'}`)
  return results
}
