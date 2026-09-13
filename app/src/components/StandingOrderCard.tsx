import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { AUTOMATION_URL, PRIVY_APP_ID, PRIVY_SIGNER_ID } from '../config'
import { automation, useAutomationPoll, type TickResultView } from '../lib/automation'
import { useRegistryStatus } from '../lib/chain'
import { formatExpiry } from '../lib/format'
import { usePrivyBridge } from '../lib/privyContext'
import type { Wallet } from '../lib/wallet'
import { TxHash } from './TxLine'

/**
 * The standing order (WP32, docs/privy-standing-order.md): the investor lets the issuer's automation
 * send subscribe() from her Privy embedded wallet under a policy the automation copied from her
 * on-chain decision. Rendered only with VITE_PRIVY_APP_ID and VITE_AUTOMATION_URL set.
 */
export function StandingOrderCard({ address, wallet }: { address?: Address; wallet: Wallet }) {
  const privy = usePrivyBridge()
  const status = useRegistryStatus(address)
  const queryClient = useQueryClient()
  // Set right after Allow or Remove signer: the next poll skips the automation's short cache of the wallet lookup.
  const freshRef = useRef(false)
  const { data: policy, error: policyError, refresh } = useAutomationPoll(
    () => {
      const fresh = freshRef.current
      freshRef.current = false
      return address ? automation.policy(address, fresh) : Promise.resolve(undefined)
    },
    [address],
    5000,
  )
  const [busy, setBusy] = useState<'allow' | 'run' | 'remove'>()
  const [error, setError] = useState<string>()
  const [results, setResults] = useState<TickResultView[]>()
  const [delegatedNow, setDelegatedNow] = useState<boolean>()
  // A fresh address (another sign-in) starts from the automation's view again.
  useEffect(() => {
    setDelegatedNow(undefined)
    setResults(undefined)
  }, [address])
  if (!PRIVY_APP_ID || !AUTOMATION_URL) return null

  const embedded = wallet.kind === 'privy'
  const delegated = delegatedNow ?? policy?.delegated ?? privy?.delegated ?? false
  const expiryText = policy?.expiry ? formatExpiry(BigInt(policy.expiry)) : status.expiry > 0n ? formatExpiry(status.expiry) : '<date>'

  const act = async (what: 'allow' | 'run' | 'remove', fn: () => Promise<void>) => {
    setBusy(what)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(undefined)
    }
  }
  const allow = () =>
    act('allow', async () => {
      if (!address || !policy || !privy) return
      if (!PRIVY_SIGNER_ID) throw new Error('VITE_PRIVY_SIGNER_ID is not set')
      const ok = await privy.addSigner(address, PRIVY_SIGNER_ID, policy.policyId)
      setDelegatedNow(ok)
      freshRef.current = true
      refresh()
    })
  const run = () =>
    act('run', async () => {
      if (!address) return
      const r = await automation.tick({ address })
      setResults(r)
      await queryClient.invalidateQueries()
      refresh()
    })
  const remove = () =>
    act('remove', async () => {
      if (!address || !privy) return
      await privy.removeSigners(address)
      setDelegatedNow(false)
      freshRef.current = true
      refresh()
    })

  return (
    <section className={`card${address ? '' : ' locked'}`} id="standing-order">
      <h2>Standing order</h2>
      <p className="lead">
        Let the issuer's automation subscribe for you every month, from this wallet, under a policy that is a copy of your on-chain decision: only this fund's Subscription contract, only until the decision expires, closed when the issuer revokes.
      </p>
      <p className="caption">
        Wallet by Privy: an embedded wallet created at sign-in (email or passkey). Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may send subscribe() for you to this fund until your decision expires on {expiryText}. When the issuer revokes your decision, its automation closes the policy; you can remove the signer here at any time. Sample identity from the official test wallet; testnet funds.
      </p>
      {!address ? <div className="empty">Sign in with email or passkey to see the standing order for your wallet.</div> : null}
      {address && !embedded ? <p className="note">The standing order runs on the embedded wallet by Privy. This connection is {wallet.connectorName ?? 'another wallet'}; sign in with email to use it.</p> : null}
      {address && policy === undefined && !policyError ? (
        <p className="note" data-testid="standing-order-no-policy">
          No policy yet. The issuer's automation creates it when the registry emits Approved for this address{status.revoked ? ' (the decision is revoked)' : status.approved ? '' : ' (awaiting issuer approval)'}.
        </p>
      ) : null}
      {policyError ? <p className="err">automation: {policyError}</p> : null}
      {policy ? (
        <>
          <dl className="connected">
            <dt>Policy</dt>
            <dd>
              <code>{policy.policyId}</code> <span className="muted">(signer {policy.signerId})</span>
            </dd>
            <dt>Rules</dt>
            <dd>
              <ol className="rules">
                {policy.plain.map((line, i) => (
                  <li key={i} className={policy.rules[i]?.action === 'DENY' ? 'deny' : 'allow'}>
                    <span className={`status ${policy.rules[i]?.action === 'DENY' ? 'closed' : 'open'}`}>{policy.rules[i]?.action}</span> {line}
                  </li>
                ))}
              </ol>
            </dd>
            <dt>Signer</dt>
            <dd>
              <span className={`status ${delegated ? 'open' : 'idle'}`}>{delegated ? 'delegated' : 'not delegated'}</span>{' '}
              <span className="muted">{delegated ? 'the issuer’s automation may sign under this policy' : 'only you can transact on this wallet'}</span>
            </dd>
          </dl>
          <div className="row">
            {!delegated ? (
              <button type="button" className="btn btn-blue" onClick={allow} disabled={!embedded || busy !== undefined || !PRIVY_SIGNER_ID}>
                {busy === 'allow' ? 'Waiting for Privy' : 'Allow'}
              </button>
            ) : null}
            <button type="button" className="btn btn-mint" onClick={run} disabled={busy !== undefined}>
              {busy === 'run' ? 'Running' : 'Run the month'}
            </button>
            {delegated ? (
              <button type="button" className="btn btn-ghost" onClick={remove} disabled={!embedded || busy !== undefined}>
                {busy === 'remove' ? 'Waiting for Privy' : 'Remove signer'}
              </button>
            ) : null}
          </div>
          <p className="caption">Stop it here at any time; the issuer's revoke stops it too.</p>
        </>
      ) : null}
      {results ? (
        <ul className="ticks" data-testid="tick-results">
          {results.map((r, i) => (
            <li key={i}>
              <span className={`status ${r.outcome === 'ok' ? 'open' : r.outcome === 'no-delegated-wallet' ? 'idle' : 'closed'}`}>{r.outcome === 'ok' ? 'subscribed' : r.outcome === 'denied-policy' ? 'refused by the policy' : r.outcome === 'denied-chain' ? 'refused by the chain' : r.outcome}</span>{' '}
              {r.hash ? <TxHash hash={r.hash} /> : null} <span className="muted">{r.detail}</span>
              {r.chain ? <span className="muted"> The chain: {r.chain.allows ? 'would allow subscribe()' : `refuses too (${r.chain.reason ?? 'revert'})`}, isEligible {String(r.chain.eligible)}.</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
      <p className="caption">
        Captions: scheduler tick: simulated by the Run the month button; demo fund: subscribe mints 100 NDF without payment; revocation: manual, by the issuer; the signer never sees the wallet's private key (Privy's statement).
      </p>
    </section>
  )
}
