import { NavLink } from 'react-router'
import { useBlockNumber } from 'wagmi'
import { BRIDGE_CONFIGURED, DEV_SIGNER, MOCK, VERIFIER_MODE } from '../config'
import { chain } from '../lib/WalletProvider'
import { ISSUER_PATH, type Role } from '../lib/role'
import { shortAddress } from '../lib/format'
import type { Wallet } from '../lib/wallet'

function BlockTag() {
  const { data, isError } = useBlockNumber({ watch: true, query: { enabled: !MOCK } })
  if (MOCK) return <span className="tag mock">mock chain</span>
  if (isError) return <span className="tag warn">{chain.name}: RPC unreachable</span>
  return (
    <span className={`tag${data !== undefined ? ' live' : ''}`} title={data !== undefined ? `latest block ${data.toString()}` : 'waiting for the first block'}>
      {chain.name}
      {data !== undefined ? `, block ${data.toString()}` : ''}
    </span>
  )
}

export function TopBar({ role, wallet }: { role: Role; wallet: Wallet }) {
  return (
    <header className="topbar">
      <div className="inner">
        <NavLink to="/" className="wordmark" aria-label="Attestat, investor portal">
          Attestat<i>.</i>
        </NavLink>
        <nav className="areas" aria-label="Area">
          <NavLink to="/" end>
            Investor
          </NavLink>
          <NavLink to={ISSUER_PATH}>Issuer</NavLink>
        </nav>
        <div className="spacer" />
        <div className="netgroup" aria-label="Network">
          <BlockTag />
          {MOCK ? <span className="tag mock">mock mode</span> : BRIDGE_CONFIGURED ? <span className="tag">bridge</span> : VERIFIER_MODE === 'relay' ? <span className="tag">blind relay</span> : null}
          {DEV_SIGNER ? <span className="tag mock">dev signer, local only</span> : null}
          {wallet.wrongChain ? <span className="tag warn">wrong network</span> : null}
        </div>
        <div className="wallet">
          {wallet.isConnected && wallet.address ? (
            <>
              <span className="chip" title={`${wallet.connectorName ?? 'wallet'} as ${role}`}>
                <span className="dot" />
                {shortAddress(wallet.address)}
              </span>
              <button type="button" className="btn btn-ghost" onClick={wallet.disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <span className="chip off" title="no wallet connected">
                <span className="dot" />
                {role === 'issuer' ? 'operator' : 'investor'}
              </span>
              <button type="button" className="btn btn-ghost" onClick={wallet.connect} disabled={wallet.connecting || wallet.options.length === 0}>
                {wallet.connecting ? 'Connecting' : 'Connect'}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
