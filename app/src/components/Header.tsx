import { MOCK, VERIFIER_MODE } from '../config'
import type { Role } from '../lib/role'
import { shortAddress } from '../lib/format'
import type { Wallet } from '../lib/wallet'

export function Header({ role, setRole, wallet }: { role: Role; setRole: (r: Role) => void; wallet: Wallet }) {
  return (
    <header className="header">
      <div className="wordmark">
        Nachweis<span>.</span>
      </div>
      <span className="tag">Sepolia</span>
      {MOCK ? <span className="tag mock">mock mode</span> : VERIFIER_MODE === 'relay' ? <span className="tag">blind relay</span> : null}
      <div className="spacer" />
      <div className="roles" role="group" aria-label="Role">
        <button type="button" aria-pressed={role === 'investor'} onClick={() => setRole('investor')}>
          Investor
        </button>
        <button type="button" aria-pressed={role === 'issuer'} onClick={() => setRole('issuer')}>
          Issuer
        </button>
      </div>
      <div className="wallet">
        {wallet.isConnected && wallet.address ? (
          <>
            <span className="chip">
              <span className="dot" />
              {shortAddress(wallet.address)}
            </span>
            <button type="button" className="btn btn-ghost" onClick={wallet.disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-blue" onClick={wallet.connect} disabled={wallet.connecting}>
            {wallet.connecting ? 'Connecting' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
