# Realism pass: what a real sandbox PID presentation looks like, and what the circuit assumes

Written before the circuit change (measurements first), updated with the results after it.
Sources: the verifier repo `klartext-verifier` (the builder's local checkout; registrar leaf,
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
the KB-JWT shape, but say nothing about a real issuer's payload size. Since the G0 run of
2026-09-08 (`docs/evidence/g0-2026-09-08.md`) the real Bundesdruckerei sandbox PID has been
observed through the relay with the official German test wallet; its shapes are in section 8
and replace the reconstruction below where they differ.

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
  verifier's synthetic fixture. The BDR sandbox issuer orders its header `x5c, kid, typ, alg`
  (G0, section 8), which is why the header check became a movable window.
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
| TAIL_MAX | 512 | 768 | 220 bytes with long names; 630 with the disclosed age object (shape B) |
| KB_PAYLOAD_MAX (raw) | 320 | 384 | 228 bytes with the x509_hash aud + room for extra claims |
| KB_HEADER_MAX (raw), new | (constant 30) | 128 | 56 bytes with kid |
| AGE_OBJ_DISC_MAX (raw), new | (unsupported) | 512 | 332 bytes nested age object disclosure + 54 % |
| age `_sd` array length | 8 entries at a 46 byte stride | unlimited | prefix counts instead of a window scan |
| CNF_WINDOW (x, y after `"cnf":{"jwk":{`) | 128 | 256 | a long kid before x |
| SALT_MAX_LEN | 32 | 32 | 22 chars for 16-byte salts |

## 5. What changed in the circuit (summary; details in ADAPTATION.md)

1. `AUD_FRAGMENT` pins the registered `client_id` (section 1).
2. The KB-JWT header is a private input (`kb_header`, raw JSON, max 128); the circuit
   base64url-encodes it into the KB signing input and requires `"alg":"ES256"` and
   `"typ":"kb+jwt"` at prover offsets inside it. Any key order, `kid` allowed.
3. The issuer header: a 128-char base64url window (96 decoded bytes) is decoded in-circuit
   and must contain `"alg":"ES256"` and `"typ":"dc+sd-jwt"` or `"typ":"vc+sd-jwt"` at prover
   offsets. Replaces the fixed 40-char prefix (which pinned key order alg, typ). WP13 fixed
   the window at the start of the header; WP22 made its start a private input (section 8).
4. Age object in shapes A, B, C (section 3): inputs `age_obj_disclosed`, `age_leaf_disclosed`,
   `age_obj_disclosure` (raw, max 512), `sd_offset`, `age_obj_digest_offset`,
   `age_sd_offset`, `age_target_offset`. The fixed 46-byte stride and `age_digest_index` are
   replaced by an absolute target offset plus prefix counts of `]` and `}` over the buffer:
   none may occur between the array (or object) start and the target, so the digest (or
   `"18":true`) is inside the age container regardless of whitespace, digest order or array
   length (no window limit; the AGE_WINDOW / SD_WINDOW bounds of section 4 were dropped).
5. `x` and `y` may lie up to 256 bytes after `"cnf":{"jwk":{`.
6. SHA-256 prefix sharing: the signing input `header.payload` is hashed once up to its last
   full block (`partial_sha256_var_interstitial`); the issuer-signature hash and the sd_hash
   (`header.payload.sig~d1~…~dN~`) are finished from that state with a small in-circuit
   continuation. Without this the larger bounds would have pushed the circuit past 2^20.

Public input layout unchanged: 86 words, subject 20, issuer_key_hash 32, over18 1, expiry 1,
nonce 32.

## 6. Results

| | before (minted vector) | after (realistic vector) |
| --- | --- | --- |
| ACIR opcodes | 135,831 | 255,170 |
| UltraHonk circuit_size | 894,846 (2^20) | 1,038,584 (2^20, 10 k headroom) |
| `nargo compile` | 12.6 s | 15.7 s, 1.69 GB |
| `nargo execute` | 0.6 s | 0.9 s, 226 MB |
| `bb write_vk` (evm) | 1.7 s | 2.0 s, 1.80 GB |
| `bb prove` (evm, 16 threads) | 6.0 s wall, 25.8 s user, 1.84 GB (re-measured the same day; 3.5 s on the earlier run) | 4.0 s wall, 26.2 s user, 2.25 GB |
| `bb prove` (HARDWARE_CONCURRENCY=1) | 18.5 s | 19.7 s |
| vector | header 1855, payload 739, tail 186, KB payload 200, no kid | header 2138, payload 1563 (23 claims, nested age/address/place_of_birth, status), tail 186, KB payload 228, KB header 58 with kid |

Intermediate steps: the first version with per-position window scans was 1,049,932 gates
(1,356 over 2^20); the prefix-count anchoring brought it to 1,011,444; TAIL_MAX 512 to 768 for
shape B (630 byte tail) to 1,038,584. All negative tests pass (issuer-sig, age-disclosure, nonce,
kb-sig rejected), shapes B and C and the minimal no-kid layout solve, `nargo test` 9 pass,
`forge test` 87 pass 10 skipped (NoirPidVerifier suite 21, attestWithProof 3.02 M gas), service
`cargo test --test anvil` 2 pass, companion `bun test` 17 pass, and the companion end-to-end run
with the stand-in wallet (relay verifier, anvil, bridge) attested on chain in 5.9 s (bb prove
4.19 s).

The realistic vector is `prover-sp1/fixtures/realistic-input.json` / `realistic-over18.sdjwt`,
minted by `companion mint-fixture` with the SP1 fixture's subject and challenge (nonce unchanged),
a fresh holder key and the companion test issuer key (self-signed two-certificate x5c, about 580
DER bytes each). The SP1 fixture (`input.json`, `calldata-groth16.json`, `vkey.txt`) stays the
older, shorter vector: the SP1 statement did not change, so its Groth16 proof is still valid,
and the mock anvil test compares the bridge's native public values with that calldata. The
ERICA capture `erica-vp-VALID.sdjwt` cannot run through the circuit (no age disclosure, UUID
nonce, literal aud); its issuer signature verifies natively against the x5c leaf key, which is
what `companion prove` and `gen-prover.ts` do for a real credential (companion test "x5c leaf
is the signer").

## 7. Verified by the G0 run (2026-09-08), what remains open

The items this section listed as unverified were settled by the official-wallet run recorded in
`docs/evidence/g0-2026-09-08.md` (shapes only, no personal data):

- Payload: `vct` is `urn:eudi:pid:de:1` (the pinned literal); the age object arrives as shape A
  (`age_equal_or_over` with nested `_sd`, separate `["salt","18",true]` disclosure); `exp` is
  present (1790035200, `iat` 1788825600); payload 929 JSON bytes of 2304.
- Header: 1378 base64url chars of 2304, 1033 decoded bytes, one x5c certificate (824 chars), a
  156-char `kid`, key order `x5c, kid, typ, alg`, `typ` at byte 1001 and `alg` at byte 1019. This
  failed the WP13 check (first 96 bytes) and is what section 8 fixes.
- KB-JWT: `aud` is the `x509_hash` client_id the circuit pins (section 1); the header is the
  30-byte `{"alg":"ES256","typ":"kb+jwt"}` without a `kid` (40 base64url chars); claims `aud`,
  `iat`, `nonce`, `sd_hash`, no `exp` (the companion's freshness check is by `iat` now).
- Sandbox issuer key hash (sha256 of the SEC1 key of the x5c leaf), the value `NoirPidVerifier`
  must pin as `PID_ISSUER_KEY_HASH` for the preprod PID provider:
  `0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079`.
- The real presentation proves with the WP22 circuit: `companion prove` (statement checks,
  gen-prover, nargo execute, bb prove 10.2 s, bb verify ok) with public inputs over18 1, expiry
  1790035200, issuer_key_hash as above.

Still open: the x5c chain to a trust anchor (not checked anywhere, the contract pins the key);
the status list (trust-boundaries.md gap 3); whether the production issuer keeps the same
header layout and `vct` literal; the wallet version string (builder to add to the G0 record).

## 8. WP22: the header window follows the fragments

Observed (G0): the BDR issuer header is `{"x5c":[...],"kid":"...","typ":"dc+sd-jwt","alg":"ES256"}`,
so `alg` and `typ` sit at the end of a 1033-byte header. WP13 decoded a fixed 96-byte prefix and
therefore rejected it. Decoding the whole header in-circuit (2304 base64url chars, 1728 bytes)
would cost far more than the 10 k gates of headroom under 2^20.

Design: the circuit still decodes exactly 128 base64url chars (96 bytes), but their start is a
private input `hdr_window_b64_start` (u32). The circuit asserts `hdr_window_b64_start % 4 == 0`
and `hdr_window_b64_start + 128 <= issuer_header_b64.len()`, copies
`issuer_header_b64[start .. start + 128]` with dynamic reads, decodes them, and asserts
`ALG_FRAGMENT` at `hdr_alg_offset` and the `typ` fragment at `hdr_typ_offset`, both relative to
the window. A 4-aligned base64url slice decodes to the byte slice
`[start * 3 / 4, start * 3 / 4 + 96)` of the decoded header, independent of what precedes or
follows it, because base64 groups of four chars are independent and the header carries no padding
(its length is not a multiple of four, so the last, partial group can never be inside a window
that ends at or before `len`).

Soundness: `issuer_header_b64` is the first part of the signing input the circuit hashes and
verifies under the issuer key, so any window inside `[0, len)` is a slice of the signed header
and a fragment found there is a fragment of the signed header. The prover cannot gain anything
by choosing the start: a window that does not contain both fragments fails one of the two
assertions, and a window that does proves what the fixed prefix proved before (the header
declares `alg` ES256 and `typ` dc+sd-jwt or vc+sd-jwt somewhere in its signed bytes). What the
check never established, before or now, is that these are top-level JSON members rather than,
say, part of a string value; that is unchanged from WP13 and is why the issuer key hash, not
the header, is the trust anchor. The former `header[0] == '{'` assertion was dropped: it only
held for a window at offset 0 and carried no security weight (the KB-JWT header keeps its own).

Generator (`tools/gen-prover.ts`, mirrored in `prover-mobile-core/src/inputs.rs`): decode the
whole header, locate both fragments, take `lo` = the first byte of the earlier fragment and
`hi` = the end of the later one, set `start = min(floor(lo / 3) * 4, floor((len - 128) / 4) * 4)`
(the largest 4-aligned start whose window begins at or before `lo`, clamped to the header end),
and refuse if `hi > start * 3 / 4 + 96` ("alg and typ do not share one 96-byte window"). The two
fragments are 13 and 17 bytes, so they share a window whenever at most 66 bytes separate them,
which holds for every observed header (adjacent in ERICA and BDR). The tamper mode `hdr-window`
moves the window to the other end of the header and keeps the relative offsets; the circuit
rejects it with "issuer alg is not ES256".

Fixture: `prover-sp1/fixtures/bdr-layout-input.json` / `bdr-layout-over18.sdjwt`, minted by
`companion mint-fixture --header-layout x5c-first` with the realistic vector's issuer key (same
issuer_key_hash, subject, challenge and expiry): header `{"x5c":[<772-char leaf>],"kid":<156
chars>,"typ":"dc+sd-jwt","alg":"ES256"}`, 981 decoded bytes (1308 base64url), `typ` at byte 949,
`alg` at 967, window start 1180 (byte 885), relative offsets 64 and 82. (The observed header is
1033 bytes because the BDR leaf is 824 base64 chars; the companion's self-signed leaf is shorter,
the layout and the window mechanics are the same.)

Cost: 255,170 to 255,559 ACIR opcodes, UltraHonk circuit_size 1,038,584 to 1,039,135 (+551,
still 2^20, 9,441 gates of headroom). `bb prove` on the real presentation: 10.2 s wall inside the
companion (with the machine busy; the fixture proves in about 4 s idle). The public input layout
is unchanged (86 words). New VK, `VK_HASH`
`0x2e13794a77895882c11e891c641277cede611206c575ca2a35e8fe7724758a64`, regenerated
`PidSdJwtUltraHonkVerifier.sol` and `contracts/test/fixtures/noir/*` (same public inputs as
before, new proof and vk_hash).
