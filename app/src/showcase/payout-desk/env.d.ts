/**
 * Payout desk showcase (WP38). Declaration merging keeps src/vite-env.d.ts untouched; delete this
 * directory and the variables are gone.
 */
interface ImportMetaEnv {
  /** Base URL of the payout desk service (showcase/payout-desk). Default http://127.0.0.1:8792. */
  readonly VITE_PAYOUT_DESK_URL?: string
  /** Bearer token of officer A (default "officer-a"). */
  readonly VITE_PAYOUT_DESK_TOKEN_A?: string
  /** Bearer token of officer B (default "officer-b"). */
  readonly VITE_PAYOUT_DESK_TOKEN_B?: string
}
