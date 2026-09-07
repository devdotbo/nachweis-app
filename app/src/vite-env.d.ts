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
  readonly VITE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
