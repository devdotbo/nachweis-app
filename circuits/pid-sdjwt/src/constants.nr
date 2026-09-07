/// Maximum base64url length of the issuer JWT header. The ERICA / German PID
/// test issuer header carries the x5c chain (two certificates): 1855 chars in
/// the minted vector.
pub global HEADER_B64_MAX: u32 = 2048;

/// Maximum raw (decoded) issuer JWT payload length in bytes. The minted PID
/// payload is 739 bytes; real PIDs carry more `_sd` digests and a status claim.
pub global PAYLOAD_MAX_LEN: u32 = 1024;

/// Maximum length of the disclosures tail "~d1~d2~...~dN~" that sits between the
/// issuer JWT and the KB-JWT in the presentation (186 bytes in the vector).
pub global TAIL_MAX: u32 = 512;

/// Maximum raw (decoded) KB-JWT payload length (200 bytes in the vector).
pub global KB_PAYLOAD_MAX: u32 = 320;

/// Maximum salt length in bytes (base64url text, 22 chars for a 16 byte salt).
pub global SALT_MAX_LEN: u32 = 32;

/// Maximum decoded disclosure length for the age disclosure ["salt","18",true].
pub global DISCLOSURE_MAX_LEN: u32 = 64;

/// Maximum number of digests in age_equal_or_over._sd that the circuit scans.
pub global MAX_AGE_ENTRIES: u32 = 8;

/// base64url-encoded length of a 32-byte value: ceil(32 * 4 / 3).
pub global B64_32_LEN: u32 = 43;
/// base64url-encoded length of a 64-byte ES256 signature.
pub global B64_64_LEN: u32 = 86;

/// Fixed JSON fragments the circuit expects in the issuer payload.
/// German PID credential type.
pub global VCT_FRAGMENT: [u8; 25] = "\"vct\":\"urn:eudi:pid:de:1\"".as_bytes();
/// Start of the nested age object; digests follow as "<43>","<43>",...
pub global AGE_SD_FRAGMENT: [u8; 28] = "\"age_equal_or_over\":{\"_sd\":[".as_bytes();
/// Start of the holder binding key (serde_json key order: crv, kty, x, y).
pub global CNF_FRAGMENT: [u8; 14] = "\"cnf\":{\"jwk\":{".as_bytes();
pub global EXP_FRAGMENT: [u8; 6] = "\"exp\":".as_bytes();

/// Fixed JSON fragments the circuit expects in the KB-JWT payload.
pub global AUD_FRAGMENT: [u8; 33] = "\"aud\":\"https://self-issued.me/v2\"".as_bytes();
pub global NONCE_FRAGMENT: [u8; 9] = "\"nonce\":\"".as_bytes();
pub global SD_HASH_FRAGMENT: [u8; 11] = "\"sd_hash\":\"".as_bytes();

/// Age claim name inside age_equal_or_over.
pub global AGE_CLAIM_NAME: [u8; 2] = "18".as_bytes();

/// base64url of the first 30 bytes of the issuer header
/// {"alg":"ES256","typ":"dc+sd-jw ... (ERICA / BDR key order). Pins alg and typ.
pub global HEADER_B64_PREFIX: [u8; 40] = [
    101, 121, 74, 104, 98, 71, 99, 105, 79, 105, 74, 70, 85, 122, 73, 49, 78, 105, 73, 115, 73, 110,
    82, 53, 99, 67, 73, 54, 73, 109, 82, 106, 75, 51, 78, 107, 76, 87, 112, 51,
];

/// base64url({"alg":"ES256","typ":"kb+jwt"}), the fixed KB-JWT header.
pub global KB_HEADER_B64: [u8; 40] = "eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9".as_bytes();
