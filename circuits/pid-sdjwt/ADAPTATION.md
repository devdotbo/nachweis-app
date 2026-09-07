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

1. Header is a private input `issuer_header_b64` (max 2048). Only the first 40
   base64url chars are pinned: they encode `{"alg":"ES256","typ":"dc+sd-jw`, so
   alg and typ are fixed without decoding the x5c chain. The header content
   otherwise is not interpreted (x5c is not checked).
2. `"vct":"urn:eudi:pid:de:1"` must appear at `vct_offset` in the raw payload.
3. Age: the disclosure `["<salt>","18",true]` is rebuilt from the salt, digested
   as in d10, and must sit at entry `age_digest_index` of the array that starts
   with `"age_equal_or_over":{"_sd":[` at `age_sd_offset`. Entries are 43 chars
   in quotes with a 46 byte stride; every earlier entry must be followed by `,`
   so the array cannot have closed before the chosen entry. This anchors the
   digest inside the age object, not just anywhere in the payload.
4. `"cnf":{"jwk":{` must appear at `cnf_offset`; `x_offset` and `y_offset` must
   lie within 128 bytes after it. Coordinates are read and decoded as in d10.
5. `"exp":<10 digits>` terminated by `,` or `}` is parsed from the issuer
   payload and returned as `expiry`. The KB-JWT `exp` is not read: it belongs
   to the presentation, not the credential (sandbox wallets set it to
   iat + 300, which would expire the on-chain decision five minutes after the
   presentation), and the bridge checks it against its clock before proving
   (`prover-sp1/lib` `check_kb_freshness`, same rule as the SP1 host).
6. KB-JWT: constant header `eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9`, raw KB
   payload is a private input (max 320), re-encoded, hashed, verified under
   the cnf key. `"aud":"https://self-issued.me/v2"` is a constant fragment.
7. Nonce: `sha256(subject || challenge)` computed in-circuit, hex-encoded and
   compared with the 64 chars after `"nonce":"`.
8. sd_hash: the preimage `header.payload.sig~d1~...~dN~` is assembled from the
   signing input, the base64url signature and a `disclosures_tail` input (must
   start and end with `~`), hashed and compared with the 43 chars after
   `"sd_hash":"`. The other disclosures are opaque to the circuit.
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

Sizes: HEADER_B64_MAX 2048, PAYLOAD_MAX_LEN 1024 (raw), TAIL_MAX 512,
KB_PAYLOAD_MAX 320, MAX_AGE_ENTRIES 8. The minted vector uses 1855 / 739 /
186 / 200. Every max length costs SHA blocks and base64 gates; a real BDR PID
payload with 20+ top level digests and a status claim may need PAYLOAD_MAX_LEN
1536 (untested).

## Assumptions and what is not checked

- JSON shapes are matched byte for byte at prover-supplied offsets: serde_json
  key order in `cnf.jwk` (crv, kty, x, y), no whitespace, 43 char digests. A
  wallet that serialises differently needs new fragments in constants.nr.
- The fragments `"vct":...`, `"exp":`, `"cnf":{"jwk":{` are assumed to occur
  once in the payload as top level claims; gen-prover.ts refuses vectors where
  a fragment occurs twice, the circuit itself does not check top-levelness.
- Not checked in-circuit: x5c chain to a trust anchor (the verifier contract
  pins issuerKeyHash instead), status list, iat/nbf, freshness window (the
  contract compares expiry with block.timestamp), the other presented
  disclosures, KB-JWT exp and iat (bridge, off chain).
