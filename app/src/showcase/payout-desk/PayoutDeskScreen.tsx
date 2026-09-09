/**
 * Contractor payout desk (WP38): the company screen of the showcase. It reads everything from the bun service
 * in showcase/payout-desk (GET /state, polled) and sends the officers' actions there. No wallet in the browser:
 * the treasury signs through its policy, the gate decides on chain.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { addressUrl, txUrl } from '../../lib/explorer'
import { shortAddress, shortHex } from '../../lib/format'
import { addContractor, approveRun, bypass, ensureAllowance, getState, proposeRun, type BypassKind, type BypassResult, type Contractor, type DeskState, type Officer, type ProposeItem, type RefusedBy, type Run, type RunState } from './client'
import { PAYOUT_DESK_URL } from './config'
import './payout-desk.css'

const POLL_MS = 3000
const DEFAULT_AMOUNT = '100'
const OFFICER_LABEL: Record<Officer, string> = { A: 'Officer A', B: 'Officer B' }

/* ---- helpers ---------------------------------------------------------------------------------- */

function fmtAmount(units: string, token: DeskState['token']): string {
  try {
    return `${formatUnits(BigInt(units), token.decimals)} ${token.symbol}`
  } catch {
    return `${units} units`
  }
}

/** Whole tokens as typed by the officer to token units; undefined when the text is not a positive decimal. */
function toUnits(text: string, decimals: number): string | undefined {
  const t = text.trim()
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined
  try {
    const u = parseUnits(t, decimals)
    return u > 0n ? u.toString() : undefined
  } catch {
    return undefined
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function clock(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

type DecisionChip = { text: string; cls: 'open' | 'closed' | 'waiting' | 'idle' }

function decisionChip(c: Contractor): DecisionChip {
  const s = c.status
  if (!s.hasDecision) return { text: 'no evidence', cls: 'idle' }
  if (s.revoked) return { text: 'revoked', cls: 'closed' }
  const expiry = Number(s.expiry)
  if (expiry !== 0 && expiry <= Math.floor(Date.now() / 1000)) return { text: 'expired', cls: 'closed' }
  if (s.approved && c.eligible) return { text: 'eligible', cls: 'open' }
  return { text: 'awaiting approval', cls: 'waiting' }
}

const RUN_CHIP: Record<RunState, 'open' | 'closed' | 'waiting'> = { proposed: 'waiting', executing: 'waiting', executed: 'open', refused: 'closed', failed: 'closed' }
const REFUSED_PREFIX: Record<RefusedBy, string> = {
  gate: 'Refused by GatedPayout (on chain): ',
  policy: 'Refused by the policy: ',
  chain: 'The chain refused: ',
  transport: 'Failed: ',
}

function AddressText({ address, chars }: { address: string; chars?: number }) {
  const url = addressUrl(address)
  const text = chars ? shortHex(address, chars) : shortAddress(address)
  return url ? (
    <a className="mono" href={url} target="_blank" rel="noreferrer" title={address}>
      {text}
    </a>
  ) : (
    <span className="mono" title={address}>
      {text}
    </span>
  )
}

function TxText({ hash }: { hash: string }) {
  const url = txUrl(hash)
  return url ? (
    <a className="mono" href={url} target="_blank" rel="noreferrer" title={hash}>
      {shortHex(hash, 8)}
    </a>
  ) : (
    <span className="mono" title={hash}>
      {shortHex(hash, 8)}
    </span>
  )
}

/* ---- officer switch --------------------------------------------------------------------------- */

function OfficerSwitch({ officer, onChange }: { officer: Officer; onChange: (o: Officer) => void }) {
  return (
    <div className="pd-officers">
      {(['A', 'B'] as Officer[]).map((o) => (
        <button key={o} type="button" className={`btn btn-ghost${officer === o ? ' selected' : ''}`} onClick={() => onChange(o)} aria-pressed={officer === o}>
          {OFFICER_LABEL[o]}
        </button>
      ))}
      <p className="caption">Both officer tokens live in this browser for the demo. In privy mode with two keys, each approval is a signature of that officer's authorization key.</p>
    </div>
  )
}

/* ---- treasury --------------------------------------------------------------------------------- */

function TreasuryCard({ state, busy, onAllowance, error }: { state: DeskState; busy: boolean; onAllowance: () => void; error?: string }) {
  const local = state.mode !== 'privy'
  const allowanceLow = BigInt(state.treasury.allowance) < BigInt(state.cap)
  return (
    <section className="card" id="treasury">
      <h2>Treasury</h2>
      <dl className="kv pd-kvs">
        <dt>mode</dt>
        <dd>{state.treasury.walletId ? `Privy server wallet ${state.treasury.walletId}` : 'local key on anvil (simulated Privy policy)'}</dd>
        <dt>treasury</dt>
        <dd>
          <AddressText address={state.treasury.address} chars={20} />
        </dd>
        <dt>balance</dt>
        <dd>{fmtAmount(state.treasury.balance, state.token)}</dd>
        <dt>allowance for the gate</dt>
        <dd>
          {fmtAmount(state.treasury.allowance, state.token)}
          {allowanceLow ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onAllowance}>
              Set allowance
            </button>
          ) : null}
        </dd>
        <dt>GatedPayout</dt>
        <dd>
          <AddressText address={state.gate} chars={20} />
        </dd>
        <dt>stablecoin</dt>
        <dd>
          <AddressText address={state.token.address} chars={20} /> ({state.token.symbol}, {state.token.decimals} decimals)
        </dd>
        <dt>chain id</dt>
        <dd>{state.chainId}</dd>
        <dt>per-run cap</dt>
        <dd>{fmtAmount(state.cap, state.token)}</dd>
      </dl>
      {error ? <p className="err">{error}</p> : null}
      <h3 className="pd-sub">Policy</h3>
      <ul className="pd-policy">
        {state.policy.described.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
        {state.policy.privyPolicyId ? (
          <li>
            Privy policy id <span className="mono">{state.policy.privyPolicyId}</span>
          </li>
        ) : null}
        {state.policy.privyKeyQuorumId ? (
          <li>
            Privy key quorum id <span className="mono">{state.policy.privyKeyQuorumId}</span>
          </li>
        ) : null}
      </ul>
      <h3 className="pd-sub">Approval</h3>
      <p className="lead">{state.approval.description}</p>
      {state.approval.simulated ? <p className="caption">simulated</p> : null}
      <div className="pd-note">
        {local ? <span className="tag mock">local mode, Privy not connected</span> : null}
        <p className="note">Treasury wallet by Privy: the company's payout wallet is a Privy server wallet owned by an officer key quorum, with a Privy policy that lets it sign only payout(...) through the GatedPayout contract on this chain (and the allowance for that gate). Privy sees addresses, amounts and calldata, never identity evidence. Sample identity from the official test wallet; testnet funds.</p>
      </div>
    </section>
  )
}

/* ---- contractors ------------------------------------------------------------------------------ */

interface ContractorsProps {
  state: DeskState
  included: Set<string>
  amounts: Record<string, string>
  onInclude: (id: string, on: boolean) => void
  onAmount: (id: string, text: string) => void
  onAdd: (label: string, address: string) => Promise<void>
  busy: boolean
  error?: string
}

function ContractorsCard({ state, included, amounts, onInclude, onAmount, onAdd, busy, error }: ContractorsProps) {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const addressOk = /^0x[0-9a-fA-F]{40}$/.test(address.trim())
  const submit = async () => {
    await onAdd(label.trim(), address.trim())
    setLabel('')
    setAddress('')
  }
  return (
    <section className="card" id="contractors">
      <h2>Contractors</h2>
      <p className="lead">Addresses the company pays. The desk stores a label and an address, nothing else; the decision column is read from the registry on every poll.</p>
      {state.contractors.length === 0 ? (
        <div className="empty">No contractor yet. Add one below.</div>
      ) : (
        <div className="tablewrap">
          <table className="data" data-testid="pd-contractors">
            <thead>
              <tr>
                <th>Include</th>
                <th>Label</th>
                <th>Address</th>
                <th>Decision</th>
                <th>Amount ({state.token.symbol})</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {state.contractors.map((c) => {
                const chip = decisionChip(c)
                const text = amounts[c.id] ?? DEFAULT_AMOUNT
                const valid = toUnits(text, state.token.decimals) !== undefined
                return (
                  <tr key={c.id}>
                    <td>
                      <input type="checkbox" checked={included.has(c.id)} onChange={(e) => onInclude(c.id, e.target.checked)} aria-label={`include ${c.label}`} />
                    </td>
                    <td>{c.label}</td>
                    <td className="mono">
                      <AddressText address={c.address} />
                    </td>
                    <td>
                      <span className={`status ${chip.cls}`}>{chip.text}</span>
                    </td>
                    <td>
                      <input className={`input pd-amount${valid ? '' : ' pd-invalid'}`} value={text} onChange={(e) => onAmount(c.id, e.target.value)} inputMode="decimal" aria-label={`amount for ${c.label}`} aria-invalid={!valid} />
                    </td>
                    <td>{fmtAmount(c.balance, state.token)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="caption">Eligible means: identity evidence and over 18, approved, not revoked, not expired. It does not mean one person per address.</p>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input className="input" placeholder="label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="contractor label" />
        <input className="input" placeholder="0x address" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="contractor address" />
        <button type="submit" className="btn btn-ghost" disabled={busy || !addressOk}>
          Add contractor
        </button>
      </form>
      {error ? <p className="err">{error}</p> : null}
    </section>
  )
}

/* ---- runs ------------------------------------------------------------------------------------- */

function RunView({ run, officer, token, busy, onApprove }: { run: Run; officer: Officer; token: DeskState['token']; busy: boolean; onApprove: (id: string) => void }) {
  const mine = run.approvals.includes(officer)
  return (
    <li className="item pd-run" data-testid="pd-run">
      <div className="top">
        <span className="pd-inline">
          <span className="mono">{run.id}</span>
          <span className={`status ${RUN_CHIP[run.state]}`}>{run.state}</span>
        </span>
        <span className="meta">
          <span>
            approvals: {run.approvals.join(', ')} ({run.approvals.length} of 2)
          </span>
          <span>proposed by {run.proposedBy}</span>
          <span className="mono">{clock(run.createdAt)}</span>
        </span>
      </div>
      <div className="pd-items">
        {run.items.map((it) => (
          <RunItemRow key={it.address} item={it} token={token} />
        ))}
      </div>
      {run.txHash ? (
        <p className="pd-inline">
          <span className="muted">tx</span>
          <TxText hash={run.txHash} />
          {run.blockNumber ? <span className="muted">block {run.blockNumber}</span> : null}
          {run.paidTotal ? <span className="muted">paid {fmtAmount(run.paidTotal, token)}</span> : null}
        </p>
      ) : null}
      {run.error ? (
        <p className="err">
          {run.refusedBy ? REFUSED_PREFIX[run.refusedBy] : ''}
          {run.error}
        </p>
      ) : null}
      {run.state === 'proposed' ? (
        mine ? (
          <p className="muted">waiting for the other officer</p>
        ) : (
          <div>
            <button type="button" className="btn btn-mint" disabled={busy} onClick={() => onApprove(run.id)}>
              Approve as {OFFICER_LABEL[officer]}
            </button>
          </div>
        )
      ) : null}
    </li>
  )
}

function RunItemRow({ item, token }: { item: Run['items'][number]; token: DeskState['token'] }) {
  return (
    <>
      <span>{item.label}</span>
      <span className="mono">
        <AddressText address={item.address} />
      </span>
      <span className="amount">{fmtAmount(item.amount, token)}</span>
      <span>{item.verdict === undefined ? <span className="muted">not previewed yet</span> : item.verdict === 'eligible' ? 'paid' : <span className="err">refused by GatedPayout: {item.reason ?? 'no reason given'}</span>}</span>
    </>
  )
}

interface RunsProps {
  state: DeskState
  officer: Officer
  canPropose: boolean
  proposeHint?: string
  busy: boolean
  error?: string
  onPropose: () => void
  onApprove: (id: string) => void
}

function RunsCard({ state, officer, canPropose, proposeHint, busy, error, onPropose, onApprove }: RunsProps) {
  return (
    <section className="card" id="runs">
      <h2>Payout run</h2>
      <p className="lead">One officer proposes the run from the included rows, the other approves it. At two approvals the service previews every recipient at the gate and pays the eligible ones in one payout(...) call.</p>
      <div className="row">
        <button type="button" className="btn btn-blue" disabled={busy || !canPropose} onClick={onPropose} data-testid="pd-propose">
          Propose run as {OFFICER_LABEL[officer]}
        </button>
        {proposeHint ? <span className="muted">{proposeHint}</span> : null}
      </div>
      {error ? <p className="err">{error}</p> : null}
      {state.runs.length === 0 ? (
        <div className="empty">No run yet. Include contractors above and propose one.</div>
      ) : (
        <ul className="list">
          {state.runs.map((r) => (
            <RunView key={r.id} run={r} officer={officer} token={state.token} busy={busy} onApprove={onApprove} />
          ))}
        </ul>
      )}
      <p className="caption">Approval and revoke of a contractor's decision are manual steps by the issuer desk (/issuer). The gate is on chain, not in this service's database.</p>
    </section>
  )
}

/* ---- outside the gate ------------------------------------------------------------------------- */

function BypassResultLine({ result, error }: { result?: BypassResult; error?: string }) {
  if (error) return <p className="err">Failed: {error}</p>
  if (!result) return null
  if (result.refused) {
    return (
      <div className="result">
        <span className="err">
          {result.refusedBy === 'policy' ? 'Refused by the policy: ' : 'Refused by the chain: '}
          {result.reason}
        </span>
        <span className="muted">attempted: {result.attempted}</span>
      </div>
    )
  }
  return (
    <div className="result">
      <span className="pd-inline">
        <span className="err">allowed (unexpected)</span>
        <TxText hash={result.txHash} />
      </span>
      <span className="muted">attempted: {result.attempted}</span>
    </div>
  )
}

interface BypassProps {
  target?: string
  busy: boolean
  results: Partial<Record<BypassKind, BypassResult>>
  errors: Partial<Record<BypassKind, string>>
  onBypass: (kind: BypassKind) => void
}

function BypassCard({ target, busy, results, errors, onBypass }: BypassProps) {
  return (
    <section className="card" id="bypass">
      <h2>Outside the gate</h2>
      <p className="lead">
        Two things the treasury is not allowed to do{target ? <>, tried against {shortAddress(target)}</> : null}. Both go through the same signer as a payout run.
      </p>
      <div className="pd-bypass">
        <button type="button" className="btn btn-coral" disabled={busy || !target} onClick={() => onBypass('transfer')} data-testid="pd-bypass-transfer">
          Pay directly (transfer on the stablecoin)
        </button>
        <BypassResultLine result={results.transfer} error={errors.transfer} />
      </div>
      <div className="pd-bypass">
        <button type="button" className="btn btn-coral" disabled={busy || !target} onClick={() => onBypass('registry')} data-testid="pd-bypass-registry">
          Approve a contractor from the treasury (call the registry)
        </button>
        <BypassResultLine result={results.registry} error={errors.registry} />
      </div>
      {!target ? <p className="muted">Add a contractor first.</p> : null}
      <p className="caption">The treasury may only pay through the gate. In local mode the refusal comes from the simulated policy checker; in privy mode from Privy's policy engine before anything is signed.</p>
    </section>
  )
}

/* ---- receipts and log ------------------------------------------------------------------------- */

function ReceiptsCard({ state }: { state: DeskState }) {
  return (
    <section className="card" id="receipts">
      <h2>Receipts</h2>
      <p className="lead">PaidOut events of GatedPayout, decoded from the receipts of this desk's runs.</p>
      {state.receipts.length === 0 ? (
        <div className="empty">No payouts yet.</div>
      ) : (
        <div className="receipts" data-testid="pd-receipts">
          {state.receipts.map((r) => (
            <div className="receipt" key={`${r.txHash}-${r.logIndex}`}>
              <span className="when mono">{r.runId}</span>
              <span>
                <span className="what">{fmtAmount(r.amount, state.token)}</span>
                <span className="who"> to {shortAddress(r.recipient)}</span>
                <span className="muted"> block {r.blockNumber}</span>
              </span>
              <TxText hash={r.txHash} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function LogCard({ state }: { state: DeskState }) {
  const lines = state.log.slice(0, 20)
  return (
    <section className="card" id="log">
      <h2>Log</h2>
      {lines.length === 0 ? (
        <div className="empty">Nothing logged yet.</div>
      ) : (
        <ul className="pd-log" data-testid="pd-log">
          {lines.map((l, i) => (
            <li key={`${l.at}-${i}`}>
              <span className="mono muted">{clock(l.at)}</span>
              <span>{l.line}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---- screen ----------------------------------------------------------------------------------- */

export function PayoutDeskScreen() {
  const [state, setState] = useState<DeskState>()
  const [reachable, setReachable] = useState(true)
  const [officer, setOfficer] = useState<Officer>('A')
  const [included, setIncluded] = useState<Set<string>>(() => new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ treasury?: string; contractors?: string; runs?: string }>({})
  const [bypassResults, setBypassResults] = useState<Partial<Record<BypassKind, BypassResult>>>({})
  const [bypassErrors, setBypassErrors] = useState<Partial<Record<BypassKind, string>>>({})
  const seen = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    try {
      const s = await getState()
      setState(s)
      setReachable(true)
      // A contractor is included the first time it shows up; unchecking afterwards sticks.
      const fresh = s.contractors.filter((c) => !seen.current.has(c.id))
      if (fresh.length > 0) {
        for (const c of fresh) seen.current.add(c.id)
        setIncluded((prev) => {
          const next = new Set(prev)
          for (const c of fresh) next.add(c.id)
          return next
        })
      }
    } catch {
      setReachable(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      await refresh()
      if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [refresh])

  /** Runs one action, then re-reads the state so the screen does not wait for the next poll. */
  const act = async (fn: () => Promise<void>, onError: (msg: string) => void) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      onError(errorText(e))
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const decimals = state?.token.decimals ?? 6
  const includedRows = (state?.contractors ?? []).filter((c) => included.has(c.id))
  const items: ProposeItem[] = []
  let proposeHint: string | undefined
  for (const c of includedRows) {
    const units = toUnits(amounts[c.id] ?? DEFAULT_AMOUNT, decimals)
    if (!units) {
      proposeHint = `amount for ${c.label} is not a positive number`
      break
    }
    items.push({ contractorId: c.id, label: c.label, address: c.address, amount: units })
  }
  if (!proposeHint && includedRows.length === 0) proposeHint = 'include at least one contractor'
  const canPropose = !proposeHint && items.length > 0

  const bypassTarget = includedRows[0] ?? state?.contractors[0]
  const bypassAmount = bypassTarget ? toUnits(amounts[bypassTarget.id] ?? DEFAULT_AMOUNT, decimals) : undefined

  const onPropose = () =>
    void act(
      async () => {
        setErrors((e) => ({ ...e, runs: undefined }))
        await proposeRun(officer, items)
      },
      (msg) => setErrors((e) => ({ ...e, runs: msg })),
    )
  const onApprove = (id: string) =>
    void act(
      async () => {
        setErrors((e) => ({ ...e, runs: undefined }))
        await approveRun(officer, id)
      },
      (msg) => setErrors((e) => ({ ...e, runs: msg })),
    )
  const onAdd = (label: string, address: string) =>
    act(
      async () => {
        setErrors((e) => ({ ...e, contractors: undefined }))
        await addContractor(label, address)
      },
      (msg) => setErrors((e) => ({ ...e, contractors: msg })),
    )
  const onAllowance = () =>
    void act(
      async () => {
        setErrors((e) => ({ ...e, treasury: undefined }))
        const r = await ensureAllowance()
        if (r.error) throw new Error(r.error)
      },
      (msg) => setErrors((e) => ({ ...e, treasury: msg })),
    )
  const onBypass = (kind: BypassKind) =>
    void act(
      async () => {
        if (!bypassTarget) return
        setBypassErrors((e) => ({ ...e, [kind]: undefined }))
        const r = await bypass(kind, bypassTarget.address, kind === 'transfer' ? bypassAmount : undefined)
        setBypassResults((prev) => ({ ...prev, [kind]: r }))
      },
      (msg) => setBypassErrors((e) => ({ ...e, [kind]: msg })),
    )

  return (
    <main className="page" data-testid="payout-desk">
      <div className="page-head">
        <div>
          <h1>Contractor payout desk</h1>
          <p className="sub">A company pays freelance contractors in a test stablecoin from a treasury wallet that may only pay through GatedPayout, and GatedPayout pays only addresses with a live Attestat decision. The company never holds an identity document.</p>
        </div>
      </div>
      {!reachable ? (
        <div className="banner warn" role="alert">
          <span>
            Payout desk service not reachable at <span className="mono">{PAYOUT_DESK_URL}</span>. Start it with <span className="mono">scripts/showcase-payout-desk-local.sh --keep</span> or see <span className="mono">docs/showcase/payout-desk.md</span>.
          </span>
        </div>
      ) : null}
      <OfficerSwitch officer={officer} onChange={setOfficer} />
      {state ? (
        <>
          <TreasuryCard state={state} busy={busy} onAllowance={onAllowance} error={errors.treasury} />
          <ContractorsCard
            state={state}
            included={included}
            amounts={amounts}
            onInclude={(id, on) =>
              setIncluded((prev) => {
                const next = new Set(prev)
                if (on) next.add(id)
                else next.delete(id)
                return next
              })
            }
            onAmount={(id, text) => setAmounts((prev) => ({ ...prev, [id]: text }))}
            onAdd={onAdd}
            busy={busy}
            error={errors.contractors}
          />
          <RunsCard state={state} officer={officer} canPropose={canPropose} proposeHint={proposeHint} busy={busy} error={errors.runs} onPropose={onPropose} onApprove={onApprove} />
          <BypassCard target={bypassTarget?.address} busy={busy} results={bypassResults} errors={bypassErrors} onBypass={onBypass} />
          <ReceiptsCard state={state} />
          <LogCard state={state} />
        </>
      ) : reachable ? (
        <div className="skeleton" aria-label="loading">
          <span style={{ width: '80%' }} />
          <span style={{ width: '60%' }} />
        </div>
      ) : null}
      <p className="caption">Official test wallet, sample identity. No identity documents on chain, and nothing we could use to find her. A company paying contractors is not an AMLR obliged entity; this gate is capacity and age, not customer due diligence.</p>
    </main>
  )
}
