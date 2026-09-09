/** viem access to the registry: reads, log fetches, receipts, and calldata encoders. */
import {
  createPublicClient,
  decodeFunctionData,
  defineChain,
  encodeFunctionData,
  http,
  parseAbiItem,
  type Address,
  type Chain,
  type Hex,
} from 'viem'
import { foundry, sepolia } from 'viem/chains'
import { registryAbi } from './abi'
import type { Config } from './config'
import type { Evidence } from './types'

export function chainFor(chainId: number, rpcUrl: string): Chain {
  if (chainId === sepolia.id) return sepolia
  if (chainId === foundry.id) return foundry
  return defineChain({
    id: chainId,
    name: `chain-${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
}

export interface Status {
  hasDecision: boolean
  isApproved: boolean
  isRevoked: boolean
  expiry: number
}
export interface AttestedLog {
  subject: Address
  policyId: Hex
  evidence: Evidence
}
export interface Receipt {
  status: 'success' | 'reverted'
  gasUsed: bigint
}
/** What the desk needs from the chain; desk tests inject a stub. */
export interface ChainReader {
  latestBlock(): Promise<bigint>
  statusOf(subject: Address, policyId: Hex): Promise<Status>
  fetchAttested(fromBlock: bigint, toBlock: bigint, policyId?: Hex): Promise<AttestedLog[]>
  waitReceipt(hash: Hex): Promise<Receipt>
}

const attestedEvent = parseAbiItem(
  'event Attested(address indexed subject, bytes32 indexed policyId, uint256 bits, uint8 tier, uint64 expiry, bytes32 statusRef, address indexed attester)',
)

export function makeChain(cfg: Config): ChainReader {
  const chain = chainFor(cfg.chainId, cfg.rpcUrl)
  const client = createPublicClient({ chain, transport: http(cfg.rpcUrl) })
  return {
    latestBlock: () => client.getBlockNumber(),
    async statusOf(subject, policyId) {
      const r = (await client.readContract({
        address: cfg.registry,
        abi: registryAbi,
        functionName: 'statusOf',
        args: [subject, policyId],
      })) as readonly [boolean, boolean, boolean, bigint]
      return { hasDecision: r[0], isApproved: r[1], isRevoked: r[2], expiry: Number(r[3]) }
    },
    async fetchAttested(fromBlock, toBlock, policyId) {
      const logs = await client.getLogs({
        address: cfg.registry,
        event: attestedEvent,
        args: policyId ? { policyId } : undefined,
        fromBlock,
        toBlock,
      })
      return logs.map((l) => ({
        subject: l.args.subject!,
        policyId: l.args.policyId!,
        evidence: {
          bits: l.args.bits!.toString(),
          tier: l.args.tier!,
          expiry: Number(l.args.expiry!),
          statusRef: l.args.statusRef!,
          attester: l.args.attester!,
          txHash: l.transactionHash,
          blockNumber: Number(l.blockNumber),
        },
      }))
    },
    async waitReceipt(hash) {
      const r = await client.waitForTransactionReceipt({ hash })
      return { status: r.status, gasUsed: r.gasUsed }
    },
  }
}

export function encodeApprove(subject: Address, policyId: Hex): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'approve', args: [subject, policyId] })
}

export function encodeRevoke(subject: Address, policyId: Hex): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'revoke', args: [subject, policyId] })
}

/** A dummy Decision: the probe only needs calldata whose function is attestByOperator. */
export function encodeAttestByOperator(subject: Address, policyId: Hex): Hex {
  const decision = { policyId, bits: 1n, tier: 1, expiry: 4102444800n, statusRef: `0x${'00'.repeat(32)}` as Hex, revoked: false }
  return encodeFunctionData({ abi: registryAbi, functionName: 'attestByOperator', args: [subject, decision] })
}

/** The registry function name behind calldata, or undefined when it is empty or unknown. */
export function decodeFunctionName(data: Hex | undefined): string | undefined {
  if (!data || data === '0x') return undefined
  try {
    return decodeFunctionData({ abi: registryAbi, data }).functionName
  } catch {
    return undefined
  }
}

/** viem's shortMessage or the message: first line, at most 300 characters. */
export function shortError(e: unknown): string {
  const m = (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e))
  return m.split('\n')[0]!.slice(0, 300)
}
