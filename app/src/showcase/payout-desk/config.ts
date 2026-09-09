/**
 * Payout desk showcase (WP38): where the company screen finds its service and how it identifies the two officers.
 * Only VITE_PAYOUT_DESK_* is read here; shared config stays in src/config.ts.
 */
const env = import.meta.env

function text(v: string | undefined, fallback: string): string {
  return v && v !== '' ? v : fallback
}

/** Base URL of the bun service in showcase/payout-desk, without a trailing slash. */
export const PAYOUT_DESK_URL: string = text(env.VITE_PAYOUT_DESK_URL, 'http://127.0.0.1:8792').replace(/\/+$/, '')

export type Officer = 'A' | 'B'

/** Bearer tokens the service maps to officer A and B. Both live in the browser for the demo. */
export const OFFICER_TOKENS: Record<Officer, string> = {
  A: text(env.VITE_PAYOUT_DESK_TOKEN_A, 'officer-a'),
  B: text(env.VITE_PAYOUT_DESK_TOKEN_B, 'officer-b'),
}
