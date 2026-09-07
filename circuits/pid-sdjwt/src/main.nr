// SPDX-License-Identifier: MPL-2.0
// Derived from eid-privacy/zkp-pocs noir/d10_swiyu_jwt (MPL-2.0), adapted to the
// German EUDI PID (vct urn:eudi:pid:de:1) SD-JWT presentation with KB-JWT.
use noir_base64::{BASE64_URL_DECODER, BASE64_URL_ENCODER};
use sha256::{digest, sha256_var};

mod constants;
use constants::{
    AGE_CLAIM_NAME, AGE_SD_FRAGMENT, AUD_FRAGMENT, B64_32_LEN, B64_64_LEN, CNF_FRAGMENT,
    DISCLOSURE_MAX_LEN, EXP_FRAGMENT, HEADER_B64_MAX, HEADER_B64_PREFIX, KB_HEADER_B64,
    KB_PAYLOAD_MAX, MAX_AGE_ENTRIES, NONCE_FRAGMENT, PAYLOAD_MAX_LEN, SALT_MAX_LEN,
    SD_HASH_FRAGMENT, TAIL_MAX, VCT_FRAGMENT,
};

global ENCODED_PAYLOAD_MAX_LEN: u32 = (PAYLOAD_MAX_LEN * 4 + 2) / 3;
global ENCODED_KB_PAYLOAD_MAX_LEN: u32 = (KB_PAYLOAD_MAX * 4 + 2) / 3;

/// header_b64 "." payload_b64
global SIGNING_INPUT_MAX_LEN: u32 = HEADER_B64_MAX + 1 + ENCODED_PAYLOAD_MAX_LEN;
/// header_b64 "." payload_b64 "." sig_b64 "~d1~...~dN~"
global SD_HASH_PREIMAGE_MAX_LEN: u32 = SIGNING_INPUT_MAX_LEN + 1 + B64_64_LEN + TAIL_MAX;
global KB_SIGNING_INPUT_MAX_LEN: u32 = 40 + 1 + ENCODED_KB_PAYLOAD_MAX_LEN;

global ASCII_DOT: u8 = 46;
global ASCII_TILDE: u8 = 126;
global ASCII_QUOTE: u8 = 34;
global ASCII_COMMA: u8 = 44;
global ASCII_RBRACE: u8 = 125;
global ASCII_X: u8 = 120;
global ASCII_Y: u8 = 121;

/// Asserts that `hay[offset..offset+N] == needle` and that the window is inside `len`.
fn assert_fragment_at<let H: u32, let N: u32, let M: u32>(
    hay: [u8; H],
    len: u32,
    offset: u32,
    needle: [u8; N],
    msg: str<M>,
) {
    assert(offset + N <= len, msg);
    for i in 0..N {
        assert(hay[offset + i] == needle[i], msg);
    }
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
    payload: BoundedVec<u8, PAYLOAD_MAX_LEN>,
    issuer_sig_b64: [u8; B64_64_LEN],
    issuer_sig: [u8; 64],
    disclosures_tail: BoundedVec<u8, TAIL_MAX>,
    kb_payload: BoundedVec<u8, KB_PAYLOAD_MAX>,
    kb_signature: [u8; 64],
    // Issuer key (SEC1 coordinates); exposed only as sha256(0x04||x||y)
    issuer_pub_x: [u8; 32],
    issuer_pub_y: [u8; 32],
    // Age disclosure witness
    age_salt: BoundedVec<u8, SALT_MAX_LEN>,
    age_sd_offset: u32,
    age_digest_index: u32,
    // Offsets into the raw issuer payload
    vct_offset: u32,
    cnf_offset: u32,
    x_offset: u32,
    y_offset: u32,
    exp_offset: u32,
    // Offsets into the raw KB-JWT payload
    kb_aud_offset: u32,
    kb_exp_offset: u32,
    kb_nonce_offset: u32,
    kb_sd_hash_offset: u32,
    // Challenge from the verifier (nonce preimage = subject || challenge)
    challenge: [u8; 32],
    // Public input: bound Ethereum address
    subject: pub [u8; 20],
) -> pub ([u8; 32], u8, u64, [u8; 32]) {
    // ---- 1. issuer JWT: rebuild header.payload, verify ES256 -------------------
    for i in 0..40 {
        assert(issuer_header_b64.get(i) == HEADER_B64_PREFIX[i], "issuer header alg/typ mismatch");
    }
    let encoded_payload = BASE64_URL_ENCODER::encode_var(payload);
    let mut signing_input: BoundedVec<u8, SIGNING_INPUT_MAX_LEN> = BoundedVec::new();
    signing_input.extend_from_bounded_vec(issuer_header_b64);
    signing_input.push(ASCII_DOT);
    signing_input.extend_from_bounded_vec(encoded_payload);

    let decoded_signature: [u8; 64] = BASE64_URL_DECODER::decode(issuer_sig_b64);
    assert_same_signature_low_s(issuer_sig, decoded_signature);
    assert(
        std::ecdsa_secp256r1::verify_signature(
            issuer_pub_x,
            issuer_pub_y,
            issuer_sig,
            sha256_var(signing_input.storage(), signing_input.len()),
        ),
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

    // age_equal_or_over._sd contains base64url(sha256(base64url(["salt","18",true])))
    let age_disclosure = build_age_disclosure(age_salt);
    let encoded_disclosure = BASE64_URL_ENCODER::encode_var(age_disclosure);
    let expected_digest: [u8; B64_32_LEN] = BASE64_URL_ENCODER::encode(sha256_var(
        encoded_disclosure.storage(),
        encoded_disclosure.len(),
    ));
    assert_fragment_at(
        payload_storage,
        payload_len,
        age_sd_offset,
        AGE_SD_FRAGMENT,
        "age_equal_or_over._sd not found  ",
    );
    assert(age_digest_index < MAX_AGE_ENTRIES, "age digest index out of range");
    let entries_base = age_sd_offset + 28;
    // every earlier entry must be followed by ',' so the array is still open at index k
    for j in 0..MAX_AGE_ENTRIES {
        if j < age_digest_index {
            assert(
                payload_storage[entries_base + 46 * j + 45] == ASCII_COMMA,
                "age _sd array closed early",
            );
        }
    }
    let digest_pos = entries_base + 46 * age_digest_index;
    assert(digest_pos + 45 <= payload_len, "age digest out of range");
    assert(payload_storage[digest_pos] == ASCII_QUOTE, "age digest not quoted");
    for i in 0..B64_32_LEN {
        assert(
            payload_storage[digest_pos + 1 + i] == expected_digest[i],
            "age disclosure digest mismatch",
        );
    }
    assert(payload_storage[digest_pos + 44] == ASCII_QUOTE, "age digest not quoted");
    let over18: u8 = 1;

    // holder key from cnf.jwk
    assert_fragment_at(
        payload_storage,
        payload_len,
        cnf_offset,
        CNF_FRAGMENT,
        "cnf.jwk not found               ",
    );
    assert((x_offset > cnf_offset) & (x_offset < cnf_offset + 128), "x outside cnf");
    assert((y_offset > cnf_offset) & (y_offset < cnf_offset + 128), "y outside cnf");
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
    let issuer_exp = read_timestamp(payload_storage, payload_len, exp_offset + 6);

    // ---- 3. KB-JWT: signature under holder key, aud, exp, nonce, sd_hash --------
    let encoded_kb_payload = BASE64_URL_ENCODER::encode_var(kb_payload);
    let mut kb_signing_input: BoundedVec<u8, KB_SIGNING_INPUT_MAX_LEN> =
        BoundedVec::from(KB_HEADER_B64);
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
        "KB-JWT aud mismatch             ",
    );
    assert_fragment_at(
        kb_storage,
        kb_len,
        kb_exp_offset,
        EXP_FRAGMENT,
        "KB-JWT exp not found            ",
    );
    let kb_exp = read_timestamp(kb_storage, kb_len, kb_exp_offset + 6);
    let expiry: u64 = if issuer_exp < kb_exp {
        issuer_exp
    } else {
        kb_exp
    };

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

    // sd_hash == base64url(sha256(header.payload.sig ~d1~...~dN~))
    let mut preimage_storage: [u8; SD_HASH_PREIMAGE_MAX_LEN] = [0; SD_HASH_PREIMAGE_MAX_LEN];
    let signing_storage = signing_input.storage();
    for i in 0..SIGNING_INPUT_MAX_LEN {
        preimage_storage[i] = signing_storage[i];
    }
    let mut preimage: BoundedVec<u8, SD_HASH_PREIMAGE_MAX_LEN> =
        BoundedVec::from_parts_unchecked(preimage_storage, signing_input.len());
    preimage.push(ASCII_DOT);
    preimage.extend_from_array(issuer_sig_b64);
    assert(disclosures_tail.len() >= 2, "disclosures tail too short");
    assert(disclosures_tail.get(0) == ASCII_TILDE, "disclosures tail must start with ~");
    assert(
        disclosures_tail.get(disclosures_tail.len() - 1) == ASCII_TILDE,
        "disclosures tail must end with ~",
    );
    preimage.extend_from_bounded_vec(disclosures_tail);
    let expected_sd_hash: [u8; B64_32_LEN] =
        BASE64_URL_ENCODER::encode(sha256_var(preimage.storage(), preimage.len()));
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
fn test_read_timestamp_rejects_longer_number() {
    let hay: [u8; 20] = "\"exp\":18119712001,\"x".as_bytes();
    let _ = read_timestamp(hay, 20, 6);
}
