package org.nachweis.prover.circuit

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.security.MessageDigest
import java.util.Base64

/**
 * Derives the `pid_sdjwt` circuit inputs (as Prover.toml text) from an SD-JWT
 * presentation with key binding, exactly like `circuits/tools/gen-prover.ts`.
 *
 * Every offset is a byte offset into the raw (base64url-decoded) JSON of the
 * issuer payload and the KB-JWT payload. The raw bytes are handled as
 * ISO-8859-1 strings so that `indexOf` returns byte offsets even when the
 * JSON contains non-ASCII characters (the TypeScript tool indexes UTF-16
 * code units; both agree for ASCII payloads such as the test vector).
 */
object ProverInputs {
    // Mirrors circuits/pid-sdjwt/src/constants.nr; ProverInputsTest checks them against the file.
    const val HEADER_B64_MAX = 2048
    const val PAYLOAD_MAX_LEN = 1024
    const val TAIL_MAX = 512
    const val KB_PAYLOAD_MAX = 320
    const val SALT_MAX_LEN = 32
    const val MAX_AGE_ENTRIES = 8

    const val EXPECTED_AUD = "https://self-issued.me/v2"
    private const val KB_HEADER_B64 = "eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9"
    private val P256_N = BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)

    class DerivationException(message: String) : IllegalArgumentException(message)

    data class Expected(
        val issuerKeyHashHex: String,
        val expiry: Long,
        val nonceHex: String,
        val subjectHex: String,
    )

    data class Derived(val toml: String, val expected: Expected)

    fun derive(
        presentation: String,
        issuerKeySec1Hex: String,
        boundAddressHex: String,
        challengeHex: String,
        expectedAud: String = EXPECTED_AUD,
    ): Derived {
        val parts = presentation.trim().split("~")
        if (parts.size < 2) fail("presentation has no KB-JWT")
        val issuerJwt = parts[0]
        val kbJwt = parts.last()
        val disclosures = parts.subList(1, parts.size - 1)
        val jwtParts = issuerJwt.split(".")
        if (jwtParts.size != 3) fail("issuer JWT does not have three parts")
        val (headerB64, payloadB64, sigB64) = jwtParts
        val payloadRaw = fromB64url(payloadB64)
        val payloadJson = latin1(payloadRaw)
        val payloadObj = JSONObject(String(payloadRaw, Charsets.UTF_8))

        if (b64url(payloadRaw) != payloadB64) fail("payload base64url round trip differs")
        if (sigB64.length != 86) fail("issuer signature base64url length ${sigB64.length}, expected 86")

        // --- issuer payload offsets ---
        val vctOffset = uniqueIndex(payloadJson, "\"vct\":\"urn:eudi:pid:de:1\"")
        val ageSdFragment = "\"age_equal_or_over\":{\"_sd\":["
        val ageSdOffset = uniqueIndex(payloadJson, ageSdFragment)
        val cnfFragment = "\"cnf\":{\"jwk\":{"
        val cnfOffset = uniqueIndex(payloadJson, cnfFragment)
        val xOffset = payloadJson.indexOf("\"x\":\"", cnfOffset)
        val yOffset = payloadJson.indexOf("\"y\":\"", cnfOffset)
        if (xOffset < 0 || yOffset < 0) fail("cnf.jwk x/y not found")
        val expOffset = uniqueIndex(payloadJson, "\"exp\":")

        // --- age disclosure ---
        val ageDisc = disclosures.firstOrNull { d ->
            val arr = runCatching { JSONArray(String(fromB64url(d), Charsets.UTF_8)) }.getOrNull()
            arr != null && arr.length() == 3 && arr.optString(1) == "18" && arr.opt(2) == true
        } ?: fail("no presented disclosure [\"salt\",\"18\",true]")
        val ageDiscArr = JSONArray(String(fromB64url(ageDisc), Charsets.UTF_8))
        val ageSalt = ageDiscArr.getString(0)
        if (String(fromB64url(ageDisc), Charsets.UTF_8) != "[\"$ageSalt\",\"18\",true]") {
            fail("age disclosure is not in the canonical form the circuit rebuilds")
        }
        val ageDigest = b64url(sha256(ageDisc.toByteArray(Charsets.US_ASCII)))
        val ageArray = payloadObj.getJSONObject("age_equal_or_over").getJSONArray("_sd")
        var ageDigestIndex = -1
        for (i in 0 until ageArray.length()) if (ageArray.getString(i) == ageDigest) { ageDigestIndex = i; break }
        if (ageDigestIndex < 0) fail("age disclosure digest not in age_equal_or_over._sd")
        if (ageDigestIndex >= MAX_AGE_ENTRIES) fail("age digest index exceeds MAX_AGE_ENTRIES")
        val entriesBase = ageSdOffset + ageSdFragment.length
        for (j in 0..ageDigestIndex) {
            val s = entriesBase + 46 * j
            if (payloadJson[s] != '"' || payloadJson[s + 44] != '"') fail("age _sd entry $j not 43 chars quoted")
            if (j < ageDigestIndex && payloadJson[s + 45] != ',') fail("age _sd entry $j not followed by ,")
        }
        val strideStart = entriesBase + 46 * ageDigestIndex + 1
        if (payloadJson.substring(strideStart, strideStart + 43) != ageDigest) fail("age digest stride check failed")

        // --- KB-JWT ---
        val kbParts = kbJwt.split(".")
        if (kbParts.size != 3) fail("KB-JWT does not have three parts")
        val (kbHeaderB64, kbPayloadB64, kbSigB64) = kbParts
        if (kbHeaderB64 != KB_HEADER_B64) fail("KB-JWT header is not {alg:ES256,typ:kb+jwt}")
        val kbPayloadRaw = fromB64url(kbPayloadB64)
        val kbJson = latin1(kbPayloadRaw)
        if (b64url(kbPayloadRaw) != kbPayloadB64) fail("KB payload base64url round trip differs")
        if (expectedAud != EXPECTED_AUD) fail("circuit pins aud $EXPECTED_AUD")
        val kbAudOffset = uniqueIndex(kbJson, "\"aud\":\"$expectedAud\"")
        val kbNonceOffset = uniqueIndex(kbJson, "\"nonce\":\"")
        val kbSdHashOffset = uniqueIndex(kbJson, "\"sd_hash\":\"")

        val tail = "~" + disclosures.joinToString("~") + "~"
        val sdHash = b64url(sha256((issuerJwt + tail).toByteArray(Charsets.US_ASCII)))
        val kbObj = JSONObject(String(kbPayloadRaw, Charsets.UTF_8))
        if (kbObj.optString("sd_hash") != sdHash) fail("sd_hash in KB-JWT does not match the presentation")

        // --- keys, subject, challenge ---
        val sec1 = hex(issuerKeySec1Hex)
        if (sec1.size != 65 || sec1[0] != 4.toByte()) fail("issuer key must be SEC1 uncompressed (65 bytes)")
        val issuerX = sec1.copyOfRange(1, 33)
        val issuerY = sec1.copyOfRange(33, 65)
        val subject = hex(boundAddressHex)
        val challenge = hex(challengeHex)
        if (subject.size != 20 || challenge.size != 32) fail("subject must be 20 bytes, challenge 32 bytes")
        val nonce = toHex(sha256(subject + challenge))
        if (kbObj.optString("nonce") != nonce) fail("KB-JWT nonce != hex(sha256(subject||challenge))")

        val issuerSigRaw = fromB64url(sigB64)
        val kbSig = fromB64url(kbSigB64)
        if (issuerSigRaw.size != 64 || kbSig.size != 64) fail("signatures must be 64 raw bytes")

        val sb = StringBuilder()
        sb.append("# Generated by org.nachweis.prover.circuit.ProverInputs (port of circuits/tools/gen-prover.ts)\n")
        sb.append(bounded("issuer_header_b64", headerB64.toByteArray(Charsets.US_ASCII), HEADER_B64_MAX))
        sb.append(bounded("payload", payloadRaw, PAYLOAD_MAX_LEN))
        sb.append("issuer_sig_b64 = ${bytes(sigB64.toByteArray(Charsets.US_ASCII))}\n")
        sb.append("issuer_sig = ${bytes(lowS(issuerSigRaw))}\n")
        sb.append(bounded("disclosures_tail", tail.toByteArray(Charsets.US_ASCII), TAIL_MAX))
        sb.append(bounded("kb_payload", kbPayloadRaw, KB_PAYLOAD_MAX))
        sb.append("kb_signature = ${bytes(lowS(kbSig))}\n")
        sb.append("issuer_pub_x = ${bytes(issuerX)}\n")
        sb.append("issuer_pub_y = ${bytes(issuerY)}\n")
        sb.append(bounded("age_salt", ageSalt.toByteArray(Charsets.US_ASCII), SALT_MAX_LEN))
        sb.append("age_sd_offset = $ageSdOffset\n")
        sb.append("age_digest_index = $ageDigestIndex\n")
        sb.append("vct_offset = $vctOffset\n")
        sb.append("cnf_offset = $cnfOffset\n")
        sb.append("x_offset = $xOffset\n")
        sb.append("y_offset = $yOffset\n")
        sb.append("exp_offset = $expOffset\n")
        sb.append("kb_aud_offset = $kbAudOffset\n")
        sb.append("kb_nonce_offset = $kbNonceOffset\n")
        sb.append("kb_sd_hash_offset = $kbSdHashOffset\n")
        sb.append("challenge = ${bytes(challenge)}\n")
        sb.append("subject = ${bytes(subject)}\n")

        val expected = Expected(
            issuerKeyHashHex = toHex(sha256(sec1)),
            expiry = payloadObj.getLong("exp"),
            nonceHex = nonce,
            subjectHex = toHex(subject),
        )
        return Derived(sb.toString(), expected)
    }

    /** Presented claims for the optional debug view: disclosures as [salt, name, value]. */
    fun disclosedClaims(presentation: String): List<Pair<String, String>> {
        val parts = presentation.trim().split("~")
        if (parts.size < 3) return emptyList()
        return parts.subList(1, parts.size - 1).mapNotNull { d ->
            runCatching {
                val arr = JSONArray(String(fromB64url(d), Charsets.UTF_8))
                if (arr.length() == 3) arr.getString(1) to arr.get(2).toString() else null
            }.getOrNull()
        }
    }

    private fun fail(msg: String): Nothing = throw DerivationException(msg)

    private fun uniqueIndex(hay: String, needle: String): Int {
        val i = hay.indexOf(needle)
        if (i < 0) fail("$needle not found")
        if (hay.indexOf(needle, i + 1) >= 0) fail("$needle occurs more than once; circuit assumes one")
        return i
    }

    /** The ECDSA blackbox only accepts low-s; the circuit checks s or n - s against the base64url form. */
    fun lowS(sig: ByteArray): ByteArray {
        val s = BigInteger(1, sig.copyOfRange(32, 64))
        val ns = if (s > P256_N.shiftRight(1)) P256_N.subtract(s) else s
        val sBytes = ns.toByteArray().let { b ->
            val trimmed = if (b.size > 32) b.copyOfRange(b.size - 32, b.size) else b
            ByteArray(32 - trimmed.size) + trimmed
        }
        return sig.copyOfRange(0, 32) + sBytes
    }

    private fun bytes(b: ByteArray): String = b.joinToString(", ", "[", "]") { (it.toInt() and 0xff).toString() }

    private fun bounded(name: String, b: ByteArray, max: Int): String {
        if (b.size > max) fail("$name: ${b.size} bytes exceeds max $max")
        val storage = b + ByteArray(max - b.size)
        return "$name.storage = ${bytes(storage)}\n$name.len = ${b.size}\n"
    }

    fun sha256(b: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(b)
    fun b64url(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
    fun fromB64url(s: String): ByteArray = Base64.getUrlDecoder().decode(s)
    private fun latin1(b: ByteArray) = String(b, Charsets.ISO_8859_1)
    fun hex(s: String): ByteArray {
        val clean = s.trim().removePrefix("0x").removePrefix("0X")
        if (clean.length % 2 != 0) fail("odd hex length")
        return ByteArray(clean.length / 2) { i -> clean.substring(2 * i, 2 * i + 2).toInt(16).toByte() }
    }
    fun toHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }
}
