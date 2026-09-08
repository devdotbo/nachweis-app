// Native pre-check of the proved statement, the same rules as prover-sp1/lib `verify_presentation`
// plus `check_kb_freshness`: issuer ES256 under the issuer key, vct, every presented disclosure
// anchored in a signed `_sd` (top level or nested through an accepted disclosure), the
// age_equal_or_over.18 disclosure, the KB-JWT under cnf.jwk with typ kb+jwt, aud, sd_hash, and the
// nonce bound to the address. Runs in well under a second and fails with a readable reason before
// the proving step would. WebCrypto and Uint8Array only: bun (companion) and the browser share it.
import { b64urlDecode, b64urlEncode, hexEncode, latin1Encode, nonceOf, sha256, utf8Decode, type Bytes } from "./bytes";
import { publicKeyFromCertificate } from "./der";
import { es256Verify, jwkFromSec1, splitJws, type Jwk } from "./jose";

export interface StatementInput {
  presentation: string;
  issuerKeySec1: Uint8Array;
  expectedVct: string;
  expectedAud: string;
  boundAddress: Uint8Array; // 20 bytes
  challenge: Uint8Array; // 32 bytes
}

export interface Verified {
  over18: boolean;
  expiry: number; // issuer credential exp, 0 if absent
  kbExp?: number;
  kbIat?: number;
  kbNonce: string;
  issuerKeyHash: string; // hex, no 0x
  nonce: string; // hex, no 0x
  subject: string; // hex, no 0x
  disclosedClaimNames: string[]; // names only, never values
}

export class StatementError extends Error {}
const check = (cond: unknown, msg: string): void => {
  if (!cond) throw new StatementError(msg);
};

/// Issuer key (SEC1) from the x5c leaf in the issuer JWT header.
export function issuerKeyFromX5c(issuerJwt: string): Bytes {
  const { header } = splitJws(issuerJwt);
  const leaf = header?.x5c?.[0];
  check(typeof leaf === "string", "issuer header has no x5c");
  return publicKeyFromCertificate(b64urlDecode(leaf));
}

function collectSd(v: any, out: Set<string>): void {
  if (Array.isArray(v)) v.forEach((x) => collectSd(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "_sd" && Array.isArray(x)) x.forEach((d) => typeof d === "string" && out.add(d));
      else collectSd(x, out);
    }
  }
}

export async function verifyPresentation(input: StatementInput): Promise<Verified> {
  const parts = input.presentation.trim().split("~");
  check(parts.length >= 2, "presentation needs issuer JWT and KB-JWT");
  const issuerJwt = parts[0];
  const kbJwt = parts[parts.length - 1];
  check(kbJwt.length > 0, "KB-JWT missing");
  const disclosures = parts.slice(1, -1);

  // 1. Issuer signature.
  const issuerJwk = jwkFromSec1(input.issuerKeySec1);
  const iss = splitJws(issuerJwt);
  check(iss.header.alg === "ES256", "issuer alg must be ES256");
  check(await es256Verify(issuerJwk, iss.signingInput, iss.signature), "Invalid issuer JWT signature");
  const claims = iss.payload;

  // 2. vct.
  check(claims.vct === input.expectedVct, `vct mismatch: ${claims.vct}`);
  check((claims._sd_alg ?? "sha-256") === "sha-256", "_sd_alg must be sha-256");

  // 3. Disclosures anchored in a signed _sd.
  const sdSet = new Set<string>();
  collectSd(claims, sdSet);
  const decoded = await Promise.all(
    disclosures.map(async (d) => {
      const arr = JSON.parse(utf8Decode(b64urlDecode(d)));
      check(Array.isArray(arr) && arr.length === 3, "only object-property disclosures supported");
      return { digest: b64urlEncode(await sha256(latin1Encode(d))), name: String(arr[1]), value: arr[2] };
    }),
  );
  const accepted = decoded.map(() => false);
  for (let changed = true; changed; ) {
    changed = false;
    decoded.forEach((d, i) => {
      if (!accepted[i] && sdSet.has(d.digest)) {
        accepted[i] = true;
        collectSd(d.value, sdSet);
        changed = true;
      }
    });
  }
  check(accepted.every(Boolean), "a disclosure is not anchored in a signed _sd");

  // 4. age_equal_or_over.18.
  const ageObj =
    claims.age_equal_or_over && typeof claims.age_equal_or_over === "object"
      ? claims.age_equal_or_over
      : decoded.find((d) => d.name === "age_equal_or_over" && d.value && typeof d.value === "object")?.value;
  let over18 = false;
  if (ageObj) {
    const ageSd: string[] = Array.isArray(ageObj._sd) ? ageObj._sd : [];
    const hit = decoded.find((d) => d.name === "18" && ageSd.includes(d.digest));
    // Shapes A, B: the "18" leaf is its own disclosure anchored in the object's _sd.
    // Shape C: the object arrived as one disclosure with plain values (REALISM.md, section 3).
    over18 = hit ? hit.value === true : ageObj["18"] === true;
  }

  // 5. Holder key.
  const jwk = claims?.cnf?.jwk;
  check(jwk && jwk.kty === "EC" && jwk.crv === "P-256" && jwk.x && jwk.y, "cnf.jwk is not a P-256 key");
  const holderJwk: Jwk = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };

  // 6. KB-JWT.
  const kb = splitJws(kbJwt);
  check(kb.header.alg === "ES256", "KB-JWT alg must be ES256");
  check(kb.header.typ === "kb+jwt", "KB-JWT typ must be kb+jwt");
  check(await es256Verify(holderJwk, kb.signingInput, kb.signature), "Invalid KB-JWT signature");
  check(kb.payload.aud === input.expectedAud, `KB-JWT aud mismatch: ${kb.payload.aud}`);
  const trimmed = input.presentation.trim();
  const sdPart = trimmed.slice(0, trimmed.length - kbJwt.length);
  const sdHash = b64urlEncode(await sha256(latin1Encode(sdPart)));
  check(kb.payload.sd_hash === sdHash, "sd_hash mismatch");
  check(typeof kb.payload.nonce === "string", "KB-JWT nonce missing");

  // 7. Nonce binding and expiry.
  const nonce = hexEncode(await nonceOf(input.boundAddress, input.challenge));
  check(kb.payload.nonce === nonce, "KB-JWT nonce is not bound to the address");
  const expiry = typeof claims.exp === "number" ? claims.exp : 0;

  return {
    over18,
    expiry,
    kbExp: typeof kb.payload.exp === "number" ? kb.payload.exp : undefined,
    kbIat: typeof kb.payload.iat === "number" ? kb.payload.iat : undefined,
    kbNonce: kb.payload.nonce,
    issuerKeyHash: hexEncode(await sha256(input.issuerKeySec1)),
    nonce,
    subject: hexEncode(input.boundAddress),
    disclosedClaimNames: decoded.map((d) => d.name),
  };
}

/// KB-JWT freshness against the local clock: iat in [now - window, now + window]; exp, when present,
/// in (now, now + window]. exp is optional: the official German test wallet signs KB-JWTs with
/// aud, iat, nonce and sd_hash only (observed 2026-09-08, G0 run), and the circuit commits the
/// issuer exp, not the KB exp.
export function checkKbFreshness(v: Verified, now: number, window: number): void {
  check(v.kbIat !== undefined, "KB-JWT has no iat");
  const iat = v.kbIat!;
  if (v.kbExp !== undefined) {
    const exp = v.kbExp;
    check(exp > now, `KB-JWT expired: exp ${exp} <= now ${now}`);
    check(exp <= now + window, `KB-JWT exp ${exp} is more than ${window} s ahead of now ${now}`);
  }
  check(iat + window >= now, `KB-JWT iat ${iat} is more than ${window} s before now ${now}`);
  check(iat <= now + window, `KB-JWT iat ${iat} is more than ${window} s ahead of now ${now}`);
}
