/** Chain reads for the desk: registry status, gate preview, balances, receipts from PaidOut logs. */
import { createPublicClient, defineChain, encodeFunctionData, http, parseAbi, type Address, type Chain, type Hex, type PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import type { Config } from './config'
import { ERC20_APPROVE_ABI, GATED_PAYOUT_ABI } from './policy'

export const registryAbi = parseAbi([
  'function isEligible(address subject, bytes32 policyId, uint256 requiredBits) view returns (bool)',
  'function statusOf(address subject, bytes32 policyId) view returns (bool hasDecision, bool approved, bool revoked, uint64 expiry)',
  'function approve(address subject, bytes32 policyId)',
])

export const gateAbi = parseAbi([
  'function payout(address[] recipients, uint256[] amounts, uint256 total, bytes32 runRef)',
  'function eligibleOf(address[] recipients) view returns (bool[])',
  'error NotEligible(address recipient)',
  'error LengthMismatch()',
  'error TotalMismatch(uint256 expected, uint256 given)',
  'error EmptyRun()',
  'error ZeroAmount(address recipient)',
  'event PaidOut(address indexed payer, address indexed recipient, uint256 amount, bytes32 indexed runRef)',
  'event PayoutRun(address indexed payer, bytes32 indexed runRef, uint256 count, uint256 total)',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

export function chainOf(cfg: Config): Chain {
  if (cfg.chainId === sepolia.id) return { ...sepolia, rpcUrls: { default: { http: [cfg.rpcUrl] } } }
  return defineChain({ id: cfg.chainId, name: `chain ${cfg.chainId}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [cfg.rpcUrl] } } })
}

export function publicClient(cfg: Config): PublicClient {
  return createPublicClient({ chain: chainOf(cfg), transport: http(cfg.rpcUrl) })
}

export interface Status {
  hasDecision: boolean
  approved: boolean
  revoked: boolean
  expiry: bigint
}

export async function statusOf(client: PublicClient, cfg: Config, subject: Address): Promise<{ status: Status; eligible: boolean }> {
  const [s, eligible] = await Promise.all([
    client.readContract({ address: cfg.registry, abi: registryAbi, functionName: 'statusOf', args: [subject, cfg.policyId] }),
    client.readContract({ address: cfg.registry, abi: registryAbi, functionName: 'isEligible', args: [subject, cfg.policyId, cfg.requiredBits] }),
  ])
  return { status: { hasDecision: s[0], approved: s[1], revoked: s[2], expiry: s[3] }, eligible }
}

export async function balanceOf(client: PublicClient, cfg: Config, holder: Address): Promise<bigint> {
  return client.readContract({ address: cfg.token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })
}

export async function allowanceOf(client: PublicClient, cfg: Config, owner: Address): Promise<bigint> {
  return client.readContract({ address: cfg.token, abi: erc20Abi, functionName: 'allowance', args: [owner, cfg.gate] })
}

export async function tokenMeta(client: PublicClient, cfg: Config): Promise<{ symbol: string; decimals: number }> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: cfg.token, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: cfg.token, abi: erc20Abi, functionName: 'decimals' }),
  ])
  return { symbol, decimals }
}

export function payoutCalldata(recipients: Address[], amounts: bigint[], total: bigint, runRef: Hex): Hex {
  return encodeFunctionData({ abi: GATED_PAYOUT_ABI, functionName: 'payout', args: [recipients, amounts, total, runRef] })
}

export function approveCalldata(spender: Address, value: bigint): Hex {
  return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [spender, value] })
}

export function transferCalldata(to: Address, value: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, value] })
}

export function registryApproveCalldata(subject: Address, policyId: Hex): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'approve', args: [subject, policyId] })
}

/**
 * Asks the gate itself, per recipient (eth_call from the treasury): a refusal is the contract's own
 * `NotEligible(address)` revert, decoded verbatim, not a database lookup by this service.
 */
export async function previewRecipient(client: PublicClient, cfg: Config, treasury: Address, recipient: Address, amount: bigint): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await client.simulateContract({ address: cfg.gate, abi: gateAbi, functionName: 'payout', args: [[recipient], [amount], amount, '0x' + '00'.repeat(32) as Hex], account: treasury })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: revertReason(e) }
  }
}

/** "NotEligible(0xabc...)" from a viem ContractFunctionRevertedError, else the shortest message available. */
export function revertReason(e: unknown): string {
  const err = e as { walk?: (fn: (x: unknown) => boolean) => unknown; shortMessage?: string; message?: string }
  const found = err.walk?.((x) => Boolean((x as { data?: { errorName?: string } }).data?.errorName)) as { data?: { errorName: string; args?: readonly unknown[] } } | undefined
  if (found?.data?.errorName) {
    const args = (found.data.args ?? []).map((a) => String(a)).join(', ')
    return `${found.data.errorName}(${args})`
  }
  return shortError(e)
}

export function shortError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string }
  const m = err.shortMessage ?? err.message ?? String(e)
  return m.split('\n')[0].slice(0, 200)
}

export interface Receipt {
  runId: string
  runRef: Hex
  recipient: Address
  amount: string
  txHash: Hex
  blockNumber: string
  logIndex: number
}

export async function receiptsOf(client: PublicClient, cfg: Config, txHash: Hex, runId: string): Promise<Receipt[]> {
  const r = await client.getTransactionReceipt({ hash: txHash })
  const out: Receipt[] = []
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== cfg.gate.toLowerCase()) continue
    try {
      const { decodeEventLog } = await import('viem')
      const ev = decodeEventLog({ abi: gateAbi, data: log.data, topics: log.topics })
      if (ev.eventName !== 'PaidOut') continue
      const a = ev.args as { recipient: Address; amount: bigint; runRef: Hex }
      out.push({ runId, runRef: a.runRef, recipient: a.recipient, amount: a.amount.toString(), txHash, blockNumber: r.blockNumber.toString(), logIndex: log.logIndex })
    } catch {
      /* not one of ours */
    }
  }
  return out
}
