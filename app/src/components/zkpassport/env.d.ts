/**
 * zkPassport route (WP33). Declaration merging keeps src/vite-env.d.ts untouched; delete this
 * directory and the flag is gone.
 */
interface ImportMetaEnv {
  /** 1 enables the "Passport chip (zkPassport)" evidence card in the investor flow. Off by default. */
  readonly VITE_ZKPASSPORT?: string
  /** Hostname the SDK request is created for; must equal ZkPassportVerifier.DOMAIN. Default: window.location.hostname. */
  readonly VITE_ZKPASSPORT_DOMAIN?: string
  /** Scope string of the request; must equal ZkPassportVerifier.SCOPE. Default "attestat-over18". */
  readonly VITE_ZKPASSPORT_SCOPE?: string
  /** 1 accepts mock passports of the app's developer mode; must equal ZkPassportVerifier.DEV_MODE. */
  readonly VITE_ZKPASSPORT_DEV_MODE?: string
  /** Seconds the root verifier accepts a proof after generation; must equal ZkPassportVerifier.VALIDITY_SECONDS. Default 7 days. */
  readonly VITE_ZKPASSPORT_VALIDITY?: string
  /** Seconds the decision lives after the proof date; must equal ZkPassportVerifier.DECISION_TTL. Default 30 days. */
  readonly VITE_ZKPASSPORT_DECISION_TTL?: string
}
