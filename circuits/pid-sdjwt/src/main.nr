// SPDX-License-Identifier: MPL-2.0
// Derived from eid-privacy/zkp-pocs noir/d10_swiyu_jwt (MPL-2.0), adapted to the
// German EUDI PID (vct urn:eudi:pid:de:1) SD-JWT presentation with KB-JWT.
// Shapes and bounds: ADAPTATION.md, REALISM.md.
use noir_base64::{BASE64_URL_DECODER, BASE64_URL_ENCODER};
use sha256::{digest, partial_sha256_var_interstitial, sha256_var};
use std::hash::sha256_compression;

mod constants;
use constants::{
    AGE18_TRUE_FRAGMENT, AGE_CLAIM_NAME, AGE_DISC_OBJ_FRAGMENT, AGE_DISC_SD_FRAGMENT,
    AGE_OBJ_DISC_MAX, AGE_SD_FRAGMENT, ALG_FRAGMENT, AUD_FRAGMENT, B64_32_LEN,
    B64_64_LEN, CNF_FRAGMENT, CNF_WINDOW, DISCLOSURE_MAX_LEN, EXP_FRAGMENT, HEADER_B64_MAX,
    KB_HEADER_MAX, KB_PAYLOAD_MAX, KB_TYP_FRAGMENT, NONCE_FRAGMENT, PAYLOAD_MAX_LEN,
    SALT_MAX_LEN, SD_FRAGMENT, SD_HASH_FRAGMENT, TAIL_MAX, TYP_SD_JWT_FRAGMENT,
    VCT_FRAGMENT,
};

global ENCODED_PAYLOAD_MAX_LEN: u32 = (PAYLOAD_MAX_LEN * 4 + 2) / 3;
global ENCODED_KB_PAYLOAD_MAX_LEN: u32 = (KB_PAYLOAD_MAX * 4 + 2) / 3;
global ENCODED_KB_HEADER_MAX_LEN: u32 = (KB_HEADER_MAX * 4 + 2) / 3;

/// header_b64 "." payload_b64
global SIGNING_INPUT_MAX_LEN: u32 = HEADER_B64_MAX + 1 + ENCODED_PAYLOAD_MAX_LEN;
/// What follows the last full SHA block of the signing input in the sd_hash preimage:
/// up to 63 bytes of the signing input, "." sig_b64 "~d1~...~dN~".
global SD_HASH_REST_MAX_LEN: u32 = 63 + 1 + B64_64_LEN + TAIL_MAX;
global SD_HASH_REST_BLOCKS: u32 = (SD_HASH_REST_MAX_LEN + 9 + 63) / 64;
/// kb_header_b64 "." kb_payload_b64
global KB_SIGNING_INPUT_MAX_LEN: u32 = ENCODED_KB_HEADER_MAX_LEN + 1 + ENCODED_KB_PAYLOAD_MAX_LEN;
/// base64url chars of the issuer header decoded in-circuit to find alg and typ.
global HEADER_PREFIX_B64: u32 = 128;
global HEADER_PREFIX_RAW: u32 = 96;

/// SHA-256 initial hash value (FIPS 180-4), the state before any block.
global SHA256_INITIAL_STATE: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

global ASCII_DOT: u8 = 46;
global ASCII_TILDE: u8 = 126;
global ASCII_QUOTE: u8 = 34;
global ASCII_COMMA: u8 = 44;
global ASCII_LBRACE: u8 = 123;
global ASCII_RBRACE: u8 = 125;
global ASCII_RBRACKET: u8 = 93;
global ASCII_X: u8 = 120;
global ASCII_Y: u8 = 121;
global ASCII_D: u8 = 100;
global ASCII_V: u8 = 118;

/// Asserts that `hay[offset..offset+N] == needle` and that the window is inside `len`.
fn assert_fragment_at<let H: u32, let N: u32, let M: u32>(
    hay: [u8; H],
    len: u32,
    offset: u32,
    needle: [u8; N],
    msg: str<M>,
) {
    assert_fragment_at_if(true, hay, len, offset, needle, msg);
}

/// Same as assert_fragment_at, but only when `active` (the fragment checks of the
/// unused age shapes are inactive). Reads are clamped so an inactive check never
/// indexes out of bounds.
fn assert_fragment_at_if<let H: u32, let N: u32, let M: u32>(
    active: bool,
    hay: [u8; H],
    len: u32,
    offset: u32,
    needle: [u8; N],
    msg: str<M>,
) {
    let in_range = (offset + N <= len) & (len <= H);
    assert(!active | in_range, msg);
    for i in 0..N {
        let idx = if active & in_range { offset + i } else { 0 };
        assert(!active | (hay[idx] == needle[i]), msg);
    }
}

/// Reads `hay[idx]` when `idx < len` (and inside the array), else 0.
fn byte_at<let H: u32>(hay: [u8; H], len: u32, idx: u32) -> u8 {
    let ok = (idx < len) & (idx < H);
    let safe = if ok { idx } else { 0 };
    let b = hay[safe];
    if ok {
        b
    } else {
        0
    }
}

/// Number of ']' and '}' bytes in hay[0..i) for every i, so that "the array or object opened
/// before `from` is still open at `to`" is `counts[from] == counts[to]` (two lookups instead
/// of a per-position scan; bytes beyond `len` never matter because `to <= len` is enforced).
fn closer_counts<let H: u32>(hay: [u8; H]) -> [u32; H + 1] {
    let mut counts: [u32; H + 1] = [0; H + 1];
    let mut c: u32 = 0;
    for i in 0..H {
        let b = hay[i];
        let closer = (b == ASCII_RBRACKET) | (b == ASCII_RBRACE);
        c = c + (closer as u32);
        counts[i + 1] = c;
    }
    counts
}

/// Asserts (when `active`) that no ']' or '}' occurs in hay[from..to): the JSON array or
/// object opened before `from` is still open at `to`.
fn assert_open_between<let H: u32>(
    active: bool,
    counts: [u32; H + 1],
    len: u32,
    from: u32,
    to: u32,
) {
    let ok = (to >= from) & (to <= len) & (len <= H);
    assert(!active | ok, "target outside the container");
    let a = counts[if active & ok { from } else { 0 }];
    let b = counts[if active & ok { to } else { 0 }];
    assert(!active | (a == b), "container closed before the target");
}

/// Asserts (when `active`) `"<digest>"` at `at`.
fn assert_quoted_digest_at_if<let H: u32>(
    active: bool,
    hay: [u8; H],
    len: u32,
    at: u32,
    expected: [u8; B64_32_LEN],
) {
    assert(!active | (at + 45 <= len), "digest out of range");
    assert(!active | (byte_at(hay, len, at) == ASCII_QUOTE), "digest not quoted");
    for i in 0..B64_32_LEN {
        assert(!active | (byte_at(hay, len, at + 1 + i) == expected[i]), "disclosure digest mismatch");
    }
    assert(!active | (byte_at(hay, len, at + 44) == ASCII_QUOTE), "digest not quoted");
}

/// Asserts (when `active`) that `hay` is a disclosure `["<salt>","<name>...` whose claim
/// name starts at `anchor`: `["` at 0, a salt without quotes, `",` right before `anchor`.
fn assert_disclosure_prefix_if<let H: u32>(active: bool, hay: [u8; H], len: u32, anchor: u32) {
    assert(!active | ((anchor >= 4) & (anchor + 1 <= len)), "disclosure anchor out of range");
    assert(!active | (byte_at(hay, len, 0) == 91), "disclosure must start with [");
    assert(!active | (byte_at(hay, len, 1) == ASCII_QUOTE), "disclosure salt not quoted");
    for i in 2..(SALT_MAX_LEN + 3) {
        let inside = active & (i + 2 < anchor);
        assert(!inside | (byte_at(hay, len, i) != ASCII_QUOTE), "disclosure salt contains a quote");
    }
    assert(!active | (anchor - 2 < SALT_MAX_LEN + 3), "disclosure salt too long");
    assert(!active | (byte_at(hay, len, anchor - 2) == ASCII_QUOTE), "disclosure salt not terminated");
    assert(!active | (byte_at(hay, len, anchor - 1) == ASCII_COMMA), "disclosure name not preceded by ,");
}

/// Finishes a SHA-256 whose first `total_len - len` bytes (a multiple of 64) were already
/// compressed into `h0`: appends `msg[..len]`, the 0x80 byte, zero padding and the 64-bit
/// big-endian bit length of the whole message, in at most NB blocks.
fn sha256_finish<let N: u32, let NB: u32>(
    h0: [u32; 8],
    msg: [u8; N],
    len: u32,
    total_len: u32,
) -> [u8; 32] {
    std::static_assert(N + 9 <= NB * 64, "sha256_finish: NB too small for N");
    assert(len <= N, "sha256_finish: len out of range");
    let mut padded: [u8; NB * 64] = [0; NB * 64];
    for i in 0..N {
        if i < len {
            padded[i] = msg[i];
        }
    }
    padded[len] = 128;
    let padded_len = ((len + 9 + 63) / 64) * 64;
    let bits: u64 = (total_len as u64) * 8;
    for k in 0..8 {
        let shift: u64 = (8 * (7 - k)) as u64;
        padded[padded_len - 8 + k] = ((bits >> shift) & 255) as u8;
    }
    let blocks = padded_len / 64;
    let mut h = h0;
    for b in 0..NB {
        let mut block: [u32; 16] = [0; 16];
        for j in 0..16 {
            let p = b * 64 + j * 4;
            block[j] = ((padded[p] as u32) << 24)
                | ((padded[p + 1] as u32) << 16)
                | ((padded[p + 2] as u32) << 8)
                | (padded[p + 3] as u32);
        }
        let next = sha256_compression(block, h);
        if b < blocks {
            h = next;
        }
    }
    let mut out: [u8; 32] = [0; 32];
    for i in 0..8 {
        out[4 * i] = ((h[i] >> 24) & 255) as u8;
        out[4 * i + 1] = ((h[i] >> 16) & 255) as u8;
        out[4 * i + 2] = ((h[i] >> 8) & 255) as u8;
        out[4 * i + 3] = (h[i] & 255) as u8;
    }
    out
}

/// Reads a 10-digit decimal unix timestamp at `offset`, requires it to be
/// terminated by ',' or '}' (so it is a complete JSON number).
fn read_timestamp<let H: u32>(hay: [u8; H], len: u32, offset: u32) -> u64 {
    assert(offset + 11 <= len, "timestamp out of range");
    let mut value: u64 = 0;
    for i in 0..10 {
        let d = hay[offset + i];
        assert((d >= 48) & (d <= 57), "timestamp is not a 10 digit number");
        value = value * 10 + (d as u64 - 48);
    }
    let term = hay[offset + 10];
    assert((term == ASCII_COMMA) | (term == ASCII_RBRACE), "timestamp not terminated");
    value
}

/// Builds the disclosure ["<salt>","18",true] byte for byte.
fn build_age_disclosure(salt: BoundedVec<u8, SALT_MAX_LEN>) -> BoundedVec<u8, DISCLOSURE_MAX_LEN> {
    let mut disclosure: BoundedVec<u8, DISCLOSURE_MAX_LEN> = BoundedVec::new();
    disclosure.extend_from_array("[\"".as_bytes());
    disclosure.extend_from_bounded_vec(salt);
    disclosure.extend_from_array("\",\"".as_bytes());
    disclosure.extend_from_array(AGE_CLAIM_NAME);
    disclosure.extend_from_array("\",true]".as_bytes());
    disclosure
}

/// base64url(sha256(base64url(raw disclosure))), the digest form used in `_sd` arrays.
fn disclosure_digest<let N: u32>(raw: BoundedVec<u8, N>) -> [u8; B64_32_LEN] {
    let encoded = BASE64_URL_ENCODER::encode_var(raw);
    BASE64_URL_ENCODER::encode(sha256_var(encoded.storage(), encoded.len()))
}

/// Reads the 43 base64url chars of a quoted JWK coordinate "k":"<43>" at key_offset.
fn extract_coord_for_key<let N: u32>(
    payload_storage: [u8; N],
    len: u32,
    key_offset: u32,
    key_ascii: u8,
) -> [u8; B64_32_LEN] {
    let expected_prefix: [u8; 5] = [34, key_ascii, 34, 58, 34];
    assert_fragment_at(
        payload_storage,
        len,
        key_offset,
        expected_prefix,
        "cnf coordinate key not found     ",
    );
    assert(
        payload_storage[key_offset + 5 + B64_32_LEN] == ASCII_QUOTE,
        "cnf coordinate not terminated",
    );
    let mut coord_bytes: [u8; B64_32_LEN] = [0; B64_32_LEN];
    for i in 0..B64_32_LEN {
        coord_bytes[i] = payload_storage[key_offset + 5 + i];
    }
    coord_bytes
}

/// secp256r1 group order n, big endian.
global P256_ORDER: [u8; 32] = [
    255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 188, 230, 250, 173, 167,
    23, 158, 132, 243, 185, 202, 194, 252, 99, 37, 81,
];

/// The JWS carries the signature as produced (s may be > n/2); the ECDSA
/// blackbox only accepts low-s. `sig` is the low-s form supplied by the prover:
/// same r, and s equal to the decoded s or to n - decoded s.
fn assert_same_signature_low_s(sig: [u8; 64], decoded: [u8; 64]) {
    for i in 0..32 {
        assert(sig[i] == decoded[i], "signature r mismatch");
    }
    let mut equal = true;
    let mut sums_to_n = true;
    let mut carry: u16 = 0;
    for k in 0..32 {
        let i = 63 - k;
        equal &= sig[i] == decoded[i];
        let sum: u16 = sig[i] as u16 + decoded[i] as u16 + carry;
        sums_to_n &= (sum & 255) as u8 == P256_ORDER[i - 32];
        carry = sum >> 8;
    }
    sums_to_n &= carry == 0;
    assert(equal | sums_to_n, "signature s is neither s nor n - s");
}

fn hex_nibble(n: u8) -> u8 {
    if n < 10 {
        48 + n
    } else {
        87 + n
    }
}

fn main(
    // Private inputs: the presentation, split
    issuer_header_b64: BoundedVec<u8, HEADER_B64_MAX>,
    // Offsets of "alg":"ES256" and "typ":"dc+sd-jwt" in the first 96 decoded header bytes
    hdr_alg_offset: u32,
    hdr_typ_offset: u32,
    payload: BoundedVec<u8, PAYLOAD_MAX_LEN>,
    issuer_sig_b64: [u8; B64_64_LEN],
    issuer_sig: [u8; 64],
    disclosures_tail: BoundedVec<u8, TAIL_MAX>,
    kb_header: BoundedVec<u8, KB_HEADER_MAX>,
    // Offsets of "alg":"ES256" and "typ":"kb+jwt" in the raw KB-JWT header
    kb_alg_offset: u32,
    kb_typ_offset: u32,
    kb_payload: BoundedVec<u8, KB_PAYLOAD_MAX>,
    kb_signature: [u8; 64],
    // Issuer key (SEC1 coordinates); exposed only as sha256(0x04||x||y)
    issuer_pub_x: [u8; 32],
    issuer_pub_y: [u8; 32],
    // Age witness (shapes A, B, C in REALISM.md section 3):
    //   age_obj_disclosed 0: the age object is plain in the payload (A)
    //   age_obj_disclosed 1: the age object is `age_obj_disclosure`, its digest sits in the
    //     top-level "_sd" that starts at sd_offset, at age_obj_digest_offset (B, C)
    //   age_leaf_disclosed 1: "18" is the separate disclosure ["age_salt","18",true] (A, B)
    //   age_leaf_disclosed 0: "18":true is plain inside the disclosed object (C)
    // age_sd_offset: start of the age fragment in the container (payload for A, disclosure
    //   for B and C); age_target_offset: the quoted digest (A, B) or "18":true (C) inside it.
    age_salt: BoundedVec<u8, SALT_MAX_LEN>,
    age_obj_disclosed: u8,
    age_leaf_disclosed: u8,
    age_obj_disclosure: BoundedVec<u8, AGE_OBJ_DISC_MAX>,
    sd_offset: u32,
    age_obj_digest_offset: u32,
    age_sd_offset: u32,
    age_target_offset: u32,
    // Offsets into the raw issuer payload
    vct_offset: u32,
    cnf_offset: u32,
    x_offset: u32,
    y_offset: u32,
    exp_offset: u32,
    // Offsets into the raw KB-JWT payload
    kb_aud_offset: u32,
    kb_nonce_offset: u32,
    kb_sd_hash_offset: u32,
    // Challenge from the verifier (nonce preimage = subject || challenge)
    challenge: [u8; 32],
    // Public input: bound Ethereum address
    subject: pub [u8; 20],
) -> pub ([u8; 32], u8, u64, [u8; 32]) {
    // ---- 1. issuer JWT: alg/typ, rebuild header.payload, verify ES256 ---------
    assert(issuer_header_b64.len() >= HEADER_PREFIX_B64, "issuer header too short");
    let header_storage = issuer_header_b64.storage();
    let mut header_prefix: [u8; HEADER_PREFIX_B64] = [0; HEADER_PREFIX_B64];
    for i in 0..HEADER_PREFIX_B64 {
        header_prefix[i] = header_storage[i];
    }
    let header_head: [u8; HEADER_PREFIX_RAW] = BASE64_URL_DECODER::decode(header_prefix);
    assert(header_head[0] == ASCII_LBRACE, "issuer header is not a JSON object");
    assert_fragment_at(header_head, HEADER_PREFIX_RAW, hdr_alg_offset, ALG_FRAGMENT, "issuer alg is not ES256          ");
    assert(hdr_typ_offset + 17 <= HEADER_PREFIX_RAW, "issuer typ out of range");
    for i in 0..17 {
        let c = header_head[hdr_typ_offset + i];
        if i == 7 {
            assert((c == ASCII_D) | (c == ASCII_V), "issuer typ is not dc+sd-jwt or vc+sd-jwt");
        } else {
            assert(c == TYP_SD_JWT_FRAGMENT[i], "issuer typ is not dc+sd-jwt or vc+sd-jwt");
        }
    }

    let encoded_payload = BASE64_URL_ENCODER::encode_var(payload);
    let mut signing_input: BoundedVec<u8, SIGNING_INPUT_MAX_LEN> = BoundedVec::new();
    signing_input.extend_from_bounded_vec(issuer_header_b64);
    signing_input.push(ASCII_DOT);
    signing_input.extend_from_bounded_vec(encoded_payload);
    let s_len = signing_input.len();
    let s_rem = s_len % 64;
    let s_full = s_len - s_rem;
    let s_storage = signing_input.storage();
    // Shared SHA-256 state after the full blocks of header.payload; both the signature hash
    // and the sd_hash continue from it.
    let h_prefix = partial_sha256_var_interstitial(SHA256_INITIAL_STATE, s_storage, s_full);
    let mut s_tail: [u8; 63] = [0; 63];
    for i in 0..63 {
        s_tail[i] = byte_at(s_storage, s_len, s_full + i);
    }
    let signing_hash = sha256_finish::<63, 2>(h_prefix, s_tail, s_rem, s_len);

    let decoded_signature: [u8; 64] = BASE64_URL_DECODER::decode(issuer_sig_b64);
    assert_same_signature_low_s(issuer_sig, decoded_signature);
    assert(
        std::ecdsa_secp256r1::verify_signature(issuer_pub_x, issuer_pub_y, issuer_sig, signing_hash),
        "Invalid issuer JWT signature",
    );

    let mut sec1: [u8; 65] = [0; 65];
    sec1[0] = 4;
    for i in 0..32 {
        sec1[1 + i] = issuer_pub_x[i];
        sec1[33 + i] = issuer_pub_y[i];
    }
    let issuer_key_hash: [u8; 32] = digest(sec1);

    // ---- 2. payload claims: vct, age disclosure, cnf, exp ----------------------
    let payload_storage = payload.storage();
    let payload_len = payload.len();

    assert_fragment_at(
        payload_storage,
        payload_len,
        vct_offset,
        VCT_FRAGMENT,
        "vct is not urn:eudi:pid:de:1    ",
    );

    // age_equal_or_over.18: the digest of ["salt","18",true] must sit inside the age
    // object's "_sd" (shapes A, B), or "18":true inside the disclosed plain object (C).
    assert(age_obj_disclosed <= 1, "age_obj_disclosed must be 0 or 1");
    assert(age_leaf_disclosed <= 1, "age_leaf_disclosed must be 0 or 1");
    let obj_disclosed = age_obj_disclosed == 1;
    let leaf_disclosed = age_leaf_disclosed == 1;
    let shape_a = !obj_disclosed;
    let shape_b = obj_disclosed & leaf_disclosed;
    let shape_c = obj_disclosed & !leaf_disclosed;
    assert(shape_a | shape_b | shape_c, "age shape");
    assert(!shape_a | leaf_disclosed, "age object in the payload needs the 18 disclosure");

    let expected_digest = disclosure_digest(build_age_disclosure(age_salt));
    let disc_storage = age_obj_disclosure.storage();
    let disc_len = age_obj_disclosure.len();
    let payload_closers = closer_counts(payload_storage);
    let disc_closers = closer_counts(disc_storage);

    // B, C: anchor the age object disclosure in the top-level "_sd" of the signed payload.
    let obj_digest = disclosure_digest(age_obj_disclosure);
    assert_fragment_at_if(obj_disclosed, payload_storage, payload_len, sd_offset, SD_FRAGMENT, "_sd array not found              ");
    assert_open_between(obj_disclosed, payload_closers, payload_len, sd_offset + 7, age_obj_digest_offset);
    assert_quoted_digest_at_if(obj_disclosed, payload_storage, payload_len, age_obj_digest_offset, obj_digest);
    assert_disclosure_prefix_if(obj_disclosed, disc_storage, disc_len, age_sd_offset);

    // A: "age_equal_or_over":{"_sd":[ ... "<digest>" in the payload.
    assert_fragment_at_if(shape_a, payload_storage, payload_len, age_sd_offset, AGE_SD_FRAGMENT, "age_equal_or_over._sd not found  ");
    assert_open_between(shape_a, payload_closers, payload_len, age_sd_offset + 28, age_target_offset);
    assert_quoted_digest_at_if(shape_a, payload_storage, payload_len, age_target_offset, expected_digest);
    // B: ["salt","age_equal_or_over",{"_sd":[ ... "<digest>" in the disclosure.
    assert_fragment_at_if(shape_b, disc_storage, disc_len, age_sd_offset, AGE_DISC_SD_FRAGMENT, "disclosed age object has no _sd  ");
    assert_open_between(shape_b, disc_closers, disc_len, age_sd_offset + 28, age_target_offset);
    assert_quoted_digest_at_if(shape_b, disc_storage, disc_len, age_target_offset, expected_digest);
    // C: ["salt","age_equal_or_over",{ ... "18":true in the disclosure.
    assert_fragment_at_if(shape_c, disc_storage, disc_len, age_sd_offset, AGE_DISC_OBJ_FRAGMENT, "disclosed age object not found   ");
    assert_open_between(shape_c, disc_closers, disc_len, age_sd_offset + 21, age_target_offset);
    assert_fragment_at_if(shape_c, disc_storage, disc_len, age_target_offset, AGE18_TRUE_FRAGMENT, "age 18 is not true               ");
    let c_term = byte_at(disc_storage, disc_len, age_target_offset + 9);
    assert(!shape_c | ((c_term == ASCII_COMMA) | (c_term == ASCII_RBRACE)), "age 18 value not terminated");
    let over18: u8 = 1;

    // holder key from cnf.jwk
    assert_fragment_at(
        payload_storage,
        payload_len,
        cnf_offset,
        CNF_FRAGMENT,
        "cnf.jwk not found               ",
    );
    assert((x_offset > cnf_offset) & (x_offset < cnf_offset + CNF_WINDOW), "x outside cnf");
    assert((y_offset > cnf_offset) & (y_offset < cnf_offset + CNF_WINDOW), "y outside cnf");
    let holder_x_b64 = extract_coord_for_key(payload_storage, payload_len, x_offset, ASCII_X);
    let holder_y_b64 = extract_coord_for_key(payload_storage, payload_len, y_offset, ASCII_Y);
    let holder_pub_x: [u8; 32] = BASE64_URL_DECODER::decode(holder_x_b64);
    let holder_pub_y: [u8; 32] = BASE64_URL_DECODER::decode(holder_y_b64);

    assert_fragment_at(
        payload_storage,
        payload_len,
        exp_offset,
        EXP_FRAGMENT,
        "issuer exp not found            ",
    );
    // The committed expiry is the issuer credential's exp. The KB-JWT exp is not read here:
    // KB-JWT freshness is a property of the presentation and is checked off chain by the bridge
    // against its clock (see prover-sp1/lib check_kb_freshness).
    let expiry: u64 = read_timestamp(payload_storage, payload_len, exp_offset + 6);

    // ---- 3. KB-JWT: header alg/typ, signature under holder key, aud, nonce, sd_hash ----
    let kb_header_storage = kb_header.storage();
    let kb_header_len = kb_header.len();
    assert(kb_header_len >= 1, "KB-JWT header empty");
    assert(kb_header_storage[0] == ASCII_LBRACE, "KB-JWT header is not a JSON object");
    assert_fragment_at(kb_header_storage, kb_header_len, kb_alg_offset, ALG_FRAGMENT, "KB-JWT alg is not ES256          ");
    assert_fragment_at(kb_header_storage, kb_header_len, kb_typ_offset, KB_TYP_FRAGMENT, "KB-JWT typ is not kb+jwt         ");
    let encoded_kb_header = BASE64_URL_ENCODER::encode_var(kb_header);
    let encoded_kb_payload = BASE64_URL_ENCODER::encode_var(kb_payload);
    let mut kb_signing_input: BoundedVec<u8, KB_SIGNING_INPUT_MAX_LEN> = BoundedVec::new();
    kb_signing_input.extend_from_bounded_vec(encoded_kb_header);
    kb_signing_input.push(ASCII_DOT);
    kb_signing_input.extend_from_bounded_vec(encoded_kb_payload);
    assert(
        std::ecdsa_secp256r1::verify_signature(
            holder_pub_x,
            holder_pub_y,
            kb_signature,
            sha256_var(kb_signing_input.storage(), kb_signing_input.len()),
        ),
        "Invalid KB-JWT signature",
    );

    let kb_storage = kb_payload.storage();
    let kb_len = kb_payload.len();
    assert_fragment_at(
        kb_storage,
        kb_len,
        kb_aud_offset,
        AUD_FRAGMENT,
        "KB-JWT aud is not the client_id  ",
    );
    // nonce == lowercase hex(sha256(subject || challenge))
    let mut nonce_preimage: [u8; 52] = [0; 52];
    for i in 0..20 {
        nonce_preimage[i] = subject[i];
    }
    for i in 0..32 {
        nonce_preimage[20 + i] = challenge[i];
    }
    let nonce: [u8; 32] = digest(nonce_preimage);
    assert_fragment_at(
        kb_storage,
        kb_len,
        kb_nonce_offset,
        NONCE_FRAGMENT,
        "KB-JWT nonce not found          ",
    );
    assert(kb_nonce_offset + 9 + 65 <= kb_len, "KB-JWT nonce out of range");
    for i in 0..32 {
        assert(
            kb_storage[kb_nonce_offset + 9 + 2 * i] == hex_nibble(nonce[i] >> 4),
            "KB-JWT nonce mismatch",
        );
        assert(
            kb_storage[kb_nonce_offset + 9 + 2 * i + 1] == hex_nibble(nonce[i] & 15),
            "KB-JWT nonce mismatch",
        );
    }
    assert(kb_storage[kb_nonce_offset + 9 + 64] == ASCII_QUOTE, "KB-JWT nonce not terminated");

    // sd_hash == base64url(sha256(header.payload.sig ~d1~...~dN~)), continued from h_prefix
    let mut rest: BoundedVec<u8, SD_HASH_REST_MAX_LEN> = BoundedVec::new();
    let s_tail_vec: BoundedVec<u8, 63> = BoundedVec::from_parts_unchecked(s_tail, s_rem);
    rest.extend_from_bounded_vec(s_tail_vec);
    rest.push(ASCII_DOT);
    rest.extend_from_array(issuer_sig_b64);
    assert(disclosures_tail.len() >= 2, "disclosures tail too short");
    assert(disclosures_tail.get(0) == ASCII_TILDE, "disclosures tail must start with ~");
    assert(
        disclosures_tail.get(disclosures_tail.len() - 1) == ASCII_TILDE,
        "disclosures tail must end with ~",
    );
    rest.extend_from_bounded_vec(disclosures_tail);
    let sd_hash = sha256_finish::<SD_HASH_REST_MAX_LEN, SD_HASH_REST_BLOCKS>(
        h_prefix,
        rest.storage(),
        rest.len(),
        s_full + rest.len(),
    );
    let expected_sd_hash: [u8; B64_32_LEN] = BASE64_URL_ENCODER::encode(sd_hash);
    assert_fragment_at(
        kb_storage,
        kb_len,
        kb_sd_hash_offset,
        SD_HASH_FRAGMENT,
        "KB-JWT sd_hash not found        ",
    );
    assert(kb_sd_hash_offset + 11 + 44 <= kb_len, "KB-JWT sd_hash out of range");
    for i in 0..B64_32_LEN {
        assert(
            kb_storage[kb_sd_hash_offset + 11 + i] == expected_sd_hash[i],
            "KB-JWT sd_hash mismatch",
        );
    }
    assert(kb_storage[kb_sd_hash_offset + 11 + 43] == ASCII_QUOTE, "KB-JWT sd_hash not terminated");

    (issuer_key_hash, over18, expiry, nonce)
}

#[test]
fn test_low_s_accepts_equal_and_negated_s() {
    // issuer signature of the minted vector (high s) and its low-s form
    let high: [u8; 64] = [
        220, 92, 246, 123, 242, 41, 206, 94, 24, 178, 36, 252, 7, 131, 99, 25, 12, 154, 88, 62, 60,
        118, 164, 155, 12, 98, 68, 50, 15, 208, 56, 83, 220, 131, 14, 11, 213, 241, 199, 184, 11,
        180, 80, 47, 25, 3, 170, 252, 173, 28, 185, 116, 177, 88, 101, 157, 201, 59, 14, 144, 42,
        86, 125, 67,
    ];
    let low: [u8; 64] = [
        220, 92, 246, 123, 242, 41, 206, 94, 24, 178, 36, 252, 7, 131, 99, 25, 12, 154, 88, 62, 60,
        118, 164, 155, 12, 98, 68, 50, 15, 208, 56, 83, 35, 124, 241, 243, 42, 14, 56, 72, 244, 75,
        175, 208, 230, 252, 85, 3, 15, 202, 65, 56, 245, 191, 56, 231, 42, 126, 188, 50, 210, 12,
        168, 14,
    ];
    assert_same_signature_low_s(low, high);
    assert_same_signature_low_s(low, low);
}

#[test(should_fail_with = "signature s is neither s nor n - s")]
fn test_low_s_rejects_other_s() {
    let high: [u8; 64] = [
        220, 92, 246, 123, 242, 41, 206, 94, 24, 178, 36, 252, 7, 131, 99, 25, 12, 154, 88, 62, 60,
        118, 164, 155, 12, 98, 68, 50, 15, 208, 56, 83, 220, 131, 14, 11, 213, 241, 199, 184, 11,
        180, 80, 47, 25, 3, 170, 252, 173, 28, 185, 116, 177, 88, 101, 157, 201, 59, 14, 144, 42,
        86, 125, 67,
    ];
    let mut other = high;
    other[63] = other[63] ^ 1;
    assert_same_signature_low_s(other, high);
}

#[test]
fn test_read_timestamp() {
    let hay: [u8; 20] = "\"exp\":1811971200,\"x\"".as_bytes();
    assert(read_timestamp(hay, 20, 6) == 1811971200);
}

#[test(should_fail_with = "timestamp not terminated")]
fn test_read_timestamp_rejects_eleven_digits() {
    let hay: [u8; 20] = "\"exp\":18119712001,\"x".as_bytes();
    let _ = read_timestamp(hay, 20, 6);
}

/// sha256_finish continued from INITIAL_STATE after k full blocks equals sha256 of the whole
/// message, for message lengths that exercise one and two padding blocks.
#[test]
fn test_sha256_finish_matches_digest() {
    let mut msg: [u8; 200] = [0; 200];
    for i in 0..200 {
        msg[i] = (i * 7 + 3) as u8;
    }
    for total in [64, 100, 119, 120, 127, 128, 183, 191, 192, 200] {
        let full = total - (total % 64);
        let h = partial_sha256_var_interstitial(SHA256_INITIAL_STATE, msg, full);
        let mut tail: [u8; 63] = [0; 63];
        for i in 0..63 {
            tail[i] = byte_at(msg, total, full + i);
        }
        let got = sha256_finish::<63, 2>(h, tail, total - full, total);
        assert(got == sha256_var(msg, total), "sha256_finish differs from sha256_var");
    }
    // a longer continuation: 3 full blocks shared, 150 bytes finished in up to 3 blocks
    let h = partial_sha256_var_interstitial(SHA256_INITIAL_STATE, msg, 0);
    let got = sha256_finish::<150, 3>(h, [msg[0]; 150], 150, 150);
    assert(got == sha256_var([msg[0]; 150], 150), "sha256_finish 150 differs");
}

#[test]
fn test_open_between_accepts_open_array() {
    let hay = "\"_sd\":[\"aaaa\", \"bbbb\",\"cccc\"]}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".as_bytes();
    let counts = closer_counts(hay);
    assert_open_between(true, counts, hay.len(), 7, 22);
    assert_open_between(true, counts, hay.len(), 7, 28);
    // inactive checks never fail, whatever the offsets
    assert_open_between(false, counts, hay.len(), 7, 60);
    assert_open_between(false, counts, hay.len(), 70, 6000);
}

#[test(should_fail_with = "container closed before the target")]
fn test_open_between_rejects_closed_array() {
    let hay = "\"_sd\":[\"aaaa\",\"bbbb\"],\"x\":[\"cccc\"]}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".as_bytes();
    assert_open_between(true, closer_counts(hay), hay.len(), 7, 27);
}

#[test]
fn test_disclosure_prefix() {
    let hay = "[\"AQEBAQEBAQEBAQEBAQEBAQ\",\"age_equal_or_over\",{\"_sd\":[\"x\"]}]xxxxxxxx".as_bytes();
    assert_disclosure_prefix_if(true, hay, hay.len(), 26);
}

#[test(should_fail_with = "disclosure salt contains a quote")]
fn test_disclosure_prefix_rejects_name_in_salt_position() {
    let hay = "[\"a\",\"b\",\"age_equal_or_over\",{\"_sd\":[\"x\"]}]xxxxxxxxxxxxxxxxxxxxxxxx".as_bytes();
    assert_disclosure_prefix_if(true, hay, hay.len(), 10);
}
