import type { TxState } from '../lib/types'
import { txUrl } from '../lib/explorer'
import { shortHex } from '../lib/format'

const PENDING_LABEL: Record<string, string> = {
  attestByOperator: 'attestByOperator, waiting for the receipt',
  approve: 'approve, waiting for the receipt',
  revoke: 'revoke, waiting for the receipt',
  subscribe: 'subscribe, waiting for the receipt',
}

/** A transaction hash, linked to the explorer when there is one for this chain. */
export function TxHash({ hash, chars = 8 }: { hash: string; chars?: number }) {
  const url = txUrl(hash)
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" title={hash}>
      {shortHex(hash, chars)}
    </a>
  ) : (
    <code title={hash}>{shortHex(hash, chars)}</code>
  )
}

export function TxLine({ tx }: { tx: TxState }) {
  switch (tx.status) {
    case 'idle':
      return null
    case 'pending':
      return (
        <p className="txline">
          <span className="status waiting">tx pending</span>
          <span className="muted">{PENDING_LABEL[tx.label] ?? tx.label}</span>
        </p>
      )
    case 'done':
      return (
        <p className="txline">
          <span className="status open">tx confirmed</span>
          <TxHash hash={tx.hash} />
        </p>
      )
    case 'error':
      return <p className="err">{tx.message}</p>
  }
}
