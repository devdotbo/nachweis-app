/**
 * HTTP surface for the two screens and the scripts.
 *   GET  /health            liveness
 *   GET  /status            mode, addresses, poll interval, every investor's policy in plain words, the log
 *   GET  /policy/:address   one investor's policy: id, the rules as sent to Privy, plain words
 *   POST /tick              run the tick now; body {"target":"fundToken"} sends to the wrong contract (debug)
 * Start: `bun run src/server.ts` with automation/.env (see .env.example).
 */
import { getAddress, type Address } from 'viem'
import { publicClient } from './chain'
import { loadConfig } from './config'
import { describeRules, expiryOf, hasDenyAll } from './policy'
import { policyBackend } from './policies'
import { makeSigner } from './signer'
import { Store } from './store'
import { runTick, type TickOptions } from './tick'
import { Watcher } from './watch'

const cfg = loadConfig()
const client = publicClient(cfg)
const store = new Store()
const backend = policyBackend(cfg, store)
const signer = makeSigner(cfg, client)
const watcher = new Watcher(cfg, client, store, backend)

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), { status, headers: { 'content-type': 'application/json', ...CORS } })
}

// The two screens poll every few seconds; the wallet lookup (a Privy API call in privy mode) is cached briefly.
const DELEGATED_CACHE_MS = 10_000
const delegatedCache = new Map<string, { at: number; value: boolean }>()
async function isDelegated(address: Address, fresh = false): Promise<boolean> {
  const k = address.toLowerCase()
  const hit = delegatedCache.get(k)
  if (!fresh && hit && Date.now() - hit.at < DELEGATED_CACHE_MS) return hit.value
  const value = Boolean(await signer.delegated(address).catch(() => undefined))
  delegatedCache.set(k, { at: Date.now(), value })
  return value
}

async function investorView(address: Address, fresh = false) {
  const p = store.get(address)
  if (!p) return undefined
  const delegated = await isDelegated(address, fresh)
  return {
    address: p.address,
    policyId: p.policyId,
    signerId: cfg.privy?.signerId ?? 'local',
    rules: p.rules,
    plain: describeRules(p.rules),
    expiry: expiryOf(p.rules),
    denyAll: hasDenyAll(p.rules),
    delegated,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

const server = Bun.serve({
  port: cfg.port,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (url.pathname === '/health') return json({ ok: true, mode: cfg.signer })
    if (url.pathname === '/status' && req.method === 'GET') {
      const investors = []
      for (const p of store.policies.values()) investors.push(await investorView(p.address))
      return json({
        mode: cfg.signer,
        simulated: cfg.signer === 'local',
        caption: cfg.signer === 'local' ? 'simulated Privy policy (local): a dev key signs on anvil and the rule JSON is applied by a small evaluator' : 'Privy enforces the policy; the automation signs as the delegated signer',
        signerId: cfg.privy?.signerId ?? 'local',
        chainId: cfg.chainId,
        registry: cfg.registry,
        subscription: cfg.subscription,
        fundToken: cfg.fundToken,
        policyId: cfg.policyId,
        pollMs: cfg.pollMs,
        lastBlock: watcher.lastBlock,
        investors,
        log: store.log,
      })
    }
    const m = url.pathname.match(/^\/policy\/(0x[0-9a-fA-F]{40})$/)
    if (m && req.method === 'GET') {
      const v = await investorView(getAddress(m[1]!), url.searchParams.get('fresh') === '1')
      return v ? json(v) : json({ error: 'no policy for this address yet: the automation creates it when the registry emits Approved' }, 404)
    }
    if (url.pathname === '/tick' && req.method === 'POST') {
      let opts: TickOptions = {}
      try {
        const body = (await req.json().catch(() => ({}))) as Partial<TickOptions>
        if (body.target === 'fundToken' || body.target === 'subscription') opts.target = body.target
        if (typeof body.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(body.address)) opts.address = getAddress(body.address)
      } catch {
        opts = {}
      }
      await watcher.poll()
      delegatedCache.clear()
      try {
        const results = await runTick(cfg, client, store, signer, opts)
        return json({ results, log: store.log.slice(-20) })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400)
      }
    }
    return json({ error: 'not found' }, 404)
  },
})

await watcher.start()
console.log(`automation listening on http://127.0.0.1:${server.port} (mode ${cfg.signer}, chain ${cfg.chainId}, registry ${cfg.registry}, subscription ${cfg.subscription})`)
