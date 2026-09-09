/** Environment of the savings-plan demo (docs/showcase/savings-plan.md). All optional; a missing address closes that door on screen. */
import type { Address } from 'viem'

const env = import.meta.env

function addressOf(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value) ? (value as Address) : undefined
}

/** Issuer B's instrument: FundToken B and its Subscription B (contracts/script/DeploySecondIssuer.s.sol). */
export const FUND_TOKEN_B = addressOf(env.VITE_FUND_TOKEN_B)
export const SUBSCRIPTION_B = addressOf(env.VITE_SUBSCRIPTION_B)
/** The pool's allowlist checker (EudiAllowlistChecker). Unset: the pool door shows the registry read the checker makes. */
export const CHECKER = addressOf(env.VITE_CHECKER)
/** Prefilled transfer recipients: a second wallet the operator attested for the demo, and one nobody attested. */
export const SECOND_WALLET = addressOf(env.VITE_SHOWCASE_SECOND_WALLET)
export const UNATTESTED_WALLET: Address = addressOf(env.VITE_SHOWCASE_UNATTESTED) ?? '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
