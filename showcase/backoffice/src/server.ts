/** HTTP surface of the desk plus the Attested watcher. Run: BACKOFFICE_MODE=local REGISTRY=0x... bun run src/server.ts */
import { getAddress } from 'viem'
import { makeChain, shortError } from './chain'
import { loadConfig } from './config'
import { Desk } from './desk'
import { makeOperator } from './operator'
import { ROLES, type ConfirmBody, type ProbeKind, type ProposeBody } from './types'

const cfg = loadConfig()
const operator = makeOperator(cfg)
const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`)
const desk = new Desk(cfg, operator, makeChain(cfg), log)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}
const bigintSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, bigintSafe), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const bad = (message: string, status = 400) => json({ error: message }, status)

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/$/, '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method === 'GET' && path === '/health') return json({ ok: true, mode: cfg.mode })
  if (req.method === 'GET' && path === '/desk') return json(desk.deskInfo())
  if (req.method === 'GET' && path === '/queue') return json(desk.list())
  if (req.method === 'POST' && path === '/queue/propose') {
    const body = (await req.json().catch(() => null)) as Partial<ProposeBody> | null
    if (!body || (body.kind !== 'approve' && body.kind !== 'revoke')) return bad('kind must be approve or revoke')
    let subject
    try {
      subject = getAddress(String(body.subject))
    } catch {
      return bad('subject must be an address')
    }
    return json(desk.propose(body.kind, subject, 'manual'))
  }
  const confirm = path.match(/^\/queue\/([^/]+)\/confirm$/)
  if (req.method === 'POST' && confirm) {
    const body = (await req.json().catch(() => null)) as Partial<ConfirmBody> | null
    if (!body || !ROLES.includes(body.role as never)) return bad(`role must be one of ${ROLES.join(', ')}`)
    if (!desk.get(confirm[1]!)) return bad('unknown proposal', 404)
    try {
      return json(await desk.confirm(confirm[1]!, body.role as ConfirmBody['role']))
    } catch (e) {
      return bad(shortError(e))
    }
  }
  if (req.method === 'POST' && path === '/probe') {
    const body = (await req.json().catch(() => null)) as { kind?: ProbeKind } | null
    const kinds: ProbeKind[] = ['transfer', 'attestByOperator', 'single-signature', 'sign-message']
    if (!body || !kinds.includes(body.kind as ProbeKind)) return bad(`kind must be one of ${kinds.join(', ')}`)
    try {
      return json(await desk.probe(body.kind as ProbeKind))
    } catch (e) {
      return bad(shortError(e), 502)
    }
  }
  return bad('not found', 404)
}

Bun.serve({
  hostname: '127.0.0.1',
  port: cfg.port,
  fetch: (req) => route(req).catch((e) => bad(shortError(e), 500)),
})

const tick = () => desk.tick().catch((e) => log(`watcher error: ${shortError(e)}`))
void tick()
setInterval(tick, cfg.pollMs)

log(`backoffice desk: mode ${cfg.mode}, operator ${operator.address}, registry ${cfg.registry}, chain ${cfg.chainId}, port ${cfg.port}`)
