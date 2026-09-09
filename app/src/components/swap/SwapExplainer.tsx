/**
 * Under the doors: the pool as the chain sees it (left) and how the permissioned pool decides (right).
 * Every sentence on the right is what the contracts do; the sources are named in the file headers of
 * contracts/src/uniswap and contracts/script/lib/PermissionedPoolOnboarding.sol.
 */
import { formatUnits } from 'viem'
import { REGISTRY } from '../../config'
import { addressUrl } from '../../lib/explorer'
import { shortHex } from '../../lib/format'
import { priceFromSqrt } from './calldata'
import { POOL_CONFIG } from './config'
import { usePoolState } from './useSwap'
import './swap.css'

function Addr({ value, chars = 6 }: { value: string; chars?: number }) {
  const url = addressUrl(value)
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" title={value}>
      {shortHex(value, chars)}
    </a>
  ) : (
    <span title={value}>{shortHex(value, chars)}</span>
  )
}

export function SwapExplainer() {
  const cfg = POOL_CONFIG
  const pool = usePoolState(cfg)
  if (!cfg) return null
  const p = pool.data
  const dec0 = cfg.stableIsCurrency0 ? (p?.stableDecimals ?? 6) : (p?.fundDecimals ?? 18)
  const dec1 = cfg.stableIsCurrency0 ? (p?.fundDecimals ?? 18) : (p?.stableDecimals ?? 6)
  // priceFromSqrt gives whole currency0 per whole currency1; the line always reads "1 fund token costs x stable".
  const price = p ? (cfg.stableIsCurrency0 ? priceFromSqrt(p.sqrtPriceX96, dec0, dec1) : 1 / priceFromSqrt(p.sqrtPriceX96, dec0, dec1)) : undefined
  const registryMatches = p ? p.checkerRegistry.toLowerCase() === REGISTRY.toLowerCase() : undefined
  return (
    <div className="swap-panel" data-testid="swap-panel">
      <div>
        <h3>The pool, as the chain sees it</h3>
        <dl className="kv">
          <dt>Pool id</dt>
          <dd title={cfg.poolId}>{shortHex(cfg.poolId, 8)}</dd>
          <dt>Currencies</dt>
          <dd>
            <Addr value={cfg.adapter} /> (PermissionsAdapter, wraps {p?.fundSymbol ?? 'the fund token'}) and <Addr value={cfg.stable} /> ({p?.stableSymbol ?? 'demo stable'})
          </dd>
          <dt>Fee, tick spacing</dt>
          <dd>
            {(cfg.key.fee / 10_000).toFixed(2)} percent, {cfg.key.tickSpacing}
          </dd>
          <dt>Hook</dt>
          <dd>
            <Addr value={cfg.permissionedHooks} /> PermissionedHooks{p ? (p.hookAllowed ? ', allowed on the adapter' : ', not allowed on the adapter') : ''}
          </dd>
          <dt>Checker</dt>
          <dd>
            {p ? <Addr value={p.checker} /> : '…'} EudiAllowlistChecker, reads {p ? <Addr value={p.checkerRegistry} /> : '…'}
            {registryMatches === false ? ' (not this app’s registry)' : registryMatches ? ' (this app’s registry)' : ''}
          </dd>
          <dt>Policy, bits</dt>
          <dd>{p ? `${shortHex(p.checkerPolicyId, 6)}, 0x${p.checkerRequiredBits.toString(16)}` : '…'}</dd>
          <dt>Liquidity</dt>
          <dd data-testid="pool-liquidity">
            {p ? `${p.liquidity.toString()} (${formatUnits(p.wrappedInPool, p.fundDecimals).replace(/(\.\d{2})\d+$/, '$1')} ${p.fundSymbol}, ${formatUnits(p.stableInPool, p.stableDecimals).replace(/(\.\d{2})\d+$/, '$1')} ${p.stableSymbol} in the PoolManager)` : '…'}
          </dd>
          <dt>Price</dt>
          <dd>{p && price !== undefined ? `1 ${p.fundSymbol} = ${price.toFixed(4)} ${p.stableSymbol} (tick ${p.tick})` : '…'}</dd>
          <dt>Swapping</dt>
          <dd>{p ? (p.swappingEnabled ? 'enabled by the adapter owner' : 'disabled by the adapter owner') : '…'}</dd>
          <dt>Router</dt>
          <dd>
            <Addr value={cfg.universalRouter} /> permissioned Universal Router{p ? (p.routerAllowed ? ', allowed wrapper' : ', not an allowed wrapper') : ''}
          </dd>
        </dl>
      </div>
      <div>
        <h3>How the permissioned pool decides</h3>
        <ol>
          <li>
            <b>PermissionsAdapterFactory</b> (Uniswap, on Sepolia) created the <b>PermissionsAdapter</b>: a wrapped, virtual form of the fund token that is the pool's currency. The pool never holds the fund token itself; the adapter does.
          </li>
          <li>
            <b>PermissionedHooks</b> runs before every swap and every liquidity change. It asks the caller for the account behind the call and asks the adapter whether that account is SWAP_ALLOWED (or LIQUIDITY_ALLOWED). No: the hook reverts with Unauthorized, which the PoolManager reports as WrappedError.
          </li>
          <li>
            The adapter answers from its <b>IAllowlistChecker</b>, one view function: checkAllowlist(account, token) returns a bytes2 of flags. Our <b>EudiAllowlistChecker</b> answers from one fact only, registry.isEligible(account, policyId, requiredBits): true gives swap and liquidity, false gives no flags. It has no owner, no list of its own, no setter.
          </li>
          <li>
            The registry holds a policy id, predicate bits, a tier and an expiry against an address, and the issuer's approval. No identity documents on chain, and nothing we could use to find her.
          </li>
          <li>
            The swap enters through the permissioned <b>Universal Router</b> (an allowed wrapper), which pulls the stable through Permit2. On the way out the adapter unwraps the virtual token into the fund token, whose transfer check reads the registry once more. One revoke by the issuer closes this door and Subscribe at the same time (manual revocation).
          </li>
        </ol>
        <p className="caption">Quote note: the V4Quoter deployed next to these contracts cannot quote this pool, because the hook asks its caller for msgSender() and the quoter has none; the estimate above comes from slot0 and liquidity.</p>
      </div>
    </div>
  )
}
