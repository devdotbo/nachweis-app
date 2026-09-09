/** One PrivyClient for the process (AUTOMATION_SIGNER=privy). The authorization key never leaves this module. */
import { PrivyClient } from '@privy-io/node'
import type { Config } from './config'

let client: PrivyClient | undefined

export function privyClient(cfg: Config): PrivyClient {
  if (!cfg.privy) throw new Error('AUTOMATION_SIGNER is not privy')
  if (!client) client = new PrivyClient({ appId: cfg.privy.appId, appSecret: cfg.privy.appSecret })
  return client
}

/** Signs wallet requests as the delegated signer (the key quorum PRIVY_SIGNER_ID). */
export function authorizationContext(cfg: Config): { authorization_private_keys: string[] } {
  if (!cfg.privy) throw new Error('AUTOMATION_SIGNER is not privy')
  return { authorization_private_keys: [cfg.privy.authorizationKey] }
}
