/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERIFIER_URL?: string
  readonly VITE_VERIFIER_MODE?: string
  readonly VITE_BRIDGE_URL?: string
  readonly VITE_REGISTRY?: string
  readonly VITE_FUND_TOKEN?: string
  readonly VITE_SUBSCRIPTION?: string
  readonly VITE_POOL?: string
  readonly VITE_POLICY_ID?: string
  readonly VITE_REQUIRED_BITS?: string
  readonly VITE_RPC_URL?: string
  readonly VITE_CHAIN_ID?: string
  readonly VITE_MOCK?: string
  /** Dev signer (local only): investor key. See src/lib/devSigner.ts. */
  readonly VITE_DEV_PRIVATE_KEY?: string
  /** Dev signer (local only): operator key for the issuer role. */
  readonly VITE_DEV_OPERATOR_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Set by vite.config.ts: true only when a VITE_DEV_* key is present at build time. */
declare const __NACHWEIS_DEV_SIGNER__: boolean
