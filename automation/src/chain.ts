/** Chain reads for the automation: the registry's decision, eligibility and events; the subscribe calldata. */
import { createPublicClient, defineChain, encodeFunctionData, http, parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import type { Config } from './config'

export const registryAbi = parseAbi([
  'struct Decision { bytes32 policyId; uint256 bits; uint8 tier; uint64 expiry; bytes32 statusRef; bool revoked; }',
  'function decisionOf(address subject, bytes32 policyId) view returns (Decision)',
  'function isEligible(address subject, bytes32 policyId, uint256 requiredBits) view returns (bool)',
  'event Approved(address indexed subject, bytes32 indexed policyId, address indexed operator)',
  'event Revoked(address indexed subject, bytes32 indexed policyId, address indexed operator)',
])

export const subscriptionAbi = parseAbi(['function subscribe()'])

/** `subscribe()` selector, the calldata every tick sends. */
export const SUBSCRIBE_DATA: Hex = encodeFunctionData({ abi: subscriptionAbi, functionName: 'subscribe' })

export interface Decision {
  policyId: Hex
  bits: bigint
  tier: number
  expiry: bigint
  statusRef: Hex
  revoked: boolean
}

export function chainOf(cfg: Config) {
  return cfg.chainId === sepolia.id
    ? { ...sepolia, rpcUrls: { default: { http: [cfg.rpcUrl] } } }
    : defineChain({ id: cfg.chainId, name: cfg.chainId === 31337 ? 'Anvil' : `Chain ${cfg.chainId}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [cfg.rpcUrl] } } })
}

export function publicClient(cfg: Config): PublicClient {
  return createPublicClient({ chain: chainOf(cfg), transport: http(cfg.rpcUrl) })
}

export async function readDecision(client: PublicClient, cfg: Config, subject: Address): Promise<Decision> {
  const d = await client.readContract({ address: cfg.registry, abi: registryAbi, functionName: 'decisionOf', args: [subject, cfg.policyId] })
  return { policyId: d.policyId, bits: d.bits, tier: Number(d.tier), expiry: BigInt(d.expiry), statusRef: d.statusRef, revoked: d.revoked }
}

export async function readEligible(client: PublicClient, cfg: Config, subject: Address, requiredBits = 3n): Promise<boolean> {
  return client.readContract({ address: cfg.registry, abi: registryAbi, functionName: 'isEligible', args: [subject, cfg.policyId, requiredBits] })
}

export interface RegistryEvent {
  kind: 'Approved' | 'Revoked'
  subject: Address
  blockNumber: bigint
  logIndex: number
  txHash: Hex
}

/** Approved and Revoked for the configured policy id in [from, to], in chain order. */
export async function readEvents(client: PublicClient, cfg: Config, fromBlock: bigint, toBlock: bigint): Promise<RegistryEvent[]> {
  const [approved, revoked] = await Promise.all([
    client.getContractEvents({ address: cfg.registry, abi: registryAbi, eventName: 'Approved', args: { policyId: cfg.policyId }, fromBlock, toBlock }),
    client.getContractEvents({ address: cfg.registry, abi: registryAbi, eventName: 'Revoked', args: { policyId: cfg.policyId }, fromBlock, toBlock }),
  ])
  const out: RegistryEvent[] = []
  for (const l of approved) out.push({ kind: 'Approved', subject: l.args.subject as Address, blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash })
  for (const l of revoked) out.push({ kind: 'Revoked', subject: l.args.subject as Address, blockNumber: l.blockNumber, logIndex: l.logIndex, txHash: l.transactionHash })
  out.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1))
  return out
}

/** Would `subscribe()` from this wallet go through right now? The chain's own answer (eth_call), before anything is signed. */
export async function chainAllowsSubscribe(client: PublicClient, from: Address, to: Address): Promise<{ ok: boolean; reason?: string }> {
  try {
    await client.call({ account: from, to, data: SUBSCRIBE_DATA })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: shortError(e) }
  }
}

export function shortError(e: unknown): string {
  if (e && typeof e === 'object') {
    const x = e as { shortMessage?: string; message?: string; status?: number }
    const m = x.shortMessage ?? x.message ?? String(e)
    return x.status ? `${x.status}: ${m}` : m
  }
  return String(e)
}
