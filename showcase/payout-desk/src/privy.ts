/** One PrivyClient for the process (PAYOUT_SIGNER=privy). The officers' authorization keys never leave this module. */
import { PrivyClient } from '@privy-io/node'
import type { Config } from './config'

let client: PrivyClient | undefined

export function privyClient(cfg: Config): PrivyClient {
  if (!cfg.privy) throw new Error('PAYOUT_SIGNER is not privy')
  if (!client) client = new PrivyClient({ appId: cfg.privy.appId, appSecret: cfg.privy.appSecret })
  return client
}

/**
 * Signs wallet requests as the treasury's owner quorum. With PRIVY_AUTHORIZATION_KEY_B set the quorum is 2-of-2 and
 * both officers' keys sign every request (Privy's TEE checks the threshold before it signs anything); with one key
 * the quorum is 1-of-1. `officers` narrows the set for the demonstration that one key alone is refused.
 */
export function authorizationContext(cfg: Config, officers: ('A' | 'B')[] = ['A', 'B']): { authorization_private_keys: string[] } {
  if (!cfg.privy) throw new Error('PAYOUT_SIGNER is not privy')
  const keys: string[] = []
  if (officers.includes('A')) keys.push(cfg.privy.keyA)
  if (officers.includes('B') && cfg.privy.keyB) keys.push(cfg.privy.keyB)
  return { authorization_private_keys: keys }
}
