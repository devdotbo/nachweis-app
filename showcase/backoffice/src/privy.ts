/** One Privy client per process (privy mode only). Keys are looked up per role, never logged. */
import { PrivyClient } from '@privy-io/node'
import type { Config } from './config'
import type { Role } from './types'

let client: PrivyClient | undefined

export function privyClient(cfg: Config): PrivyClient {
  if (!cfg.privy) throw new Error('privy client requested in local mode')
  client ??= new PrivyClient({ appId: cfg.privy.appId, appSecret: cfg.privy.appSecret })
  return client
}

/** The authorization private keys of the confirming officers, in the order given. */
export function keysFor(cfg: Config, signers: Role[]): string[] {
  if (!cfg.privy) throw new Error('authorization keys requested in local mode')
  const byRole: Record<Role, string> = { compliance: cfg.privy.complianceKey, operations: cfg.privy.operationsKey }
  return signers.map((r) => byRole[r])
}
