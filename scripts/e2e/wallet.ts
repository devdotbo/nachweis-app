// Synthetic wallet for the local end-to-end run (scripts/e2e-local.sh).
//
// Answers one verifier-service session the way the sandbox wallet does, without a phone:
//   1. GET /request/:id       read the signed request object (JAR): nonce, client_id, dcql query id,
//                             the service's encryption JWK
//   2. mint a German PID SD-JWT VC presentation for that nonce and client_id:
//        issuer JWT (ES256, x5c = the e2e issuer certificate) with _sd digests for given_name,
//        family_name and age_equal_or_over (whose own _sd anchors the "18": true disclosure),
//        cnf.jwk = a fresh holder key, exp = iat + 365 days (the committed on-chain expiry);
//        KB-JWT (ES256 under the holder key, typ kb+jwt) with iat = now, exp = iat + 300,
//        aud = client_id, nonce, sd_hash
//   3. encrypt {vp_token: {<query id>: [presentation]}} to the advertised key (ECDH-ES, A128GCM)
//   4. POST /response/:id     response=<JWE>, form encoded
//
// Mirrors verifier-service/tests/bridge_http.rs (mint_presentation, encrypt_to, answer_as_wallet)
// in the verifier repo, plus the age_equal_or_over.18 disclosure and the exp claims the bridge's
// statement and freshness check need. The issuer key is the one whose SEC1 hash the run pinned
// in Sp1PidVerifier (PID_ISSUER_KEY_HASH), generated per run by the shell script.
//
// Usage: bun run wallet.ts <verifier base url> <session id> <issuer PKCS#8 PEM> <issuer cert PEM>
// Prints one JSON line: {status, http_status, answer, presentation_parts}.

import { CompactEncrypt, CompactSign, exportJWK, generateKeyPair, importJWK, importPKCS8 } from "jose";

const [verifierUrl, sessionId, issuerKeyPath, issuerCertPath] = process.argv.slice(2);
if (!verifierUrl || !sessionId || !issuerKeyPath || !issuerCertPath) {
  console.error("usage: bun run wallet.ts <verifier url> <session id> <issuer pkcs8 pem> <issuer cert pem>");
  process.exit(2);
}

const PID_VCT = "urn:eudi:pid:de:1";
const base = verifierUrl.replace(/\/+$/, "");
const enc = new TextEncoder();

const b64url = (bytes: Uint8Array | string): string =>
  Buffer.from(typeof bytes === "string" ? enc.encode(bytes) : bytes).toString("base64url");
const sha256 = async (data: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(data)));
const pemBody = (pem: string): string => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");

function disclosure(name: string, value: unknown): string {
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return b64url(JSON.stringify([salt, name, value]));
}
const digest = async (disc: string): Promise<string> => b64url(await sha256(disc));

async function signCompact(header: Record<string, unknown>, payload: Record<string, unknown>, key: CryptoKey) {
  return new CompactSign(enc.encode(JSON.stringify(payload)))
    .setProtectedHeader({ ...header, alg: "ES256" })
    .sign(key);
}

// 1. The signed request object, read like a wallet.
const jarRes = await fetch(`${base}/request/${sessionId}`);
if (!jarRes.ok) throw new Error(`GET /request/${sessionId}: ${jarRes.status} ${await jarRes.text()}`);
const jar = await jarRes.text();
const jarPayload = JSON.parse(Buffer.from(jar.split(".")[1], "base64url").toString());
const nonce: string = jarPayload.nonce;
const aud: string = jarPayload.client_id;
const queryId: string = jarPayload.dcql_query.credentials[0].id;
const encJwk = jarPayload.client_metadata.jwks.keys[0];
if (!nonce || !aud || !queryId || !encJwk) throw new Error(`request object lacks nonce/client_id/dcql/jwks: ${JSON.stringify(jarPayload)}`);

// 2. Mint the presentation.
const issuerKey = await importPKCS8(await Bun.file(issuerKeyPath).text(), "ES256");
const x5cLeaf = pemBody(await Bun.file(issuerCertPath).text()); // standard base64 DER, as x5c wants
const holder = await generateKeyPair("ES256", { extractable: true });
const holderJwk = await exportJWK(holder.publicKey);

const now = Math.floor(Date.now() / 1000);
const dGiven = disclosure("given_name", "Erika");
const dFamily = disclosure("family_name", "Mustermann");
const d18 = disclosure("18", true);
const dAge = disclosure("age_equal_or_over", { _sd: [await digest(d18)] });

const issuerHeader = { typ: "dc+sd-jwt", x5c: [x5cLeaf] };
const issuerPayload = {
  iss: "https://e2e-issuer.nachweis.local/pid-de",
  vct: PID_VCT,
  iat: now,
  exp: now + 365 * 24 * 3600,
  _sd_alg: "sha-256",
  _sd: [await digest(dGiven), await digest(dFamily), await digest(dAge)],
  cnf: { jwk: { kty: holderJwk.kty, crv: holderJwk.crv, x: holderJwk.x, y: holderJwk.y } },
};
const issuerJwt = await signCompact(issuerHeader, issuerPayload, issuerKey);

const sdJwtNoKb = `${issuerJwt}~${dGiven}~${dFamily}~${dAge}~${d18}~`;
const kbPayload = { iat: now, exp: now + 300, aud, nonce, sd_hash: b64url(await sha256(sdJwtNoKb)) };
const kbJwt = await signCompact({ typ: "kb+jwt" }, kbPayload, holder.privateKey);
const presentation = `${sdJwtNoKb}${kbJwt}`;

// 3. Encrypt to the service's key (ECDH-ES, A128GCM), as direct_post.jwt requires.
const recipient = await importJWK({ ...encJwk, alg: "ECDH-ES" }, "ECDH-ES");
const jwe = await new CompactEncrypt(enc.encode(JSON.stringify({ vp_token: { [queryId]: [presentation] } })))
  .setProtectedHeader({ alg: "ECDH-ES", enc: "A128GCM", kid: encJwk.kid })
  .encrypt(recipient);

// 4. POST the form the way the wallet does.
const res = await fetch(`${base}/response/${sessionId}`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ response: jwe }).toString(),
});
const text = await res.text();
let answer: unknown;
try {
  answer = JSON.parse(text);
} catch {
  answer = text;
}
console.log(
  JSON.stringify({
    status: res.ok ? "posted" : "refused",
    http_status: res.status,
    answer,
    presentation_parts: presentation.split("~").length,
    nonce,
    aud,
  }),
);
process.exit(res.ok ? 0 : 1);
