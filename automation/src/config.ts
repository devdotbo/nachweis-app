/** Environment of the automation (automation/.env.example documents every name). Secrets are never logged. */
import { getAddress, keccak256, stringToBytes, type Address, type Hex } from 'viem'

export type SignerMode = 'privy' | 'local'

export interface Config {
  signer: SignerMode
  rpcUrl: string
  chainId: number
  registry: Address
  subscription: Address
  fundToken?: Address
  policyId: Hex
  startBlock?: bigint
  pollMs: number
  port: number
  privy?: { appId: string; appSecret: string; authorizationKey: string; signerId: string }
  localKeys: Hex[]
}

const ZERO = '0x0000000000000000000000000000000000000000'

function address(name: string, required: boolean): Address | undefined {
  const v = process.env[name]?.trim()
  if (!v || v === ZERO) {
    if (required) throw new Error(`${name} is not set`)
    return undefined
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} is not an address`)
  return getAddress(v)
}

function required(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is not set (AUTOMATION_SIGNER=privy needs it)`)
  return v
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const signer: SignerMode = env.AUTOMATION_SIGNER === 'privy' ? 'privy' : 'local'
  const chainId = env.CHAIN_ID && /^\d+$/.test(env.CHAIN_ID) ? Number(env.CHAIN_ID) : signer === 'privy' ? 11155111 : 31337
  const policyId: Hex = env.POLICY_ID && /^0x[0-9a-fA-F]{64}$/.test(env.POLICY_ID) ? (env.POLICY_ID as Hex) : keccak256(stringToBytes('nachweis.pid.over18.v1'))
  const cfg: Config = {
    signer,
    rpcUrl: env.RPC_URL?.trim() || 'http://127.0.0.1:8545',
    chainId,
    registry: address('REGISTRY', true)!,
    subscription: address('SUBSCRIPTION', true)!,
    fundToken: address('FUND_TOKEN', false),
    policyId,
    startBlock: env.START_BLOCK && /^\d+$/.test(env.START_BLOCK) ? BigInt(env.START_BLOCK) : undefined,
    pollMs: env.POLL_MS && /^\d+$/.test(env.POLL_MS) ? Number(env.POLL_MS) : 4000,
    port: env.PORT && /^\d+$/.test(env.PORT) ? Number(env.PORT) : 8790,
    localKeys: [],
  }
  if (signer === 'privy') {
    cfg.privy = {
      appId: required('PRIVY_APP_ID'),
      appSecret: required('PRIVY_APP_SECRET'),
      authorizationKey: required('PRIVY_AUTHORIZATION_KEY').replace(/^wallet-auth:/, ''),
      signerId: required('PRIVY_SIGNER_ID'),
    }
  } else {
    const keys = (env.LOCAL_INVESTOR_KEYS ?? '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d').split(',').map((k) => k.trim()).filter(Boolean)
    for (const k of keys) if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('LOCAL_INVESTOR_KEYS holds a value that is not a 32-byte hex key')
    cfg.localKeys = keys as Hex[]
  }
  return cfg
}
