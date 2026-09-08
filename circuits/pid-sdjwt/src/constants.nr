/// Maximum base64url length of the issuer JWT header. The ERICA / German PID
/// test issuer header carries the x5c chain (two certificates): 1855 chars in
/// the captured and minted vectors; 24 % margin (REALISM.md, section 4).
pub global HEADER_B64_MAX: u32 = 2304;

/// Maximum raw (decoded) issuer JWT payload length in bytes. A reconstructed
/// 23-claim sandbox PID with nested objects is 1570 bytes, 1708 with the
/// objects themselves disclosable, 2122 with decoy digests (REALISM.md).
pub global PAYLOAD_MAX_LEN: u32 = 2304;

/// Maximum length of the disclosures tail "~d1~d2~...~dN~" that sits between the
/// issuer JWT and the KB-JWT in the presentation: 186 bytes in the minted
/// vector, 220 with long umlaut names, 630 when the age object itself is a
/// disclosure (shape B, six digests).
pub global TAIL_MAX: u32 = 768;

/// Maximum raw (decoded) KB-JWT header length (56 bytes with a kid).
pub global KB_HEADER_MAX: u32 = 128;

/// Maximum raw (decoded) KB-JWT payload length (228 bytes with the x509_hash aud).
pub global KB_PAYLOAD_MAX: u32 = 384;

/// Maximum salt length in bytes (base64url text, 22 chars for a 16 byte salt).
pub global SALT_MAX_LEN: u32 = 32;

/// Maximum decoded disclosure length for the age disclosure ["salt","18",true].
pub global DISCLOSURE_MAX_LEN: u32 = 64;

/// Maximum raw length of the age object disclosure
/// ["salt","age_equal_or_over",{"_sd":[...]}] when the object is itself
/// disclosed (332 bytes with six digests; 109 with plain values).
pub global AGE_OBJ_DISC_MAX: u32 = 512;

/// x and y must lie within this many bytes after "cnf":{"jwk":{ (a kid may precede them).
pub global CNF_WINDOW: u32 = 256;

/// base64url-encoded length of a 32-byte value: ceil(32 * 4 / 3).
pub global B64_32_LEN: u32 = 43;
/// base64url-encoded length of a 64-byte ES256 signature.
pub global B64_64_LEN: u32 = 86;

/// Fixed JSON fragments the circuit expects in the issuer payload.
/// German PID credential type.
pub global VCT_FRAGMENT: [u8; 25] = "\"vct\":\"urn:eudi:pid:de:1\"".as_bytes();
/// Shape A: the age object is plain in the payload with nested digests.
pub global AGE_SD_FRAGMENT: [u8; 28] = "\"age_equal_or_over\":{\"_sd\":[".as_bytes();
/// Shape B: the age object is a disclosure ["salt","age_equal_or_over",{"_sd":[...]}].
pub global AGE_DISC_SD_FRAGMENT: [u8; 28] = "\"age_equal_or_over\",{\"_sd\":[".as_bytes();
/// Shape C: the age object is a disclosure with plain values ["salt","age_equal_or_over",{"12":true,...}].
pub global AGE_DISC_OBJ_FRAGMENT: [u8; 21] = "\"age_equal_or_over\",{".as_bytes();
/// The plain leaf inside shape C.
pub global AGE18_TRUE_FRAGMENT: [u8; 9] = "\"18\":true".as_bytes();
/// Start of a digest array (the top-level one anchors the age object disclosure in shapes B, C).
pub global SD_FRAGMENT: [u8; 7] = "\"_sd\":[".as_bytes();
/// Start of the holder binding key; x and y follow in any order within CNF_WINDOW bytes.
pub global CNF_FRAGMENT: [u8; 14] = "\"cnf\":{\"jwk\":{".as_bytes();
pub global EXP_FRAGMENT: [u8; 6] = "\"exp\":".as_bytes();

/// JOSE header fragments (issuer header: a decoded 96-byte window at a prover-chosen 4-aligned
/// base64url offset; KB-JWT header: raw input).
pub global ALG_FRAGMENT: [u8; 13] = "\"alg\":\"ES256\"".as_bytes();
/// Issuer typ; byte 7 may be 'd' (dc+sd-jwt) or 'v' (vc+sd-jwt, the earlier media type).
pub global TYP_SD_JWT_FRAGMENT: [u8; 17] = "\"typ\":\"dc+sd-jwt\"".as_bytes();
pub global KB_TYP_FRAGMENT: [u8; 14] = "\"typ\":\"kb+jwt\"".as_bytes();

/// Fixed JSON fragments the circuit expects in the KB-JWT payload.
/// aud is the verifier's registered client_id in the x509_hash scheme:
/// "x509_hash:" + base64url(sha256(DER of verifier/fixtures/live/access-leaf.pem)),
/// derived in REALISM.md, section 1. A new registrar leaf changes this constant and the VK.
pub global AUD_FRAGMENT: [u8; 61] =
    "\"aud\":\"x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI\"".as_bytes();
pub global NONCE_FRAGMENT: [u8; 9] = "\"nonce\":\"".as_bytes();
pub global SD_HASH_FRAGMENT: [u8; 11] = "\"sd_hash\":\"".as_bytes();

/// Age claim name inside age_equal_or_over.
pub global AGE_CLAIM_NAME: [u8; 2] = "18".as_bytes();
