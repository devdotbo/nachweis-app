// Stand-in for the phone: mint a German PID SD-JWT VC presentation the way the verifier's HTTP
// tests do (verifier-service/tests/bridge_http.rs `mint_presentation` / `answer_as_wallet`), in
// the byte layout the pid-sdjwt circuit expects (see circuits/pid-sdjwt/ADAPTATION.md), encrypt
// it to the key the signed request advertises, and POST it to the response_uri.
//
// The issuer key is persistent (file, 0600) so the NoirPidVerifier can pin its hash before any
// presentation exists; the holder key is fresh per presentation, as in a wallet.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bitString, ecdsaSigToDer, explicit0, integer, oid, seq, set, utcTime, utf8 } from "./der";
import { encryptJwe, es256Sign, generateP256, sec1FromJwk, signCompact, type Jwk } from "./crypto";
import { fetchRequestObject, postWalletResponse } from "./relay";
import { b64url, hex, log, nowUnix, random32, sha256 } from "./util";

export const PID_VCT = "urn:eudi:pid:de:1";

export interface IssuerKeyFile {
  version: 1;
  jwk: Jwk; // private
  sec1_hex: string;
  issuer_key_hash: string; // 0x + sha256(sec1)
  cert_der_b64: string; // self-signed leaf, standard base64 (x5c form)
}

/// Create the test issuer key and its self-signed leaf if the file does not exist; return it.
export async function loadOrCreateIssuerKey(path: string): Promise<IssuerKeyFile> {
  if (existsSync(path)) {
    const f = JSON.parse(readFileSync(path, "utf8")) as IssuerKeyFile;
    if (f.version !== 1) throw new Error("unsupported issuer key file");
    return f;
  }
  const { privateJwk } = await generateP256();
  const sec1 = sec1FromJwk(privateJwk);
  const cert = await selfSignedLeaf(privateJwk, "Companion test PID issuer (TEST ONLY)");
  const f: IssuerKeyFile = {
    version: 1,
    jwk: privateJwk,
    sec1_hex: hex(sec1),
    issuer_key_hash: "0x" + hex(sha256(sec1)),
    cert_der_b64: cert.toString("base64"),
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(f, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return f;
}

/// Minimal self-signed X.509 v3-less leaf (version 2 field, no extensions), ecdsa-with-SHA256.
export async function selfSignedLeaf(privateJwk: Jwk, cn: string): Promise<Buffer> {
  const name = seq(set(seq(oid("2.5.4.3"), utf8(cn))));
  const spki = seq(seq(oid("1.2.840.10045.2.1"), oid("1.2.840.10045.3.1.7")), bitString(sec1FromJwk(privateJwk)));
  const sigAlg = seq(oid("1.2.840.10045.4.3.2"));
  const now = new Date();
  const tbs = seq(
    explicit0(integer(Buffer.from([2]))),
    integer(random32().subarray(0, 8)),
    sigAlg,
    name,
    seq(utcTime(new Date(now.getTime() - 3600_000)), utcTime(new Date(now.getTime() + 2 * 365 * 24 * 3600_000))),
    name,
    spki,
  );
  const raw = await es256Sign(privateJwk, tbs);
  return seq(tbs, sigAlg, bitString(ecdsaSigToDer(raw)));
}

export interface MintOptions {
  issuer: IssuerKeyFile;
  nonce: string;
  aud: string;
  givenName?: string;
  familyName?: string;
  issuerExp?: number; // unix seconds; default now + 365 d
  kbTtlSecs?: number; // default 300, as the sandbox wallet does
  iat?: number;
}

const disclosure = (name: string, value: unknown): string =>
  b64url(JSON.stringify([b64url(random32().subarray(0, 16)), name, value]));
const digest = (disc: string): string => b64url(sha256(Buffer.from(disc, "ascii")));

/// The presentation `issuerJwt~given_name~family_name~age18~kbJwt`, plus the names of what it
/// discloses (never the values).
export async function mintPresentation(o: MintOptions): Promise<{ presentation: string; holderJwk: Jwk; disclosed: string[] }> {
  const iat = o.iat ?? nowUnix();
  const exp = o.issuerExp ?? iat + 365 * 24 * 3600;
  if (String(exp).length !== 10) throw new Error("issuer exp must have 10 digits (circuit timestamp parser)");
  const { privateJwk: holder, publicJwk: holderPub } = await generateP256();

  const given = disclosure("given_name", o.givenName ?? "Erika");
  const family = disclosure("family_name", o.familyName ?? "Mustermann");
  const birth = disclosure("birthdate", "1964-08-12");
  // Age object with six entries like a real PID; only "18" is presented.
  const ages: Array<[string, boolean]> = [["12", true], ["14", true], ["16", true], ["18", true], ["21", true], ["65", false]];
  const ageDiscs = ages.map(([n, v]) => disclosure(n, v));
  const age18 = ageDiscs[3];

  // Key order matters where the circuit matches fragments: cnf.jwk as serde_json emits it (crv, kty, x, y).
  const payload = {
    _sd: [given, family, birth].map(digest),
    _sd_alg: "sha-256",
    age_equal_or_over: { _sd: ageDiscs.map(digest) },
    cnf: { jwk: { crv: "P-256", kty: "EC", x: holderPub.x, y: holderPub.y } },
    exp,
    iat,
    iss: "https://companion-test-issuer.example/pid-de",
    nbf: iat,
    vct: PID_VCT,
  };
  const header = { alg: "ES256", typ: "dc+sd-jwt", x5c: [o.issuer.cert_der_b64] };
  const issuerJwt = await signCompact(o.issuer.jwk, header, payload);

  const sdPart = `${issuerJwt}~${given}~${family}~${age18}~`;
  const sdHash = b64url(sha256(Buffer.from(sdPart, "ascii")));
  const kbPayload = { aud: o.aud, exp: iat + (o.kbTtlSecs ?? 300), iat, nonce: o.nonce, sd_hash: sdHash };
  const kbJwt = await signCompact(holder, { alg: "ES256", typ: "kb+jwt" }, kbPayload);
  return { presentation: sdPart + kbJwt, holderJwk: holder, disclosed: ["given_name", "family_name", "age_equal_or_over.18"] };
}

export interface AnswerOptions {
  requestUri: string;
  issuer: IssuerKeyFile;
  aud: string;
  nonceOverride?: string;
  post: boolean;
  givenName?: string;
  familyName?: string;
}

/// answer_as_wallet: read the signed request, mint for its nonce, encrypt to its key, POST.
export async function answerAsWallet(o: AnswerOptions): Promise<{ status?: number; body?: any; jwe: string; nonce: string }> {
  const ro = await fetchRequestObject(o.requestUri);
  const nonce = o.nonceOverride ?? ro.nonce;
  log(`request object: client_id ${ro.clientId}, nonce ${nonce}, credential id ${ro.credentialId}, key kid ${ro.encryptionKey.kid ?? "-"}`);
  const { presentation, disclosed } = await mintPresentation({ issuer: o.issuer, nonce, aud: o.aud, givenName: o.givenName, familyName: o.familyName });
  log(`minted presentation: ${presentation.length} bytes, disclosed ${disclosed.join(", ")}`);
  const plaintext = JSON.stringify({ vp_token: { [ro.credentialId]: [presentation] } });
  const jwe = await encryptJwe(Buffer.from(plaintext, "utf8"), ro.encryptionKey);
  log(`encrypted to the request key: JWE ${jwe.length} chars (ECDH-ES, A128GCM)`);
  if (!o.post) return { jwe, nonce };
  const { status, body } = await postWalletResponse(ro.responseUri, jwe);
  log(`POST ${ro.responseUri}: ${status} ${JSON.stringify(body)}`);
  return { status, body, jwe, nonce };
}
