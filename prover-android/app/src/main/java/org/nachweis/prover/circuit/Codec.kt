package org.nachweis.prover.circuit

import org.json.JSONArray
import java.security.MessageDigest
import java.util.Base64

/** Byte helpers shared by the flow; the circuit input derivation itself lives in prover-mobile-core. */
object Codec {
    fun sha256(b: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(b)
    fun b64url(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
    fun fromB64url(s: String): ByteArray = Base64.getUrlDecoder().decode(s)
    fun hex(s: String): ByteArray {
        val clean = s.trim().removePrefix("0x").removePrefix("0X")
        require(clean.length % 2 == 0) { "odd hex length" }
        return ByteArray(clean.length / 2) { i -> clean.substring(2 * i, 2 * i + 2).toInt(16).toByte() }
    }
    fun toHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

    /** Presented disclosures as name to value, for the optional debug view. */
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
}
