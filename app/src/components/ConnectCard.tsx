import { MOCK, CONFIG_WARNINGS } from '../config'
import type { Wallet } from '../lib/wallet'

export function ConnectCard({ wallet, title, lead }: { wallet: Wallet; title: string; lead: string }) {
  return (
    <section className="card">
      <h2>
        <span className="n">1</span>
        {title}
      </h2>
      <p className="lead">{lead}</p>
      {wallet.isConnected ? (
        <div className="row">
          <span className="status open">connected</span>
          <code>{wallet.address}</code>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-blue" onClick={wallet.connect} disabled={wallet.connecting}>
            {MOCK ? 'Connect (mock wallet)' : 'Connect injected wallet'}
          </button>
          <span className="status idle">not connected</span>
        </div>
      )}
      {wallet.wrongChain ? (
        <div className="row">
          <span className="status closed">wrong network</span>
          <button type="button" className="btn btn-yellow" onClick={wallet.switchToChain}>
            Switch to {wallet.chainName}
          </button>
        </div>
      ) : null}
      {wallet.error ? <p className="err">{wallet.error}</p> : null}
      {CONFIG_WARNINGS.length > 0 ? <p className="note coral">Config: {CONFIG_WARNINGS.join(', ')}. Copy .env.example to .env and fill in the Sepolia addresses.</p> : null}
    </section>
  )
}
