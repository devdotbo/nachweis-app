package org.nachweis.prover.net

import org.json.JSONObject
import org.nachweis.prover.circuit.Codec

/**
 * Two-device handoff. The investor's browser created the bridge session and signed it with
 * the wallet (EIP-191 address proof); this phone, which holds no Ethereum key, joins THAT
 * session: same bound address and the same 32-byte challenge, so the KB-JWT nonce the relay
 * requests equals the bridge session's nonce, and the proof is posted to that session id.
 *
 * Wire forms (app/src/lib/handoff.ts produces them, companion/src/handoff.ts parses the same):
 *   compact JSON (the QR):  {"v":1,"s":"<session_id>","a":"0x<address>","c":"<challenge_hex>","r":"<verifier_url>","b":"<bridge_url>"}
 *   URI (paste):            nachweis://handoff?v=1&s=...&a=...&c=...&r=...&b=...
 *   bridge body:            GET /sessions/:id/handoff {session_id, bound_address, challenge_hex, nonce, verifier_url, bridge_url, expires_at}
 */
data class Handoff(
    val sessionId: String,
    /** 0x + 40 lowercase hex. */
    val boundAddress: String,
    /** 64 lowercase hex chars, no 0x. */
    val challengeHex: String,
    /** sha256(address20 || challenge32), 64 lowercase hex chars. */
    val nonce: String,
    val verifierUrl: String?,
    val bridgeUrl: String?,
) {
    companion object {
        private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        /** Accepts the compact JSON, the bridge's handoff body, or the nachweis://handoff URI. */
        fun parse(input: String): Handoff {
            val s = input.trim()
            if (s.startsWith("{")) return fromFields(JSONObject(s).let { o -> o.keys().asSequence().associateWith { k -> if (o.isNull(k)) null else o.get(k).toString() } })
            val prefix = "nachweis://handoff"
            if (s.startsWith(prefix, ignoreCase = true)) {
                val query = s.substringAfter('?', "")
                require(query.isNotEmpty()) { "handoff: URI has no query" }
                val fields = query.split('&').filter { it.isNotEmpty() }.associate { kv ->
                    val i = kv.indexOf('=')
                    val k = if (i < 0) kv else kv.substring(0, i)
                    val v = if (i < 0) "" else java.net.URLDecoder.decode(kv.substring(i + 1), "UTF-8")
                    k to v
                }
                return fromFields(fields)
            }
            throw IllegalArgumentException("handoff: expected a JSON object or a nachweis://handoff?... URI")
        }

        private fun fromFields(f: Map<String, String?>): Handoff {
            val v = f["v"] ?: f["version"]
            require(v == null || v == "1") { "handoff version $v not supported (expected 1)" }
            val session = (f["s"] ?: f["session_id"] ?: "").trim()
            require(UUID.matches(session)) { "handoff: session id is not a UUID" }
            val address = (f["a"] ?: f["bound_address"] ?: "").trim().lowercase()
            require(Regex("^0x[0-9a-f]{40}$").matches(address)) { "handoff: bound address must be 0x + 40 hex chars" }
            val challenge = (f["c"] ?: f["challenge_hex"] ?: "").trim().lowercase().removePrefix("0x")
            require(Regex("^[0-9a-f]{64}$").matches(challenge)) { "handoff: challenge must be 32 bytes of hex" }
            val nonce = Codec.toHex(Codec.sha256(Codec.hex(address) + Codec.hex(challenge)))
            val given = (f["nonce"])?.trim()?.lowercase()?.removePrefix("0x")
            require(given == null || given.isEmpty() || given == nonce) { "handoff: nonce $given is not sha256(address || challenge) $nonce" }
            fun url(u: String?): String? {
                val t = u?.trim()?.trimEnd('/') ?: return null
                if (t.isEmpty() || t == "null") return null
                require(t.startsWith("http://") || t.startsWith("https://")) { "handoff: URL $t is not http(s)" }
                return t
            }
            return Handoff(
                sessionId = session.lowercase(),
                boundAddress = address,
                challengeHex = challenge,
                nonce = nonce,
                verifierUrl = url(f["r"] ?: f["verifier_url"]),
                bridgeUrl = url(f["b"] ?: f["bridge_url"]),
            )
        }
    }
}
