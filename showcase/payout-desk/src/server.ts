/**
 * HTTP server of the payout desk (bun). The company screen (app, /showcase/payout-desk) talks to it.
 *
 *   GET  /state                       everything the screen shows (mode, treasury, policy, contractors, runs, receipts)
 *   POST /contractors {label,address} add a contractor address (the desk never stores anything but an address and a label)
 *   POST /runs {items:[{contractorId|address, amount}]}   officer proposes a run (bearer token selects the officer)
 *   POST /runs/:id/approve            a different officer approves; at two approvals the run executes
 *   POST /bypass {kind:'transfer'|'registry', address?, amount?}   the treasury tries to act outside the gate
 *   POST /allowance                   (re)issue the approve(gate) transaction through the policy
 *
 * Officers: Authorization: Bearer <OFFICER_A_TOKEN|OFFICER_B_TOKEN>.
 */
import type { Address, Hex } from 'viem'
import { getAddress } from 'viem'
import { allowanceOf, approveCalldata, balanceOf, payoutCalldata, previewRecipient, publicClient, receiptsOf, registryApproveCalldata, revertReason, shortError, statusOf, tokenMeta, transferCalldata, type Receipt } from './chain'
import { loadConfig, type Config } from './config'
import { buildRules, describeRules, type PolicyRule } from './policy'
import { RunError, RunStore, type Officer, type ProposeItem, type Run } from './runs'
import { makeSigner, PolicyDenied, type Signer } from './signer'

interface Contractor {
  id: string
  label: string
  address: Address
}

export interface Desk {
  cfg: Config
  signer: Signer
  rules: PolicyRule[]
  contractors: Contractor[]
  runs: RunStore
  receipts: Receipt[]
  log: { at: string; line: string }[]
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra },
  })
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' }

function officerOf(req: Request, cfg: Config): Officer | undefined {
  const h = req.headers.get('authorization') ?? ''
  const token = h.replace(/^Bearer\s+/i, '').trim()
  if (token && token === cfg.officerTokens.A) return 'A'
  if (token && token === cfg.officerTokens.B) return 'B'
  return undefined
}

function say(desk: Desk, line: string) {
  const at = new Date().toISOString()
  desk.log.unshift({ at, line })
  if (desk.log.length > 200) desk.log.length = 200
  console.log(`[payout-desk] ${line}`)
}

export function approvalInfo(cfg: Config): { mode: 'quorum-2of2' | 'app-second-approver'; simulated: boolean; description: string } {
  if (cfg.signer === 'privy' && cfg.privy?.keyB) {
    return { mode: 'quorum-2of2', simulated: false, description: 'Two-officer approval: the treasury wallet is owned by a 2-of-2 Privy key quorum; both officer keys sign every signing request and Privy refuses a request with one key.' }
  }
  if (cfg.signer === 'privy') {
    return { mode: 'app-second-approver', simulated: true, description: 'Second approval recorded by this service (1-of-1 key quorum on the Privy wallet; a second officer key is not registered). Simulated four-eyes.' }
  }
  return { mode: 'app-second-approver', simulated: true, description: 'Second approval recorded by this service; Privy not connected (local mode). Simulated four-eyes.' }
}

export async function stateOf(desk: Desk) {
  const { cfg } = desk
  const client = publicClient(cfg)
  const treasury = await desk.signer.address()
  const [balance, allowance, meta] = await Promise.all([balanceOf(client, cfg, treasury), allowanceOf(client, cfg, treasury), tokenMeta(client, cfg)])
  const contractors = await Promise.all(
    desk.contractors.map(async (c) => {
      const [{ status, eligible }, bal] = await Promise.all([statusOf(client, cfg, c.address), balanceOf(client, cfg, c.address)])
      return { ...c, eligible, status: { ...status, expiry: status.expiry.toString() }, balance: bal.toString() }
    }),
  )
  return {
    mode: cfg.signer,
    chainId: cfg.chainId,
    treasury: { address: treasury, walletId: desk.signer.walletId, balance: balance.toString(), allowance: allowance.toString() },
    gate: cfg.gate,
    token: { address: cfg.token, symbol: meta.symbol, decimals: meta.decimals },
    registry: cfg.registry,
    policyId: cfg.policyId,
    requiredBits: cfg.requiredBits.toString(),
    cap: cfg.cap.toString(),
    policy: { rules: desk.rules, described: describeRules(desk.rules, meta.decimals, meta.symbol), privyPolicyId: cfg.privy?.policyId, privyKeyQuorumId: cfg.privy?.keyQuorumId },
    approval: approvalInfo(cfg),
    officers: [
      { id: 'A', label: 'Officer A' },
      { id: 'B', label: 'Officer B' },
    ],
    contractors,
    runs: desk.runs.list(),
    receipts: desk.receipts,
    log: desk.log.slice(0, 50),
  }
}

/** Executes a run whose second approval just landed: preview each recipient at the gate, pay the eligible ones. */
export async function execute(desk: Desk, run: Run): Promise<Run> {
  const { cfg } = desk
  const client = publicClient(cfg)
  const treasury = await desk.signer.address()
  desk.runs.update(run.id, { state: 'executing' })
  for (const it of run.items) {
    const p = await previewRecipient(client, cfg, treasury, it.address, BigInt(it.amount))
    it.verdict = p.ok ? 'eligible' : 'refused'
    it.reason = p.ok ? undefined : p.reason
    if (!p.ok) say(desk, `run ${run.id}: GatedPayout refuses ${it.label} ${it.address}: ${p.reason}`)
  }
  const paid = run.items.filter((it) => it.verdict === 'eligible')
  if (paid.length === 0) {
    say(desk, `run ${run.id}: refused by the gate, nothing paid`)
    return desk.runs.update(run.id, { state: 'refused', refusedBy: 'gate', error: run.items.map((it) => it.reason).filter(Boolean).join('; ') })
  }
  const recipients = paid.map((it) => it.address)
  const amounts = paid.map((it) => BigInt(it.amount))
  const total = amounts.reduce((s, a) => s + a, 0n)
  const data = payoutCalldata(recipients, amounts, total, run.ref)
  const officers = run.approvals.slice(0, 2) as Officer[]
  try {
    const hash = await desk.signer.send({ to: cfg.gate, data }, desk.rules, officers)
    const receipts = await receiptsOf(client, cfg, hash, run.id)
    desk.receipts.unshift(...receipts)
    say(desk, `run ${run.id}: paid ${paid.length} recipient(s), total ${total} units, tx ${hash}`)
    return desk.runs.update(run.id, { state: 'executed', txHash: hash, paidTotal: total.toString(), blockNumber: receipts[0]?.blockNumber })
  } catch (e) {
    if (e instanceof PolicyDenied) {
      say(desk, `run ${run.id}: refused by the policy: ${e.message}`)
      return desk.runs.update(run.id, { state: 'refused', refusedBy: 'policy', error: e.message })
    }
    const reason = revertReason(e)
    say(desk, `run ${run.id}: failed: ${reason}`)
    return desk.runs.update(run.id, { state: 'failed', refusedBy: reason.startsWith('NotEligible') ? 'gate' : 'chain', error: reason })
  }
}

/** The treasury tries to act outside the gate; the policy is expected to refuse. Returns the verdict, never throws for a refusal. */
export async function bypass(desk: Desk, kind: 'transfer' | 'registry', address?: string, amount?: string) {
  const { cfg } = desk
  let to: Address
  let data: Hex
  let label: string
  if (kind === 'transfer') {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new RunError('address required', 400)
    const value = amount && /^\d+$/.test(amount) ? BigInt(amount) : 1_000_000n
    to = cfg.token
    data = transferCalldata(getAddress(address), value)
    label = `transfer(${getAddress(address)}, ${value}) on the stablecoin, bypassing the gate`
  } else {
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new RunError('address required', 400)
    to = cfg.registry
    data = registryApproveCalldata(getAddress(address), cfg.policyId)
    label = `approve(${getAddress(address)}, policyId) on the AttestationRegistry from the treasury`
  }
  try {
    const hash = await desk.signer.send({ to, data }, desk.rules)
    say(desk, `bypass ${kind}: ALLOWED, tx ${hash} (unexpected)`)
    return { kind, attempted: label, refused: false, txHash: hash }
  } catch (e) {
    if (e instanceof PolicyDenied) {
      say(desk, `bypass ${kind}: refused by the policy: ${e.message}`)
      return { kind, attempted: label, refused: true, refusedBy: 'policy' as const, reason: e.message }
    }
    const reason = revertReason(e)
    say(desk, `bypass ${kind}: refused by the chain: ${reason}`)
    return { kind, attempted: label, refused: true, refusedBy: 'chain' as const, reason }
  }
}

/** approve(gate, max) from the treasury through the policy, when the allowance is below the cap. */
export async function ensureAllowance(desk: Desk): Promise<{ allowance: string; txHash?: Hex; error?: string }> {
  const { cfg } = desk
  const client = publicClient(cfg)
  const treasury = await desk.signer.address()
  const current = await allowanceOf(client, cfg, treasury)
  if (current >= cfg.cap) return { allowance: current.toString() }
  try {
    const hash = await desk.signer.send({ to: cfg.token, data: approveCalldata(cfg.gate, 2n ** 256n - 1n) }, desk.rules)
    const after = await allowanceOf(client, cfg, treasury)
    say(desk, `allowance for the gate set through the policy, tx ${hash}`)
    return { allowance: after.toString(), txHash: hash }
  } catch (e) {
    const msg = e instanceof PolicyDenied ? e.message : shortError(e)
    say(desk, `allowance not set: ${msg}`)
    return { allowance: current.toString(), error: msg }
  }
}

export function makeDesk(cfg: Config): Desk {
  const client = publicClient(cfg)
  return {
    cfg,
    signer: makeSigner(cfg, client),
    rules: buildRules({ chainId: cfg.chainId, gate: cfg.gate, token: cfg.token, cap: cfg.cap }),
    contractors: cfg.contractors.map((c, i) => ({ id: `c${i + 1}`, ...c })),
    runs: new RunStore(),
    receipts: [],
    log: [],
  }
}

export async function handle(desk: Desk, req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  try {
    if (req.method === 'GET' && (path === '/' || path === '/state')) return json(await stateOf(desk))
    if (req.method === 'GET' && path === '/health') return json({ ok: true, mode: desk.cfg.signer })
    if (req.method === 'GET' && path.startsWith('/runs/')) {
      const run = desk.runs.get(path.slice('/runs/'.length))
      return run ? json(run) : json({ error: 'no such run' }, 404)
    }
    if (req.method === 'POST' && path === '/contractors') {
      const body = (await req.json()) as { label?: string; address?: string }
      if (!body.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) return json({ error: 'address required' }, 400)
      const address = getAddress(body.address)
      const existing = desk.contractors.find((c) => c.address === address)
      if (existing) return json(existing)
      const c: Contractor = { id: `c${desk.contractors.length + 1}`, label: (body.label ?? '').trim() || address.slice(0, 10), address }
      desk.contractors.push(c)
      say(desk, `contractor added: ${c.label} ${c.address}`)
      return json(c, 201)
    }
    if (req.method === 'POST' && path === '/allowance') return json(await ensureAllowance(desk))
    if (req.method === 'POST' && path === '/bypass') {
      const body = (await req.json()) as { kind?: 'transfer' | 'registry'; address?: string; amount?: string }
      if (body.kind !== 'transfer' && body.kind !== 'registry') return json({ error: 'kind must be transfer or registry' }, 400)
      return json(await bypass(desk, body.kind, body.address, body.amount))
    }
    const officer = officerOf(req, desk.cfg)
    if (req.method === 'POST' && path === '/runs') {
      if (!officer) return json({ error: 'officer token required (Authorization: Bearer ...)' }, 401)
      const body = (await req.json()) as { items?: ProposeItem[] }
      const items = (body.items ?? []).map((it) => {
        const c = it.contractorId ? desk.contractors.find((x) => x.id === it.contractorId) : undefined
        return { contractorId: c?.id ?? it.contractorId, label: c?.label ?? it.label, address: c?.address ?? it.address, amount: String(it.amount) }
      })
      const run = desk.runs.propose(officer, items)
      say(desk, `run ${run.id} proposed by officer ${officer}: ${run.items.length} recipient(s), total ${run.total} units`)
      return json(run, 201)
    }
    const m = path.match(/^\/runs\/([^/]+)\/approve$/)
    if (req.method === 'POST' && m) {
      if (!officer) return json({ error: 'officer token required (Authorization: Bearer ...)' }, 401)
      const { run, ready } = desk.runs.approve(officer, m[1])
      say(desk, `run ${run.id} approved by officer ${officer} (${run.approvals.length} of 2)`)
      if (!ready) return json(run)
      return json(await execute(desk, run))
    }
    return json({ error: 'not found' }, 404)
  } catch (e) {
    if (e instanceof RunError) return json({ error: e.message }, e.status)
    console.error('[payout-desk]', e)
    return json({ error: shortError(e) }, 500)
  }
}

if (import.meta.main) {
  const cfg = loadConfig()
  const desk = makeDesk(cfg)
  const treasury = await desk.signer.address()
  console.log(`[payout-desk] mode ${cfg.signer}, chain ${cfg.chainId}, treasury ${treasury}${desk.signer.walletId ? ` (Privy wallet ${desk.signer.walletId})` : ''}, gate ${cfg.gate}, token ${cfg.token}, cap ${cfg.cap} units`)
  for (const line of describeRules(desk.rules)) console.log(`[payout-desk] policy: ${line}`)
  console.log(`[payout-desk] approval: ${approvalInfo(cfg).description}`)
  void ensureAllowance(desk)
  Bun.serve({ port: cfg.port, fetch: (req) => handle(desk, req) })
  console.log(`[payout-desk] listening on http://127.0.0.1:${cfg.port}`)
}
