/**
 * The attested savings plan (wiki/privy-cases/lifecycle/case.md, docs/showcase/savings-plan.md): one
 * investor's eligibility decision in the centre, four doors around it that each read it live: the
 * recurring plan (WP32's automation), a second issuer's instrument, the permissioned pool's checker,
 * and a transfer to a second attested wallet. The beats below revoke, reopen and (on a local chain)
 * expire the decision; every door follows within one poll.
 */
import { formatUnits, isAddress, parseUnits, type Address } from 'viem'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ConnectCard } from '../../components/ConnectCard'
import { StandingOrderCard } from '../../components/StandingOrderCard'
import { TxHash } from '../../components/TxLine'
import { AUTOMATION_URL, FUND_TOKEN, POLICY_ID, PRIVY_APP_ID, REGISTRY, REQUIRED_BITS } from '../../config'
import { automation, useAutomationPoll } from '../../lib/automation'
import { useDecision, useEligible, useRegistryStatus } from '../../lib/chain'
import { bitFlags, formatExpiry, shortAddress, shortHex, tierLabel } from '../../lib/format'
import { useWallet, type Wallet } from '../../lib/wallet'
import { CHECKER, FUND_TOKEN_B, SECOND_WALLET, SUBSCRIPTION_B, UNATTESTED_WALLET } from './config'
import { LOCAL_CHAIN, OPERATOR_ON_BOARD, useBalanceOf, useCheckerFlags, useDemoAmountB, useEligibleOf, useInvestorWrites, useOperatorBeats, useTokenBGate, type BeatState } from './hooks'

/** Section 8 of the case, verbatim. */
export const SENTENCES = {
  testWallet: 'Official test wallet, sample identity.',
  nothingToFind: 'No identity documents on chain, and nothing we could use to find her.',
  proofWhere: 'Proof made in your browser tab on this computer.',
  demoSubscription: 'Demo subscription: mints fund tokens, no payment.',
  secondInvestor: 'Second investor attested by the operator for the demo.',
  expiryLocal: 'Expiry demonstrated on a local chain.',
  manual: 'Manual: issuer revokes; issuer reopens.',
  issuerB: 'Issuer B accepts the eligibility decision as its on-chain gate; its own customer file is its own duty.',
  privyConnect: 'Wallet by Privy: an embedded wallet created at email sign-in, so an investor without a crypto wallet can hold the fund token. Your identity evidence never goes to Privy; Privy sees an address and the transactions you sign or allow. Sample identity from the official test wallet; testnet funds.',
  privyPlan: "Savings plan: you allow the issuer's key to send only `subscribe()` from your wallet, bounded by a Privy policy and re-checked on chain at every run. Stop it here at any time; the issuer's revoke stops it too. Privy's docs say the signer never sees your key (their statement, not ours).",
} as const

function Door({ id, title, open, children }: { id: string; title: string; open: boolean | undefined; children: ReactNode }) {
  const cls = open === undefined ? '' : open ? ' open' : ' closed'
  return (
    <div className={`door ${id}${cls}`} data-testid={`door-${id}`}>
      <div className="head">
        <h3>{title}</h3>
        <span className={`status ${open === undefined ? 'idle' : open ? 'open' : 'closed'}`}>{open === undefined ? 'no wallet' : open ? 'open' : 'closed'}</span>
      </div>
      {children}
    </div>
  )
}

function BeatLine({ beat }: { beat: BeatState }) {
  if (beat.status === 'idle') return null
  if (beat.status === 'pending')
    return (
      <p className="txline">
        <span className="status waiting">pending</span>
        <span className="muted">{beat.label}</span>
      </p>
    )
  if (beat.status === 'done')
    return (
      <p className="txline">
        <span className="status open">confirmed</span>
        <span className="muted">{beat.label}</span> {beat.hash !== '0x' ? <TxHash hash={beat.hash} /> : null}
      </p>
    )
  return (
    <p className="txline">
      <span className="status closed">refused</span>
      <span className="muted">{beat.label}:</span> <span className="err">{beat.message.split('\n')[0]}</span>
    </p>
  )
}

function ndf(v: bigint | undefined, symbol = 'NDF'): string {
  return v === undefined ? '…' : `${formatUnits(v, 18)} ${symbol}`
}

export function SavingsPlanBoard({ wallet }: { wallet: Wallet }) {
  const address = wallet.address
  const { decision } = useDecision(address)
  const status = useRegistryStatus(address)
  const eligible = useEligible(address)
  const open = address ? Boolean(eligible) : undefined

  // (a) the plan: WP32's automation, its policy for this address and the run history
  const { data: policy, error: policyError } = useAutomationPoll(() => (address ? automation.policy(address) : Promise.resolve(undefined)), [address], 4000)
  const { data: runs, refresh: refreshRuns } = useAutomationPoll(() => (address ? automation.runs(address) : Promise.resolve(undefined)), [address], 4000)
  const [ticking, setTicking] = useState(false)
  const [tickError, setTickError] = useState<string>()
  const runMonth = async () => {
    if (!address) return
    setTicking(true)
    setTickError(undefined)
    try {
      await automation.tick({ address })
    } catch (e) {
      setTickError(e instanceof Error ? e.message : String(e))
    } finally {
      setTicking(false)
      refreshRuns()
    }
  }
  const planOpen = address === undefined ? undefined : Boolean(open && policy && policy.delegated && !policy.denyAll)
  const planAmount = runs?.planAmount ? formatUnits(BigInt(runs.planAmount), 18) : undefined

  // (b) Issuer B's instrument
  const gateB = useTokenBGate()
  const balanceB = useBalanceOf(FUND_TOKEN_B, address)
  const amountB = useDemoAmountB()
  const sameRegistry = gateB.registry !== undefined && gateB.registry.toLowerCase() === REGISTRY.toLowerCase() && gateB.policyId === POLICY_ID

  // (c) the pool door: the checker's answer, or the registry read it makes
  const flags = useCheckerFlags(address)
  const poolOpen = address === undefined ? undefined : CHECKER ? (flags === undefined ? undefined : flags !== '0x0000') : open

  // (d) transfer to a second wallet
  const [recipient, setRecipient] = useState<string>(SECOND_WALLET ?? '')
  const [amount, setAmount] = useState<string>('20')
  const recipientAddress = isAddress(recipient) ? (recipient as Address) : undefined
  const recipientEligible = useEligibleOf(recipientAddress)
  const balanceA = useBalanceOf(FUND_TOKEN, address)
  const balanceR = useBalanceOf(FUND_TOKEN, recipientAddress)
  const writes = useInvestorWrites(address)
  const ops = useOperatorBeats()
  useEffect(() => {
    writes.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])
  let amountWei: bigint | undefined
  try {
    amountWei = parseUnits(amount || '0', 18)
  } catch {
    amountWei = undefined
  }
  const transferOpen = address === undefined ? undefined : Boolean(open && recipientAddress && recipientEligible)

  // Not eligible with approval, no revoke and the bits present leaves one cause: the chain's clock passed the expiry (the browser clock may differ on anvil).
  const decisionChip = !address ? 'no wallet' : eligible ? 'eligible' : status.revoked ? 'revoked' : !status.hasDecision ? 'no decision' : !status.approved ? 'awaiting approval' : (decision.bits & REQUIRED_BITS) !== REQUIRED_BITS ? 'bits missing' : 'expired'

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>The attested savings plan</h1>
          <p className="sub">
            One eligibility decision on chain, four doors that read it at every purchase, transfer or swap. The doors open together, close together on one revoke, and close on expiry. {SENTENCES.testWallet} {SENTENCES.nothingToFind}
          </p>
        </div>
      </div>

      <ConnectCard wallet={wallet} title="Investor A" lead="The wallet that carries the decision: the plan, Issuer B's instrument, the pool and the transfer all run from this one address. Attested and approved in the investor portal or by the operator; nothing here creates evidence." />
      {PRIVY_APP_ID ? <p className="caption">{SENTENCES.privyConnect}</p> : null}

      <section className="card" id="board">
        <h2>One decision, four doors</h2>
        <p className="lead">
          Every door asks the AttestationRegistry the same question, isEligible(address, policyId, bits): approved, not revoked, not expired, the bits present. Nothing else is stored about the investor. {address && !status.hasDecision ? 'This wallet has no decision yet: attest it in the investor portal, or with the operator beat below.' : ''}
        </p>
        <div className="board">
          <Door id="plan" title="Recurring plan" open={planOpen}>
            <p className="hint">
              The issuer's automation sends subscribe() from this wallet under a policy copied from the decision (WP32). {planAmount ? `Each run mints ${planAmount} NDF. ` : ''}
              {SENTENCES.demoSubscription}
            </p>
            {!AUTOMATION_URL ? <p className="hint">No automation configured (VITE_AUTOMATION_URL): the plan door reads only the registry.</p> : null}
            {policyError ? <p className="err">automation: {policyError}</p> : null}
            {AUTOMATION_URL && address && !policy && !policyError ? <p className="hint">No policy yet: the automation creates it when the registry emits Approved for this address.</p> : null}
            {policy ? (
              <p className="hint">
                Policy <code>{policy.policyId}</code>: signer <span className={`status ${policy.delegated ? 'open' : 'idle'}`}>{policy.delegated ? 'delegated' : 'not delegated'}</span>
                {policy.denyAll ? (
                  <>
                    {' '}
                    <span className="status closed">deny-all rule</span>
                  </>
                ) : null}
                {policy.expiry ? ` Denies every request once the clock passes ${formatExpiry(BigInt(policy.expiry))}.` : ''}
              </p>
            ) : null}
            <button type="button" className="btn btn-mint btn-sm" onClick={runMonth} disabled={!address || !AUTOMATION_URL || ticking}>
              {ticking ? 'Running' : 'Run the month'}
            </button>
            {tickError ? <p className="err">{tickError}</p> : null}
            {runs && runs.runs.length > 0 ? (
              <ol className="runs" data-testid="plan-runs">
                {[...runs.runs].reverse().map((r) => (
                  <li key={r.n}>
                    <span className="n">#{r.n}</span>
                    <span className={`status ${r.outcome === 'ok' ? 'open' : r.outcome === 'no-delegated-wallet' ? 'idle' : 'closed'}`}>{r.outcome === 'ok' ? 'subscribed' : r.outcome === 'denied-policy' ? 'refused by the policy' : r.outcome === 'denied-chain' ? 'refused by the chain' : r.outcome}</span>
                    {r.hash ? <TxHash hash={r.hash} chars={5} /> : null}
                    <span className="muted">{r.detail.length > 90 ? `${r.detail.slice(0, 90)}…` : r.detail}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="hint">Scheduler tick: simulated by the Run the month button (or PLAN_INTERVAL_SECS on the automation). Balance: {ndf(balanceA)}.</p>
          </Door>

          <div className="decision" data-testid="decision">
            <h3>
              The decision
              <span className={`status ${eligible ? 'open' : address ? 'closed' : 'idle'}`}>{decisionChip}</span>
            </h3>
            <dl className="kv">
              <dt>Subject</dt>
              <dd>{address ? shortAddress(address) : '…'}</dd>
              <dt>Policy</dt>
              <dd>{shortHex(POLICY_ID, 6)}</dd>
              <dt>Bits</dt>
              <dd>
                <span className="flags">
                  {bitFlags(decision.bits)
                    .slice(0, 2)
                    .map((f) => (
                      <span key={f.label} className={`flag${f.on ? ' on' : ''}`}>
                        {f.label}
                      </span>
                    ))}
                </span>
              </dd>
              <dt>Tier</dt>
              <dd>{tierLabel(decision.tier)}</dd>
              <dt>Expiry</dt>
              <dd>{formatExpiry(decision.expiry)}</dd>
              <dt>Approved</dt>
              <dd>{status.approved ? 'yes' : 'no'}</dd>
              <dt>Revoked</dt>
              <dd>{status.revoked ? 'yes' : 'no'}</dd>
            </dl>
            <p className="muted">Registry {shortAddress(REGISTRY)}. No name, no document, no reference to a person: a policy id, predicate bits, a tier, an expiry and a status reference against this address.</p>
          </div>

          <Door id="issuerb" title="Issuer B's instrument" open={address === undefined ? undefined : Boolean(open && FUND_TOKEN_B)}>
            {FUND_TOKEN_B ? (
              <>
                <p className="hint">
                  {gateB.symbol ?? 'NDF-B'} at <code>{shortAddress(FUND_TOKEN_B)}</code>, a second issuer's fund token. Its transfer check reads {sameRegistry ? 'the same registry and policy id' : gateB.registry ? `registry ${shortAddress(gateB.registry)}` : 'its registry'}; no allowlist of its own. {SENTENCES.issuerB}
                </p>
                <button type="button" className="btn btn-blue btn-sm" onClick={writes.subscribeB} disabled={!address || !SUBSCRIPTION_B || writes.beat.status === 'pending'}>
                  {SUBSCRIPTION_B ? `Subscribe with Issuer B${amountB !== undefined ? ` (${formatUnits(amountB, 18)} ${gateB.symbol ?? 'NDF-B'})` : ''}` : 'no Subscription B configured'}
                </button>
                <p className="hint">
                  Balance: {ndf(balanceB, gateB.symbol ?? 'NDF-B')}. {SENTENCES.demoSubscription}
                </p>
              </>
            ) : (
              <p className="hint">No second issuer configured (VITE_FUND_TOKEN_B, VITE_SUBSCRIPTION_B): deploy contracts/script/DeploySecondIssuer.s.sol against the same registry.</p>
            )}
          </Door>

          <Door id="pool" title="Permissioned pool" open={poolOpen}>
            {CHECKER ? (
              <p className="hint">
                EudiAllowlistChecker <code>{shortAddress(CHECKER)}</code>, the contract the Uniswap v4 PermissionsAdapter calls before every swap: checkAllowlist(this wallet, NDF) = <code>{flags ?? '…'}</code>
                {flags === undefined ? '' : flags === '0x0000' ? ' (no swap, no liquidity).' : ' (swap and liquidity allowed).'} The swap itself is sent against the pool on Sepolia by the SwapPermissioned script; here the door is the checker's own answer.
              </p>
            ) : (
              <p className="hint">The pool's allowlist checker answers from one read, isEligible on this registry; no checker address is configured here (VITE_CHECKER), so this door shows that read. The swap itself is sent against the pool on Sepolia by the SwapPermissioned script.</p>
            )}
          </Door>

          <Door id="transfer" title="Transfer to a second wallet" open={transferOpen}>
            <p className="hint">
              FundToken's transfer check asks isEligible for the recipient. {SENTENCES.secondInvestor} Recipient{' '}
              {recipientAddress ? <span className={`status ${recipientEligible ? 'open' : 'closed'}`}>{recipientEligible === undefined ? '…' : recipientEligible ? 'attested' : 'not eligible'}</span> : <span className="status idle">enter an address</span>}
            </p>
            <div className="field">
              <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="0x recipient" aria-label="Recipient" />
              <input className="input" style={{ minWidth: 80, flex: '0 0 90px' }} value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-label="Amount NDF" />
            </div>
            <div className="row">
              <button type="button" className="btn btn-blue btn-sm" onClick={() => recipientAddress && amountWei !== undefined && writes.transfer(recipientAddress, amountWei)} disabled={!address || !recipientAddress || amountWei === undefined || writes.beat.status === 'pending'}>
                Transfer {amount || '0'} NDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecipient(UNATTESTED_WALLET)} disabled={!address}>
                Use an unattested address
              </button>
              {SECOND_WALLET ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecipient(SECOND_WALLET ?? '')} disabled={!address}>
                  Use the second wallet
                </button>
              ) : null}
            </div>
            <p className="hint">
              Sender {ndf(balanceA)}. Recipient {recipientAddress ? ndf(balanceR) : '…'}.
            </p>
          </Door>
        </div>
        <BeatLine beat={writes.beat} />
      </section>

      {PRIVY_APP_ID && AUTOMATION_URL ? (
        <>
          <StandingOrderCard address={address} wallet={wallet} />
          <p className="caption">{SENTENCES.privyPlan}</p>
        </>
      ) : null}

      <section className="card" id="beats">
        <h2>Revoke, reopen, expire</h2>
        <p className="lead">
          One transaction from the operator key changes the decision; every door above reads the change on its next poll. {SENTENCES.manual}
        </p>
        {OPERATOR_ON_BOARD ? (
          <div className="beats">
            <div className="beat">
              <h3>Revoke</h3>
              <p className="hint">registry.revoke(investor, policyId): the plan's next run, Issuer B's subscribe, the checker and a transfer to this wallet all refuse.</p>
              <button type="button" className="btn btn-coral btn-sm" onClick={() => address && ops.revoke(address)} disabled={!address || ops.beat.status === 'pending'}>
                Revoke Investor A
              </button>
            </div>
            <div className="beat">
              <h3>Reopen</h3>
              <p className="hint">registry.approve(investor, policyId) clears revoked and sets approved again; the automation removes its deny-all rule.</p>
              <button type="button" className="btn btn-mint btn-sm" onClick={() => address && ops.approve(address)} disabled={!address || ops.beat.status === 'pending'}>
                Re-approve Investor A
              </button>
            </div>
            <div className="beat">
              <h3>Expiry</h3>
              <p className="hint">{LOCAL_CHAIN ? `Moves anvil's clock to one minute past this decision's expiry (evm_increaseTime, ${formatExpiry(decision.expiry)}); a decision whose expiry is behind the clock closes every door. ${SENTENCES.expiryLocal}` : `${SENTENCES.expiryLocal} This chain's clock cannot be moved; the decision expires at ${formatExpiry(decision.expiry)}.`}</p>
              <button type="button" className="btn btn-yellow btn-sm" onClick={() => ops.warp(decision.expiry)} disabled={!LOCAL_CHAIN || !status.hasDecision || ops.beat.status === 'pending'}>
                Move the clock past the expiry
              </button>
            </div>
            <div className="beat">
              <h3>Attest by operator</h3>
              <p className="hint">attestByOperator for the wallet in the recipient field (or Investor A when it is empty): evidence and approval in one step, no proof. {SENTENCES.secondInvestor} After a revoke, only the operator reopens.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => (recipientAddress ?? address) && ops.attest((recipientAddress ?? address) as Address)} disabled={!(recipientAddress ?? address) || ops.beat.status === 'pending'}>
                Attest {recipientAddress ? shortAddress(recipientAddress) : address ? 'Investor A' : '…'}
              </button>
            </div>
          </div>
        ) : (
          <p className="note">
            The operator key is not in this build. Revoke and re-approve from the <Link to="/issuer">issuer console</Link>; this board reads the doors again within a few seconds. {SENTENCES.expiryLocal}
          </p>
        )}
        <BeatLine beat={ops.beat} />
      </section>

      <section className="card" id="honesty">
        <h2>What this demo is</h2>
        <ul className="honesty">
          <li>{SENTENCES.testWallet}</li>
          <li>{SENTENCES.nothingToFind}</li>
          <li>Investor portal route: {SENTENCES.proofWhere}</li>
          <li>{SENTENCES.demoSubscription}</li>
          <li>{SENTENCES.secondInvestor}</li>
          <li>{SENTENCES.expiryLocal}</li>
          <li>{SENTENCES.manual}</li>
          <li>{SENTENCES.issuerB}</li>
          {AUTOMATION_URL && !PRIVY_APP_ID ? <li>Plan door without a Privy app: simulated Privy policy (local), a dev key signs on anvil and the rule JSON is applied by a small evaluator.</li> : null}
        </ul>
      </section>
    </main>
  )
}

/** The route entry (src/showcase/registry.ts): the board on the investor's wallet, as the investor portal connects it. */
export function SavingsPlanDemo() {
  return <SavingsPlanBoard wallet={useWallet('investor')} />
}
