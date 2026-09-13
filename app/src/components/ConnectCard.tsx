import { CONFIG_WARNINGS } from '../config'
import { addressUrl } from '../lib/explorer'
import type { StepState } from '../lib/journey'
import type { Wallet } from '../lib/wallet'
import { StateChip } from './Rail'

/**
 * The connect step. It renders whatever ways to connect the wallet layer offers (src/lib/wallet.ts,
 * `Wallet.options`); a new option (for example an embedded wallet) is added there, not here.
 */
export function ConnectCard({ wallet, title, lead, state, id = 'connect' }: { wallet: Wallet; title: string; lead: string; state?: StepState; id?: string }) {
  const explorer = wallet.address ? addressUrl(wallet.address) : undefined
  return (
    <section className="card" id={id}>
      <h2>
        {title}
        <StateChip state={state} />
      </h2>
      <p className="lead">{lead}</p>
      {wallet.isConnected && wallet.address ? (
        <>
          <div className="row">
            <span className="status open">connected</span>
            <code>{wallet.address}</code>
          </div>
          <dl className="connected">
            <dt>Wallet</dt>
            <dd>{wallet.connectorName ?? 'wallet'}</dd>
            <dt>Network</dt>
            <dd>
              {wallet.wrongChain ? <span className="status closed">wrong network</span> : wallet.chainName}
              {explorer ? (
                <>
                  {' '}
                  <a href={explorer} target="_blank" rel="noreferrer">
                    view on Etherscan
                  </a>
                </>
              ) : null}
            </dd>
          </dl>
          {wallet.devSigner ? <p className="caption">Dev signer, local only: this page holds the private key and signs without a prompt.</p> : null}
          {wallet.kind === 'privy' ? <p className="caption">Embedded wallet by Privy, created at sign-in (email or passkey). Your identity evidence never goes to Privy. The signer never sees the wallet's private key (Privy's statement).</p> : null}
          {wallet.wrongChain ? (
            <div className="row">
              <button type="button" className="btn btn-yellow" onClick={wallet.switchToChain}>
                Switch to {wallet.chainName}
              </button>
              <span className="muted">Reads and transactions need {wallet.chainName}.</span>
            </div>
          ) : null}
        </>
      ) : wallet.options.length === 0 ? (
        <div className="empty">No wallet found. Install a browser extension wallet, or run the app with the dev signer for local testing.</div>
      ) : (
        <div className="options">
          {wallet.options.map((o) => (
            <div className="option" key={o.id}>
              <button type="button" className={o.kind === 'injected' || o.kind === 'privy' ? 'btn btn-blue' : 'btn btn-ghost'} onClick={o.connect} disabled={wallet.connecting}>
                {wallet.connecting ? 'Connecting' : o.label}
              </button>
              <p className="hint">{o.hint}</p>
            </div>
          ))}
        </div>
      )}
      {wallet.error ? <p className="err">{wallet.error}</p> : null}
      {CONFIG_WARNINGS.length > 0 ? <p className="note coral">Configuration: {CONFIG_WARNINGS.join(', ')}. Copy .env.example to .env and fill in the contract addresses.</p> : null}
    </section>
  )
}
