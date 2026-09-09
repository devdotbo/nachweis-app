/**
 * zkPassport route (WP33): "Passport chip (zkPassport)" evidence card. Rendered by InvestorScreen only
 * when VITE_ZKPASSPORT=1. The investor scans the QR code with the zkPassport app, proves on the phone
 * that they are 18 or older with their passport chip and binds this wallet address and the chain into
 * the proof; the SDK verifies the proof against zkPassport's verifier contract; then this card sends
 * attestWithProof from the connected wallet. From there on the existing cards (status, doors, issuer
 * approval, revoke) see the same decision they see for the EUDI route.
 *
 * Submission goes straight from the wallet to the registry: attestWithProof is permissionless and the
 * proof binds the subject, so the bridge (service/) needs no new endpoint and stays untouched.
 */
import type { SupportedChain } from '@zkpassport/sdk'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePublicClient, useWriteContract } from 'wagmi'
import { CHAIN_ID, MOCK, POLICY_ID, REGISTRY } from '../../config'
import { registryAbi } from '../../lib/contracts'
import { shortHex } from '../../lib/format'
import type { TxState } from '../../lib/types'
import type { Wallet } from '../../lib/wallet'
import { TxLine } from '../TxLine'
import {
  ZKPASSPORT_CHAIN_NAMES,
  ZKPASSPORT_DECISION_TTL_SECONDS,
  ZKPASSPORT_DEV_MODE,
  ZKPASSPORT_DOMAIN,
  ZKPASSPORT_MIN_AGE,
  ZKPASSPORT_SCOPE,
  ZKPASSPORT_VALIDITY_SECONDS,
} from './config'
import { attestCall, decisionExpiry, proofTimestamp, uniqueIdentifier, type AttestCall, type SolidityParams } from './proof'

type Phase = 'idle' | 'requesting' | 'waiting' | 'received' | 'generating' | 'verifying' | 'proved' | 'rejected' | 'error'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  requesting: 'creating request',
  waiting: 'waiting for the zkPassport app',
  received: 'request opened on the phone',
  generating: 'proof being generated on the phone',
  verifying: 'proof received, SDK verifying it against the verifier contract',
  proved: 'proof verified',
  rejected: 'rejected in the app',
  error: 'failed',
}

interface Proved {
  params: SolidityParams
  call: AttestCall
  proofs: number
}

export function ZkPassportCard({ wallet }: { wallet: Wallet }) {
  const address = wallet.address
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string>()
  const [url, setUrl] = useState<string>()
  const [qr, setQr] = useState<string>()
  const [proved, setProved] = useState<Proved>()
  const [tx, setTx] = useState<TxState>({ status: 'idle' })
  const [txHash, setTxHash] = useState<`0x${string}`>()
  const alive = useRef(true)
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient()
  const chainName = ZKPASSPORT_CHAIN_NAMES[CHAIN_ID]

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!url) {
      setQr(undefined)
      return
    }
    let on = true
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#070B1F', light: '#FFFFFF' } })
      .then((d) => {
        if (on) setQr(d)
      })
      .catch((e: unknown) => setError(String(e)))
    return () => {
      on = false
    }
  }, [url])

  const start = useCallback(async () => {
    if (!address) return
    setError(undefined)
    setProved(undefined)
    setTx({ status: 'idle' })
    setTxHash(undefined)
    setPhase('requesting')
    try {
      // Loaded on demand: the SDK and its proving dependencies stay out of the page until this click.
      const { ZKPassport } = await import('@zkpassport/sdk')
      const domain = ZKPASSPORT_DOMAIN ?? window.location.hostname
      const zk = new ZKPassport(domain)
      const builder = await zk.request({
        name: 'Attestat',
        logo: `${window.location.origin}/favicon.svg`,
        purpose: `Prove you are ${ZKPASSPORT_MIN_AGE} or older and bind wallet ${shortHex(address, 6)}`,
        scope: ZKPASSPORT_SCOPE,
        mode: 'compressed-evm',
        devMode: ZKPASSPORT_DEV_MODE,
        validity: ZKPASSPORT_VALIDITY_SECONDS,
      })
      let query = builder.gte('age', ZKPASSPORT_MIN_AGE).bind('user_address', address)
      if (chainName) query = query.bind('chain', chainName as SupportedChain)
      const { url: requestUrl, onRequestReceived, onGeneratingProof, onProofGenerated, onResult, onReject, onError } = query.done()
      if (!alive.current) return
      setUrl(requestUrl)
      setPhase('waiting')
      onRequestReceived(() => alive.current && setPhase('received'))
      onGeneratingProof(() => alive.current && setPhase('generating'))
      let count = 0
      onProofGenerated(() => {
        count += 1
        if (alive.current) setPhase('verifying')
      })
      onReject(() => alive.current && setPhase('rejected'))
      onError((e) => {
        if (!alive.current) return
        setError(typeof e === 'string' ? e : String(e))
        setPhase('error')
      })
      onResult(({ verified, result, proofs, sdkInstance }) => {
        if (!alive.current) return
        if (!verified) {
          setError('the SDK could not verify the proof (mock passport without dev mode, wrong scope, or verifier unreachable)')
          setPhase('error')
          return
        }
        const over = (result as { age?: { gte?: { result?: boolean } } }).age?.gte?.result
        if (over !== true) {
          setError('the proof says the age condition does not hold')
          setPhase('error')
          return
        }
        const evm = proofs.find((p) => p.name?.startsWith('outer_evm'))
        if (!evm) {
          setError('no outer_evm proof in the result; the request must use mode compressed-evm')
          setPhase('error')
          return
        }
        const params = sdkInstance.getSolidityVerifierParameters({
          proof: evm,
          domain,
          scope: ZKPASSPORT_SCOPE,
          devMode: ZKPASSPORT_DEV_MODE,
          validityPeriodInSeconds: ZKPASSPORT_VALIDITY_SECONDS,
        }) as unknown as SolidityParams
        setProved({ params, call: attestCall(address, POLICY_ID, params), proofs: count || proofs.length })
        setPhase('proved')
      })
    } catch (e) {
      if (!alive.current) return
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [address, chainName])

  const submit = useCallback(async () => {
    if (!proved) return
    const { subject, decision, proof, publicInputs } = proved.call
    setTx({ status: 'pending', label: 'attestWithProof from your wallet' })
    try {
      const hash = await writeContractAsync({ address: REGISTRY, abi: registryAbi, functionName: 'attestWithProof', args: [subject, decision, proof, publicInputs] })
      if (client) await client.waitForTransactionReceipt({ hash })
      if (!alive.current) return
      setTxHash(hash)
      setTx({ status: 'done', hash })
    } catch (e) {
      if (!alive.current) return
      setTx({ status: 'error', message: e instanceof Error ? e.message.split('\n')[0] : String(e) })
    }
  }, [proved, writeContractAsync, client])

  const locked = !address
  const busy = phase === 'requesting' || phase === 'waiting' || phase === 'received' || phase === 'generating' || phase === 'verifying'
  return (
    <section className={`card${locked ? ' locked' : ''}`}>
      <h2>
        <span className="n">2</span>Passport chip (zkPassport)
      </h2>
      <p className="lead">
        Alternative evidence for people without an EUDI wallet: the zkPassport app reads the chip of your own biometric passport or ID card and proves on your phone that you are {ZKPASSPORT_MIN_AGE} or older, bound to this
        wallet. The proof is checked on chain by zkPassport&apos;s verifier contract; zkPassport&apos;s certificate registry decides which countries&apos; document signers are trusted. No name, birth date or document
        number leaves the phone.
      </p>
      {MOCK ? <p className="note">VITE_MOCK=1: the passport route needs a chain; nothing here is mocked.</p> : null}
      {!chainName ? <p className="note coral">Chain {CHAIN_ID} has no zkPassport name, so the chain cannot be bound and the adapter will refuse the proof. Use Sepolia or an anvil fork of Sepolia (chain id 11155111).</p> : null}
      <div className="row">
        <button type="button" className="btn btn-yellow" onClick={() => void start()} disabled={locked || busy || MOCK}>
          {busy ? 'Waiting for the app' : url ? 'New passport request' : 'Prove with the zkPassport app'}
        </button>
        {phase !== 'idle' ? <span className={`status ${phase === 'proved' ? 'open' : phase === 'error' || phase === 'rejected' ? 'closed' : 'waiting'}`}>{PHASE_LABEL[phase]}</span> : null}
      </div>
      {url && !proved ? (
        <div className="qr">
          {qr ? <img src={qr} alt="QR code for the zkPassport request" /> : <div className="empty">rendering QR</div>}
          <div>
            <p className="muted">Scan with the zkPassport app (App Store, Google Play), or open the link on the phone that has the app.</p>
            <a className="link" href={url} style={{ display: 'block', textDecoration: 'none', wordBreak: 'break-all' }}>
              {url}
            </a>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>request</dt>
              <dd>
                age at least {ZKPASSPORT_MIN_AGE}; bound to {address}
                {chainName ? ` on ${chainName}` : ''}
              </dd>
              <dt>scope</dt>
              <dd>
                {ZKPASSPORT_DOMAIN ?? window.location.hostname} / {ZKPASSPORT_SCOPE}
                {ZKPASSPORT_DEV_MODE ? ' (dev mode: mock passports accepted)' : ''}
              </dd>
            </dl>
          </div>
        </div>
      ) : null}
      {proved ? (
        <div className="sub" style={{ display: 'block' }}>
          <dl className="kv">
            <dt>proof</dt>
            <dd>
              version {shortHex(proved.params.version, 6)}, {(proved.params.proofVerificationData.proof.length - 2) / 2} bytes, {proved.params.proofVerificationData.publicInputs.length} public inputs, generated{' '}
              {new Date(Number(proofTimestamp(proved.params)) * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC
            </dd>
            <dt>document identifier</dt>
            <dd>
              <code>{shortHex(uniqueIdentifier(proved.params), 8)}</code> <span className="muted">(scoped to this site and scope; visible in the transaction, not stored by the registry)</span>
            </dd>
            <dt>decision</dt>
            <dd>
              bits 0x7 (identity evidence, over 18, passport chip route), expires {new Date(Number(decisionExpiry(proved.params)) * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC ({ZKPASSPORT_DECISION_TTL_SECONDS / 86400} days after
              the proof)
            </dd>
          </dl>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-blue" onClick={() => void submit()} disabled={tx.status === 'pending' || tx.status === 'done'}>
              {tx.status === 'done' ? 'Evidence on chain' : 'Send attestWithProof from this wallet'}
            </button>
            <TxLine tx={tx} />
          </div>
          {txHash ? <p className="muted">Evidence stored; the issuer approves it in the issuer console like any other decision.</p> : null}
        </div>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
    </section>
  )
}
