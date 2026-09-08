// Stand-in for the phone: mint a German PID SD-JWT VC presentation the way the verifier's HTTP
// tests do (verifier-service/tests/bridge_http.rs `mint_presentation` / `answer_as_wallet`), in
// the byte layout the pid-sdjwt circuit expects (see circuits/pid-sdjwt/ADAPTATION.md), encrypt
// it to the key the signed request advertises, and POST it to the response_uri. The same minter
// writes the realistic Noir fixture (`mint-fixture`).
//
// The issuer key is persistent (file, 0600) so the NoirPidVerifier can pin its hash before any
// presentation exists; the holder key is fresh per presentation, as in a wallet.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bitString, ecdsaSigToDer, explicit0, explicit3, extension, generalNameUri, integer, octetString, oid, printable, seq, set, utcTime, utf8 } from "./der";
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
  ca_der_b64?: string; // self-signed "CA" certificate carried as x5c[1] for a realistic header size
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
  const cert = await selfSignedLeaf(privateJwk, "Companion test PID issuer");
  const caKey = (await generateP256()).privateJwk;
  const ca = await selfSignedLeaf(caKey, "Companion test PID issuer CA", true);
  const f: IssuerKeyFile = {
    version: 1,
    jwk: privateJwk,
    sec1_hex: hex(sec1),
    issuer_key_hash: "0x" + hex(sha256(sec1)),
    cert_der_b64: cert.toString("base64"),
    ca_der_b64: ca.toString("base64"),
  };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(f, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return f;
}

/// Self-signed X.509 v3 certificate, ecdsa-with-SHA256, with the DN and extension set of a
/// sandbox issuer certificate (subjectKeyIdentifier, authorityKeyIdentifier, keyUsage,
/// basicConstraints, subjectAltName) so the two-certificate x5c has a realistic size (about 500
/// DER bytes per certificate, as in the ERICA captures).
/// Nothing in this repo verifies the chain; the circuit hashes the key, the contract pins it.
export async function selfSignedLeaf(privateJwk: Jwk, cn: string, ca = false): Promise<Buffer> {
  const rdn = (o: string, v: Buffer) => set(seq(oid(o), v));
  const name = seq(rdn("2.5.4.6", printable("DE")), rdn("2.5.4.10", utf8("Companion test (TEST ONLY)")), rdn("2.5.4.3", utf8(cn)));
  const spkiKey = sec1FromJwk(privateJwk);
  const spki = seq(seq(oid("1.2.840.10045.2.1"), oid("1.2.840.10045.3.1.7")), bitString(spkiKey));
  const sigAlg = seq(oid("1.2.840.10045.4.3.2"));
  const keyId = sha256(spkiKey).subarray(0, 20);
  const extensions = explicit3(
    seq(
      extension("2.5.29.14", false, octetString(keyId)),
      extension("2.5.29.35", false, seq(tlv0(keyId))),
      extension("2.5.29.15", true, Buffer.from(ca ? [0x03, 0x02, 0x01, 0x06] : [0x03, 0x02, 0x07, 0x80])),
      extension("2.5.29.19", true, ca ? seq(Buffer.from([0x01, 0x01, 0xff])) : seq()),
      extension("2.5.29.17", false, seq(generalNameUri("https://companion-test-issuer.example/pid-de"))),
    ),
  );
  const now = new Date();
  const tbs = seq(
    explicit0(integer(Buffer.from([2]))),
    integer(random32().subarray(0, 8)),
    sigAlg,
    name,
    seq(utcTime(now), utcTime(new Date(now.getTime() + 365 * 24 * 3600 * 1000))),
    name,
    spki,
    extensions,
  );
  const raw = await es256Sign(privateJwk, tbs);
  return seq(tbs, sigAlg, bitString(ecdsaSigToDer(raw)));
}
const tlv0 = (b: Buffer): Buffer => Buffer.concat([Buffer.from([0x80, b.length]), b]);

export type AgeShape = "nested" | "disclosed" | "plain";

export interface MintOptions {
  issuer: IssuerKeyFile;
  nonce: string;
  aud: string;
  givenName?: string;
  familyName?: string;
  issuerExp?: number; // unix seconds; default now + 365 d
  kbTtlSecs?: number; // default 300, as the sandbox wallet does
  iat?: number;
  /// How age_equal_or_over arrives (circuits/pid-sdjwt/REALISM.md, section 3): nested digests
  /// plain in the payload (A, default), the object itself disclosed with nested digests (B), or
  /// disclosed with plain values (C).
  ageShape?: AgeShape;
  /// Put a kid into the KB-JWT header, as ERICA's simulator does (default true).
  kbKid?: boolean;
  /// The older three-digest layout of the SP1 fixture instead of the 23-claim PID (default false).
  minimal?: boolean;
  /// Issuer header key order. "alg-first": alg, typ, x5c (ERICA and the earlier fixtures).
  /// "x5c-first": x5c (one certificate), kid (156 chars), typ, alg, as the Bundesdruckerei PID
  /// issuer sends it (docs/evidence/g0-2026-09-08.md); alg and typ then sit about 1 kB into
  /// the decoded header, which exercises the circuit's movable header window. Default alg-first.
  headerLayout?: HeaderLayout;
}

export type HeaderLayout = "alg-first" | "x5c-first";

/// A 156-char kid in the shape of the observed one (opaque, derived from the leaf).
export function observedStyleKid(certDerB64: string): string {
  const h = b64url(sha256(Buffer.from(certDerB64, "base64")));
  return `${h}${b64url(sha256(Buffer.from(h)))}${b64url(sha256(Buffer.from(h + h)))}${h}`.slice(0, 156);
}

const disclosure = (name: string, value: unknown): string =>
  b64url(JSON.stringify([b64url(random32().subarray(0, 16)), name, value]));
const digest = (disc: string): string => b64url(sha256(Buffer.from(disc, "ascii")));

/// The presentation `issuerJwt~given_name~family_name~[age object~]age18~kbJwt`, plus the names
/// of what it discloses (never the values). The issuer payload mirrors the 23-claim German PID
/// (REALISM.md, section 3): 12 top-level digests, nested `age_equal_or_over` (6), `address` (4),
/// `place_of_birth` (1), `status.status_list`, `cnf.jwk` in ERICA's key order.
export async function mintPresentation(o: MintOptions): Promise<{ presentation: string; holderJwk: Jwk; disclosed: string[] }> {
  const iat = o.iat ?? nowUnix();
  const exp = o.issuerExp ?? iat + 365 * 24 * 3600;
  if (String(exp).length !== 10) throw new Error("issuer exp must have 10 digits (circuit timestamp parser)");
  const shape: AgeShape = o.ageShape ?? "nested";
  const { privateJwk: holder, publicJwk: holderPub } = await generateP256();

  const given = disclosure("given_name", o.givenName ?? "Erika");
  const family = disclosure("family_name", o.familyName ?? "Mustermann");
  // Age thresholds like a real PID; only "18" is presented (shapes A, B).
  const ages: Array<[string, boolean]> = [["12", true], ["14", true], ["16", true], ["18", true], ["21", true], ["65", false]];
  const ageDiscs = ages.map(([n, v]) => disclosure(n, v));
  const age18 = ageDiscs[3];
  const ageNested = { _sd: ageDiscs.map(digest) };
  const agePlain = Object.fromEntries(ages);
  // Shapes B and C: the whole object is one disclosure whose digest sits in the top-level _sd.
  const ageObjDisc = shape === "disclosed" ? disclosure("age_equal_or_over", ageNested) : shape === "plain" ? disclosure("age_equal_or_over", agePlain) : undefined;

  const topLevel = o.minimal
    ? [given, family, disclosure("birthdate", "1964-08-12")]
    : [
        family,
        given,
        disclosure("birthdate", "1964-08-12"),
        disclosure("source_document_type", "id_card"),
        disclosure("age_in_years", 61),
        disclosure("age_birth_year", 1964),
        disclosure("nationalities", ["DE"]),
        disclosure("birth_family_name", "Gabler"),
        disclosure("issuing_authority", "DE"),
        disclosure("issuing_country", "DE"),
        disclosure("issuance_date", "2026-06-01"),
        disclosure("expiry_date", "2027-06-01"),
      ];
  const address = [
    disclosure("street_address", "Heidestraße 17"),
    disclosure("locality", "Köln"),
    disclosure("postal_code", "51147"),
    disclosure("country", "DE"),
  ];
  const placeOfBirth = [disclosure("locality", "Berlin")];
  const topDigests = [...topLevel, ...(ageObjDisc ? [ageObjDisc] : [])].map(digest);
  // Issuers shuffle digests; put the age object digest in the middle so the anchor search is exercised.
  if (ageObjDisc) topDigests.splice(5, 0, topDigests.pop()!);

  const payload: Record<string, unknown> = o.minimal
    ? {
        _sd: topDigests,
        _sd_alg: "sha-256",
        ...(ageObjDisc ? {} : { age_equal_or_over: ageNested }),
        cnf: { jwk: { crv: "P-256", kty: "EC", x: holderPub.x, y: holderPub.y } },
        exp,
        iat,
        iss: "https://companion-test-issuer.example/pid-de",
        nbf: iat,
        vct: PID_VCT,
      }
    : {
        iss: "https://companion-test-issuer.example/pid-de",
        iat,
        exp,
        nbf: iat,
        vct: PID_VCT,
        cnf: { jwk: { kty: "EC", crv: "P-256", x: holderPub.x, y: holderPub.y } },
        status: { status_list: { idx: 1234, uri: "https://companion-test-issuer.example/status/f4b2e7c1-3d1a-4c5e-9b0f-2a7c8d9e1f00" } },
        _sd_alg: "sha-256",
        _sd: topDigests,
        ...(ageObjDisc ? {} : { age_equal_or_over: ageNested }),
        address: { _sd: address.map(digest) },
        place_of_birth: { _sd: placeOfBirth.map(digest) },
      };
  const header =
    (o.headerLayout ?? "alg-first") === "x5c-first"
      ? { x5c: [o.issuer.cert_der_b64], kid: observedStyleKid(o.issuer.cert_der_b64), typ: "dc+sd-jwt", alg: "ES256" }
      : { alg: "ES256", typ: "dc+sd-jwt", x5c: [o.issuer.cert_der_b64, ...(o.issuer.ca_der_b64 ? [o.issuer.ca_der_b64] : [])] };
  const issuerJwt = await signCompact(o.issuer.jwk, header, payload);

  const presented = [given, family, ...(ageObjDisc ? [ageObjDisc] : []), ...(shape === "plain" ? [] : [age18])];
  const sdPart = `${issuerJwt}~${presented.join("~")}~`;
  const sdHash = b64url(sha256(Buffer.from(sdPart, "ascii")));
  // KB-JWT payload in ERICA's key order; header with a kid as ERICA's simulator sends it.
  const kbPayload = { nonce: o.nonce, aud: o.aud, iat, exp: iat + (o.kbTtlSecs ?? 300), sd_hash: sdHash };
  const kbHeader = (o.kbKid ?? true) ? { alg: "ES256", typ: "kb+jwt", kid: "holder-key-" + b64url(sha256(holderPub.x)).slice(0, 8) } : { alg: "ES256", typ: "kb+jwt" };
  const kbJwt = await signCompact(holder, kbHeader, kbPayload);
  const disclosed = ["given_name", "family_name", shape === "nested" ? "age_equal_or_over.18" : shape === "disclosed" ? "age_equal_or_over (object) + age_equal_or_over.18" : "age_equal_or_over (plain object)"];
  return { presentation: sdPart + kbJwt, holderJwk: holder, disclosed };
}

export interface AnswerOptions {
  requestUri: string;
  issuer: IssuerKeyFile;
  aud: string;
  nonceOverride?: string;
  post: boolean;
  givenName?: string;
  familyName?: string;
  ageShape?: AgeShape;
  minimal?: boolean;
}

/// answer_as_wallet: read the signed request, mint for its nonce, encrypt to its key, POST.
export async function answerAsWallet(o: AnswerOptions): Promise<{ status?: number; body?: any; jwe: string; nonce: string }> {
  const ro = await fetchRequestObject(o.requestUri);
  const nonce = o.nonceOverride ?? ro.nonce;
  log(`request object: client_id ${ro.clientId}, nonce ${nonce}, credential id ${ro.credentialId}, key kid ${ro.encryptionKey.kid ?? "-"}`);
  const { presentation, disclosed } = await mintPresentation({ issuer: o.issuer, nonce, aud: o.aud, givenName: o.givenName, familyName: o.familyName, ageShape: o.ageShape, minimal: o.minimal });
  log(`minted presentation: ${presentation.length} bytes, disclosed ${disclosed.join(", ")}`);
  const plaintext = JSON.stringify({ vp_token: { [ro.credentialId]: [presentation] } });
  const jwe = await encryptJwe(Buffer.from(plaintext, "utf8"), ro.encryptionKey);
  log(`encrypted to the request key: JWE ${jwe.length} chars (ECDH-ES, A128GCM)`);
  if (!o.post) return { jwe, nonce };
  const { status, body } = await postWalletResponse(ro.responseUri, jwe);
  log(`POST ${ro.responseUri}: ${status} ${JSON.stringify(body)}`);
  return { status, body, jwe, nonce };
}
