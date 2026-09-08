// Native pre-check of the proved statement. The implementation moved to shared/pid/statement.ts
// (Uint8Array and WebCrypto only) so the web app's browser prover runs the same checks; this
// module keeps the companion's Buffer-typed surface.
import { issuerKeyFromX5c as issuerKeyFromX5cShared } from "../../shared/pid/statement";

export { checkKbFreshness, StatementError, verifyPresentation, type StatementInput, type Verified } from "../../shared/pid/statement";

/// Issuer key (SEC1) from the x5c leaf in the issuer JWT header.
export function issuerKeyFromX5c(issuerJwt: string): Buffer {
  return Buffer.from(issuerKeyFromX5cShared(issuerJwt));
}
