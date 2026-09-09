/**
 * Receipts of the transactions this app sent, in memory, newest first. The investor's History step
 * and the issuer console read them; a reload forgets them (the chain's event log does not).
 */
import { useSyncExternalStore } from 'react'
import type { Address, Hex } from 'viem'

export type ReceiptKind = 'attestByOperator' | 'approve' | 'revoke' | 'subscribe'

export interface Receipt {
  kind: ReceiptKind
  hash: Hex
  /** Address the transaction is about: the subject for registry calls, the subscriber for subscribe. */
  subject?: Address
  /** Address that signed it. */
  from?: Address
  at: number
}

let receipts: Receipt[] = []
const listeners = new Set<() => void>()

export function addReceipt(r: Receipt) {
  receipts = [r, ...receipts]
  for (const l of listeners) l()
}

export function useReceipts(): Receipt[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => receipts,
  )
}

export const RECEIPT_LABEL: Record<ReceiptKind, string> = {
  attestByOperator: 'Attested by operator',
  approve: 'Approved',
  revoke: 'Revoked',
  subscribe: 'Subscribed',
}
