# Adaptation of d10_swiyu_jwt to the German EUDI PID

## What the upstream circuit checked (d10_swiyu_jwt, swiyu Swiss E-ID)

Inputs: raw JWT payload (BoundedVec, max 2048), 64 byte issuer signature,
birth_date salt and value, three offsets (`dob_sd_offset`, `x_offset`,
`y_offset`), a 64 byte device signature; public: issuer key x/y, `now_date`,
32 byte `challenge_nonce`.

1. Issuer signature: base64url-encodes the raw payload in-circuit, prepends the
   constant header `base64url({"typ":"JWT","alg":"ES256"})` (36 chars) and a
   dot, SHA-256, `ecdsa_secp256r1::verify_signature` under the public issuer
   key. The header is a compile-time constant, so alg/typ are pinned but the
   swiyu header has no x5c.
2. Age: rebuilds the disclosure `["<salt>","birth_date","<YYYY-MM-DD>"]`,
   base64url-encodes it, SHA-256, base64url of the digest (43 chars) and
   compares those 43 bytes with `payload[dob_sd_offset..]`. Then parses the
   date and checks `now_date >= birth_date + 25 years`. `now_date` is a public
   input; no check that the offset points into the top level `_sd` array.
3. Holder binding: expects `"x":"<43>"` at `x_offset` and `"y":"<43>"` at
   `y_offset` (no check that they are inside `cnf`), base64url-decodes both,
   verifies the device signature over the raw 32 byte `challenge_nonce`. There
   is no KB-JWT; the device signs the nonce directly.
4. Not checked: exp, vct, iss, header content beyond the constant, sd_hash.

Fixed offsets in the shipped vector: 745 (dob digest), 1471 (x), 1521 (y).

## Where the German PID presentation differs

| Aspect | swiyu (d10) | German PID (our minted vector, ERICA header) |
| --- | --- | --- |
| Header | `{"typ":"JWT","alg":"ES256"}`, constant | `{"alg":"ES256","typ":"dc+sd-jwt","x5c":[...]}`, 1855 base64url chars |
| vct | `betaid-sdjwt`, not checked | `urn:eudi:pid:de:1`, must be checked |
| Age claim | `birth_date` in top level `_sd`, date arithmetic with public `now_date` | `age_equal_or_over` object with its own `_sd`; disclosure `["salt","18",true]` |
| Holder key | `cnf.jwk` with key order kty, crv, x, y | `cnf.jwk` with key order crv, kty, x, y (serde_json) |
| Holder binding | device signs raw 32 byte nonce | KB-JWT `{"alg":"ES256","typ":"kb+jwt"}` over `{"aud","exp","iat","nonce","sd_hash"}` |
| Nonce | raw 32 bytes | lowercase hex of sha256(address20 || challenge32), 64 chars |
| sd_hash | absent | base64url(sha256(issuerJwt ~d1~...~dN~)) in the KB-JWT |
| Expiry | not exposed | issuer JWT `exp` exposed; the KB-JWT `exp` (iat + 300 in sandbox wallets) is checked off chain by the bridge |
| Signature s | happened to be low-s | high-s in the vector; ECDSA blackbox rejects high-s |

## Minimal adaptation chosen

Kept: the encode-payload-in-circuit design, the disclosure digest scheme, the
`extract_coord_for_key` JWK reader, and the two `ecdsa_secp256r1` calls.

Changed (src/main.nr, src/constants.nr):

1. Header is a private input `issuer_header_b64` (max 2304). Its first 128
   base64url chars are decoded in-circuit (96 bytes) and must contain
   `"alg":"ES256"` and `"typ":"dc+sd-jwt"` (or `vc+sd-jwt`) at prover offsets,
   so alg and typ are fixed for any key order without decoding the x5c chain.
   (Before the realism pass the first 40 chars were pinned as a constant, which
   assumed the key order alg, typ.) The header is otherwise not interpreted
   (x5c is not checked).
2. `"vct":"urn:eudi:pid:de:1"` must appear at `vct_offset` in the raw payload.
3. Age: the disclosure `["<salt>","18",true]` is rebuilt from the salt, digested
   as in d10, and must sit quoted at `age_target_offset` inside the array that
   starts with `"age_equal_or_over":{"_sd":[` at `age_sd_offset` (shape A, the
   object plain in the payload). "Inside" is checked with prefix counts of `]`
   and `}`: none may occur between the array start and the target, so
   whitespace, digest order and array length do not matter. (Before the realism
   pass a 46 byte stride and an `age_digest_index` were assumed.) Two more
   shapes: B, the age object is itself a disclosure
   `["salt","age_equal_or_over",{"_sd":[…]}]` supplied raw as
   `age_obj_disclosure`; its digest must sit inside an `"_sd":[` array of the
   payload (`sd_offset`, `age_obj_digest_offset`), the disclosure must start
   `["<salt>","age_equal_or_over",{` and the 18 digest is searched inside it.
   C, the same but with plain values: `"18":true` must sit inside the object.
   Flags `age_obj_disclosed`, `age_leaf_disclosed` select the shape; the
   checks of the inactive shapes are evaluated with their assertions disabled.
4. `"cnf":{"jwk":{` must appear at `cnf_offset`; `x_offset` and `y_offset` must
   lie within 256 bytes after it (a `kid` may precede them). Coordinates are
   read and decoded as in d10.
5. `"exp":<10 digits>` terminated by `,` or `}` is parsed from the issuer
   payload and returned as `expiry`. The KB-JWT `exp` is not read: it belongs
   to the presentation, not the credential (sandbox wallets set it to
   iat + 300, which would expire the on-chain decision five minutes after the
   presentation), and the bridge checks it against its clock before proving
   (`prover-sp1/lib` `check_kb_freshness`, same rule as the SP1 host).
6. KB-JWT: the raw header is a private input (max 128, so a `kid` fits, as in
   the ERICA captures) and must contain `"alg":"ES256"` and `"typ":"kb+jwt"`
   at prover offsets; the raw KB payload is a private input (max 384); both are
   re-encoded, hashed, verified under the cnf key. `"aud":"<client_id>"` is a
   constant fragment with the registered `x509_hash` client_id (REALISM.md).
7. Nonce: `sha256(subject || challenge)` computed in-circuit, hex-encoded and
   compared with the 64 chars after `"nonce":"`.
8. sd_hash: the preimage `header.payload.sig~d1~...~dN~` shares its prefix
   with the signing input: `header.payload` is compressed once up to its last
   full SHA block, and the signature hash and the sd_hash are finished from that
   state (`sha256_finish`, an in-circuit padding continuation tested against
   `sha256_var`) with the base64url signature and the `disclosures_tail` input
   (must start and end with `~`). The result is compared with the 43 chars
   after `"sd_hash":"`. The other disclosures are opaque to the circuit.
9. Low-s: the issuer signature enters twice, as `issuer_sig_b64` (kept
   verbatim in the sd_hash preimage) and as `issuer_sig` (low-s form for the
   blackbox). The circuit checks same r and s == decoded s or s + decoded s ==
   n. The KB signature only enters in low-s form (it is not part of any hash).

Public interface: `subject: pub [u8; 20]` and the return
`(issuer_key_hash [u8; 32], over18 u8, expiry u64, nonce [u8; 32])`, 86 field
elements, one byte per element except expiry. issuer_key_hash is
sha256(0x04 || x || y) of the issuer key, computed in-circuit (2 SHA blocks),
matching the SP1 public values. vct is a constant check and not exposed;
over18 is a constant 1 whenever the proof verifies (nargo warns about the
constant return; kept for ABI symmetry with the SP1 layout).

Sizes: HEADER_B64_MAX 2304, PAYLOAD_MAX_LEN 2304 (raw), TAIL_MAX 768,
KB_HEADER_MAX 128, KB_PAYLOAD_MAX 384, AGE_OBJ_DISC_MAX 512. The realistic
vector uses 2138 / 1563 / 186 / 58 / 228; the derivation of the bounds from a
reconstructed 23-claim PID is in REALISM.md, section 4. Every max length costs
SHA blocks and base64 gates; the circuit is 1,038,584 gates, 10 k under 2^20.

## Assumptions and what is not checked

- JSON shapes are matched byte for byte at prover-supplied offsets: no
  whitespace inside the fixed fragments (`"vct":"…"`, `"age_equal_or_over":{"_sd":[`,
  `"cnf":{"jwk":{`, `"exp":`, `"aud":"…"`, `"nonce":"`, `"sd_hash":"`), 43 char
  digests. Key order does not matter anywhere (fragments are found by offset;
  `x`, `y` in any order inside `cnf.jwk`). An issuer that serialises with
  spaces inside those fragments needs new fragments in constants.nr.
- The fragments `"vct":...`, `"exp":`, `"cnf":{"jwk":{` are assumed to occur
  once in the payload as top level claims; gen-prover.ts refuses vectors where
  a fragment occurs twice, the circuit itself does not check top-levelness.
  Likewise `sd_offset` may point at any `"_sd":[` of the signed payload, not
  only the top-level one.
- Not checked in-circuit: x5c chain to a trust anchor (the verifier contract
  pins issuerKeyHash instead), status list, iat/nbf, freshness window (the
  contract compares expiry with block.timestamp), the other presented
  disclosures, KB-JWT exp and iat (bridge, off chain).
