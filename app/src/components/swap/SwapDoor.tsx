/**
 * The Swap door tile: what you send, what the pool would deliver, the question the pool asks the
 * registry about this address, the Swap button, and the receipt or the refusal in plain words.
 * Sits in the doors grid of DoorsCard next to Subscribe.
 */
import { formatUnits, type Address } from 'viem'
import { addressUrl } from '../../lib/explorer'
import { shortHex } from '../../lib/format'
import { TxHash } from '../TxLine'
import { POOL_CONFIG, SWAP_AMOUNT_IN } from './config'
import { usePoolState, useQuote, useSwapCheck, useSwapTx, type SwapStep, type SwapTxState } from './useSwap'
import './swap.css'

function fmt(value: bigint, decimals: number, places: number): string {
  const s = formatUnits(value, decimals)
  const [whole, frac = ''] = s.split('.')
  const cut = frac.slice(0, places).replace(/0+$/, '')
  return cut ? `${whole}.${cut}` : whole
}

function StepList({ steps, current }: { steps: SwapStep[]; current?: string }) {
  return (
    <div className="steps" aria-label="swap steps">
      {steps.map((s) => (
        <span key={s.id} className={`step ${s.skipped ? '' : 'done'}`} title={s.hash}>
          {s.label}
        </span>
      ))}
      {current ? <span className="step current">{current}</span> : null}
    </div>
  )
}

const RUNNING_LABEL: Record<string, string> = {
  faucet: 'checking the demo stable balance',
  approve: 'ERC-20 approval to Permit2',
  permit2: 'Permit2 allowance for the router',
  swap: 'UniversalRouter.execute, waiting for the receipt',
}

function Result({ state, fundSymbol, stableSymbol, fundDecimals, stableDecimals }: { state: SwapTxState; fundSymbol: string; stableSymbol: string; fundDecimals: number; stableDecimals: number }) {
  switch (state.status) {
    case 'idle':
      return null
    case 'running':
      return (
        <div className="swap-result" data-testid="swap-result">
          <p className="txline">
            <span className="status waiting">tx pending</span>
            <span className="muted">{RUNNING_LABEL[state.current]}</span>
          </p>
          <StepList steps={state.steps} current={state.current} />
        </div>
      )
    case 'done':
      return (
        <div className="swap-result" data-testid="swap-result" data-outcome="done">
          <p className="txline">
            <span className="status open">swap confirmed</span>
            <TxHash hash={state.hash} />
            <span className="muted">gas {state.gasUsed.toString()}</span>
          </p>
          <p className="hint" data-testid="swap-received">
            Sent {fmt(state.stableIn, stableDecimals, 2)} {stableSymbol}, received {fmt(state.fundOut, fundDecimals, 4)} {fundSymbol}. The adapter unwrapped the pool's virtual token into the fund token on the way out, and the token's own transfer check read the registry once more.
          </p>
          <StepList steps={state.steps} />
        </div>
      )
    case 'refused':
      return (
        <div className="swap-result" data-testid="swap-result" data-outcome="refused">
          <p className="txline">
            <span className="status closed">swap refused</span>
            {state.hash ? <TxHash hash={state.hash} /> : <span className="muted">not sent</span>}
          </p>
          <p className="note coral" data-testid="swap-refusal">
            <b>{state.refusal.title}.</b> {state.refusal.plain}
          </p>
          <StepList steps={state.steps} />
          <details>
            <summary>revert data, decoded</summary>
            <pre className="raw">{state.refusal.decoded.join('\n')}{state.refusal.raw ? `\n\nraw ${state.refusal.raw}` : ''}</pre>
          </details>
        </div>
      )
    case 'error':
      return (
        <div className="swap-result" data-testid="swap-result" data-outcome="error">
          <p className="err">{state.message}</p>
          <StepList steps={state.steps} />
        </div>
      )
  }
}

export function SwapDoor({ address, eligible }: { address?: Address; eligible: boolean }) {
  const cfg = POOL_CONFIG
  const pool = usePoolState(cfg)
  const check = useSwapCheck(address, pool.data, cfg)
  const quote = useQuote(pool.data, cfg)
  const { state, swap, ready } = useSwapTx(address, cfg)
  const p = pool.data
  const open = Boolean(cfg && eligible && p?.swappingEnabled)
  const adapterUrl = cfg ? addressUrl(cfg.adapter) : undefined
  const busy = state.status === 'running'

  if (!cfg) {
    return (
      <div className="door swap-door" data-testid="swap-door">
        <div className="head">
          <h3>Swap</h3>
          <span className="status closed">closed</span>
        </div>
        <p className="hint">The Uniswap v4 permissioned pool reads the same registry before every swap. No pool is configured for this build: scripts/pool-local.sh creates one on an anvil fork of Sepolia and writes VITE_POOL_ADAPTER and VITE_POOL_STABLE.</p>
        <button type="button" className="btn btn-blue" disabled title="no pool configured (VITE_POOL_ADAPTER, VITE_POOL_STABLE)">
          Swap
        </button>
      </div>
    )
  }

  const stableSymbol = p?.stableSymbol ?? 'stable'
  const fundSymbol = p?.fundSymbol ?? 'fund token'
  const stableDecimals = p?.stableDecimals ?? 6
  const fundDecimals = p?.fundDecimals ?? 18
  const c = check.data

  return (
    <div className="door swap-door" data-testid="swap-door">
      <div className="head">
        <h3>Swap</h3>
        <span className={`status ${open ? 'open' : 'closed'}`} data-testid="swap-status">
          {open ? 'open' : 'closed'}
        </span>
      </div>
      <p className="hint">
        Uniswap v4 permissioned pool {fundSymbol}/{stableSymbol}, fee {p ? (p.lpFee / 10_000).toFixed(2) : (cfg.key.fee / 10_000).toFixed(2)} percent, adapter{' '}
        {adapterUrl ? (
          <a href={adapterUrl} target="_blank" rel="noreferrer">
            {shortHex(cfg.adapter, 6)}
          </a>
        ) : (
          <code>{shortHex(cfg.adapter, 6)}</code>
        )}
        . Its hook asks the registry before every swap.
        {pool.error ? ` Pool reads failed: ${pool.error.message.split('\n')[0]}` : ''}
      </p>
      <div className="swap-amounts">
        <div className="swap-amount">
          <span className="l">You send</span>
          <span className="v">
            {fmt(SWAP_AMOUNT_IN, stableDecimals, 2)} {stableSymbol}
          </span>
          <span className="s">demo stable, minted by a faucet on this test chain; you hold {c ? fmt(c.stableBalance, stableDecimals, 2) : '…'}</span>
        </div>
        <div className="swap-amount">
          <span className="l">You receive</span>
          <span className="v" data-testid="swap-quote">
            {quote ? `about ${fmt(quote.amountOut, fundDecimals, 4)} ${fundSymbol}` : p ? 'no liquidity' : '…'}
          </span>
          <span className="s">estimate from the pool's slot0 and liquidity; the receipt shows the delivered amount</span>
        </div>
      </div>
      <div className="swap-ask" data-testid="swap-check">
        <span>Before the swap, the pool asks the registry:</span>
        <span className="q">
          isEligible({address ? shortHex(address, 4) : 'you'}, {p ? shortHex(p.checkerPolicyId, 4) : 'policy'}, 0x{p ? p.checkerRequiredBits.toString(16) : '…'})
        </span>
        <div className="flags">
          <span className={`flag ${c ? (c.registryEligible ? 'on' : 'off') : ''}`} data-testid="check-registry">
            registry: {c ? (c.registryEligible ? 'eligible' : 'not eligible') : address ? '…' : 'connect a wallet'}
          </span>
          <span className={`flag ${c ? (c.checkerFlags !== '0x0000' ? 'on' : 'off') : ''}`} data-testid="check-checker">
            checker: {c ? (c.checkerFlags === '0x0003' ? 'swap and liquidity allowed' : c.checkerFlags === '0x0000' ? 'no flags' : c.checkerFlags) : '…'}
          </span>
          <span className={`flag ${c ? (c.adapterAllowed ? 'on' : 'off') : ''}`} data-testid="check-adapter">
            adapter: {c ? (c.adapterAllowed ? 'SWAP_ALLOWED' : 'refused') : '…'}
          </span>
        </div>
      </div>
      <button type="button" className="btn btn-blue" disabled={!ready || busy || !p} onClick={() => void swap()} data-testid="swap-button" title={!address ? 'connect a wallet' : open ? 'send the swap through the permissioned router' : 'the pool will refuse this address; the refusal is shown and recorded'}>
        {busy ? 'Sending' : 'Swap'}
      </button>
      {!open && address && c && !c.adapterAllowed && state.status === 'idle' ? <p className="hint">Door closed: the swap can still be sent, and the pool's refusal is shown here with the revert reason.</p> : null}
      <Result state={state} fundSymbol={fundSymbol} stableSymbol={stableSymbol} fundDecimals={fundDecimals} stableDecimals={stableDecimals} />
    </div>
  )
}
