# Realism pass: what a real sandbox PID presentation looks like, and what the circuit assumes

Written before the circuit change (measurements first), updated with the results after it.
Sources: the verifier repo `/Users/bioharz/git/eudi-wallet-hackathon/verifier` (registrar leaf,
ERICA captures), the research wiki of the hackathon repo, and this repo's minted vector.

## 1. The registered `client_id` (KB-JWT `aud`)

An OpenID4VP wallet sets the KB-JWT `aud` to the verifier's `client_id`. With the `x509_hash`
scheme that is `x509_hash:` followed by base64url(sha256(leaf certificate DER)) without padding
(`verifier-core/src/crypto.rs`, `leaf_cert_hash`). The registered leaf is
`verifier/fixtures/live/access-leaf.pem` (subject `C=DE, O=Hackathon - Reza,
organizationIdentifier=DE123456789012345, CN=Hackathon - Reza`, issuer `CN=German Registrar`,
valid 2026-06-02 to 2027-06-02, SAN `DNS:localhost`). Derivation on this machine:

    openssl x509 -in fixtures/live/access-leaf.pem -outform DER \
      | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '='
    VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI

which matches the value the verifier README reports for the live run
(`x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI`). The full string the wallet puts into
`aud` is therefore

    x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI

Decision: option (a), the `client_id` is pinned as the circuit constant `AUD_FRAGMENT`
(`"aud":"x509_hash:VE3q…KOI"`, 61 bytes). Option (b), a private `aud` input committed as
sha256(aud) against a constant, would cost one SHA block and buy nothing: the constant is still
in the circuit, so a new leaf still means a new VK. Option (c), aud hash as a public input, would
change the 86-word layout and is out. Consequence, documented in README.md and ADAPTATION.md: a
new registrar leaf (re-registration, renewal after 2027-06-02, or a leaf whose SAN matches the
tunnel host, see the SAN caveat in `docs/live-phone-path.md`) changes `client_id`, the constant,
the VK, `PidSdJwtUltraHonkVerifier.sol` and the fixtures. `tools/gen-prover.ts` reads the pinned
value from `constants.nr` and refuses a presentation whose `aud` differs, so the drift shows
before proving.

Caveat: ERICA's simulator sets `aud` to the literal `https://self-issued.me/v2` (verifier
`fixtures/oracle/MANIFEST.md` flags this as contrary to the spec). The real sandbox wallet's
behaviour is what the registrar path is built for; if it also sends the literal, the old
constant is one line away.

## 2. Measured sizes

All SD-JWT fixtures available locally, measured with a bun script (byte lengths of the
base64url segments and of the decoded JSON):

| fixture | total | header b64 / raw | x5c | payload b64 / raw | top `_sd` | disclosures (b64 lengths) | tail | KB-JWT / header raw / payload raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| verifier `erica-vp-VALID.sdjwt` | 3117 | 1855 / 1391 | 2 (660, 684) | 644 / 483 | 2 | 2 (63, 71) | 137 | 393 / 56 / 172 |
| verifier `erica-vp-OVER_DISCLOSURE.sdjwt` | 3569 | 1855 / 1391 | 2 | 828 / 621 | 5 | 5 (63…102) | 405 | 393 / 56 / 172 |
| verifier `synthetic-pid-with-status.sdjwt` | 1905 | 891 / 668 | 1 (624) | 523 / 392 | 1 | 1 (66) | 68 | 335 / 30 / 155 |
| this repo `prover-sp1/fixtures/input.json` (minted) | 3510 | 1855 / 1391 | 2 | 986 / 739 | 3 | 3 (63, 71, 48) | 186 | 395 / 30 / 200 |

What the ERICA captures are and are not: ERICA is a presentation-time re-minter
(`iss https://debugger.eudi-wallet-demo.example`). Its issuer payload carries exactly the
digests of the disclosures it presents (2 in VALID, 5 in OVER_DISCLOSURE, different digests
each time), no nested objects and no `age_equal_or_over` at all (ERICA's PID template uses flat
`age_over_18`). So the captures fix the header size (the two-certificate x5c, 1855 chars) and
the KB-JWT shape, but say nothing about a real issuer's payload size. No captured sandbox PID
payload exists in either repo: the one real phone run (2026-06-25) kept its raw material in an
uncommitted debug directory, and custom wallets cannot obtain a sandbox PID.

Facts the captures do give:

- ERICA's KB-JWT header is `{"alg":"ES256","typ":"kb+jwt","kid":"holder-test-key-1"}` (56
  bytes). The circuit pinned the 30-byte `{"alg":"ES256","typ":"kb+jwt"}` as a constant, which
  would have rejected this presentation.
- KB-JWT payload key order `nonce, aud, iat, exp, sd_hash` (the minted vector: `aud, exp, iat,
  nonce, sd_hash`). The circuit reads these at prover offsets, so order does not matter.
- `cnf.jwk` key order `kty, crv, x, y, kid` (minted vector: `crv, kty, x, y`). The circuit reads
  `x` and `y` at prover offsets after `"cnf":{"jwk":{`, order does not matter; the window was
  128 bytes and a long `kid` before `x` could exceed it.
- Issuer header key order `alg, typ, x5c`, `typ` `dc+sd-jwt`, both in ERICA and in the
  verifier's synthetic fixture. The BDR sandbox issuer's header is unverified.
- ERICA's KB-JWT `nonce` is a UUID (36 chars). Our verifier mints
  hex(sha256(subject || challenge)), 64 chars, which is what the circuit checks.

## 3. The real PID payload, reconstructed

The BDR sandbox issuer metadata (fetched 2026-07-30, hackathon research report) lists
`pid-sd-jwt`, `dc+sd-jwt`, `vct urn:eudi:pid:de:1`, ES256, `jwk` binding, 23 claims. The
23 claims of the German PID (rulebook profile) are family_name, given_name, birthdate,
source_document_type, age_equal_or_over.{12,14,16,18,21,65}, age_in_years, age_birth_year,
nationalities, place_of_birth.locality, address.{street_address, locality, postal_code, country},
birth_family_name, issuing_authority, issuing_country, issuance_date, expiry_date.

Reconstructed compact serde-style payload (`iss`, `iat`, `exp`, `nbf`, `vct`, `cnf.jwk`,
`status.status_list` with a BDR-length uri, `_sd_alg`, top-level `_sd`, and the nested
objects with their own `_sd`), measured:

| layout | raw payload bytes | base64url |
| --- | --- | --- |
| 12 top-level digests + age 6 + address 4 + place_of_birth 1 (nested objects plain in the payload) | 1570 | 2094 |
| same, plus the three objects themselves disclosable (15 top-level digests) | 1708 | 2278 |
| same, plus decoy digests (8 top-level, 2 address, 2 place_of_birth) | 2122 | 2830 |

Other realistic pieces: age object as one disclosure `["salt","age_equal_or_over",{"_sd":[6]}]`
332 raw bytes (443 base64url); the same with plain values 109 bytes; a disclosures tail with
long umlaut names (`Anna-Maria Theresia`, `Müller-Lüdenscheidt`) and the age disclosure 220
bytes; KB payload with the `x509_hash` aud 228 bytes; KB header with a `kid` 56 bytes.

How the age object can arrive (unverified which one the BDR issuer uses; the verifier and the
SP1 statement accept the first two, the circuit accepted only the first):

- A. plain in the issuer payload with nested digests: `"age_equal_or_over":{"_sd":[…]}`, the
  wallet presents `["salt","18",true]`. This is what the minted vector has.
- B. the object is itself a disclosure with nested digests: top-level `_sd` holds
  sha256(b64(`["salt","age_equal_or_over",{"_sd":[…]}]`)), the wallet presents that disclosure
  and `["salt","18",true]`.
- C. the object is a disclosure with plain values: `["salt","age_equal_or_over",{"12":true,…}]`,
  no separate `18` disclosure (disclosing 18 discloses all thresholds).

## 4. Bounds, before and after

| constant | before | after | basis |
| --- | --- | --- | --- |
| HEADER_B64_MAX | 2048 | 2304 | 1855 chars (two-cert x5c) + 24 % |
| PAYLOAD_MAX_LEN (raw) | 1024 | 2304 | 1708 bytes (objects disclosable) + 35 %, covers the decoy layout (2122) |
| TAIL_MAX | 512 | 512 | 220 bytes with long names; 3 disclosures |
| KB_PAYLOAD_MAX (raw) | 320 | 384 | 228 bytes with the x509_hash aud + room for extra claims |
| KB_HEADER_MAX (raw), new | (constant 30) | 128 | 56 bytes with kid |
| AGE_OBJ_DISC_MAX (raw), new | (unsupported) | 512 | 332 bytes nested age object disclosure + 54 % |
| AGE_WINDOW (bytes scanned inside the age `_sd` array), new | 8 x 46 stride | 384 | 8 digests at 47 bytes (with a space after the comma) |
| SD_WINDOW (bytes scanned inside the top-level `_sd` array), new | - | 1280 | 27 digests |
| CNF_WINDOW (x, y after `"cnf":{"jwk":{`) | 128 | 256 | a long kid before x |
| SALT_MAX_LEN | 32 | 32 | 22 chars for 16-byte salts |

## 5. What changed in the circuit (summary; details in ADAPTATION.md)

1. `AUD_FRAGMENT` pins the registered `client_id` (section 1).
2. The KB-JWT header is a private input (`kb_header`, raw JSON, max 128); the circuit
   base64url-encodes it into the KB signing input and requires `"alg":"ES256"` and
   `"typ":"kb+jwt"` at prover offsets inside it. Any key order, `kid` allowed.
3. The issuer header: the first 128 base64url chars are decoded in-circuit (96 bytes) and must
   contain `"alg":"ES256"` and `"typ":"dc+sd-jwt"` or `"typ":"vc+sd-jwt"` at prover offsets.
   Replaces the fixed 40-char prefix (which pinned key order alg, typ).
4. Age object in shapes A, B, C (section 3): inputs `age_obj_disclosed`, `age_leaf_disclosed`,
   `age_obj_disclosure` (raw, max 512), `sd_offset`, `age_obj_digest_offset`,
   `age_sd_offset`, `age_target_offset`. The fixed 46-byte stride and `age_digest_index` are
   replaced by an absolute target offset plus a scan that no `]` or `}` occurs between the
   array (or object) start and the target, so the digest (or `"18":true`) is inside the age
   container regardless of whitespace or digest length.
5. `x` and `y` may lie up to 256 bytes after `"cnf":{"jwk":{`.
6. SHA-256 prefix sharing: the signing input `header.payload` is hashed once up to its last
   full block (`partial_sha256_var_interstitial`); the issuer-signature hash and the sd_hash
   (`header.payload.sig~d1~…~dN~`) are finished from that state with a small in-circuit
   continuation. Without this the larger bounds would have pushed the circuit past 2^20.

Public input layout unchanged: 86 words, subject 20, issuer_key_hash 32, over18 1, expiry 1,
nonce 32.

## 6. Results

Filled in after the change; see the measurements table in `/circuits/README.md` for the full
before/after comparison.

## 7. Still unverified until a real phone run

- The BDR issuer's payload: key order is irrelevant, but the `vct` literal (three values are
  in circulation: `urn:eudi:pid:de:1`, `urn:eudi:pid:1`,
  `https://demo.pid-provider.bundesdruckerei.de/credentials/pid/1.0`), the age object shape
  (A, B or C), whether `exp` is present (the circuit requires it), and the total size against
  PAYLOAD_MAX_LEN 2304.
- The issuer header: `alg` and `typ` must sit in the first 96 decoded bytes (true when `x5c`
  comes last); the two-certificate x5c must fit 2304 base64url chars.
- Whether the sandbox wallet sets `aud` to the `x509_hash` client_id (spec) or to the literal
  (ERICA's behaviour), and whether its KB-JWT header carries a `kid`.
- The sandbox issuer key hash for `NoirPidVerifier` (`PID_ISSUER_KEY_HASH`): sha256 of the
  SEC1 key of the x5c leaf of a real credential; `companion prove` and `gen-prover.ts` derive
  the key from the leaf, so the value can be read off the first real presentation.
