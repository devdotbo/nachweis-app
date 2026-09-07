package org.nachweis.prover.circuit

import org.json.JSONObject
import java.io.InputStream

/**
 * Input bounds read from the compiled artifact's ABI (`abi.parameters[*].type`),
 * so a revised circuit (other HEADER_B64_MAX, PAYLOAD_MAX_LEN, ...) only needs
 * new assets. BoundedVec parameters carry their capacity as the `storage`
 * array length; fixed arrays carry `length`.
 */
data class CircuitBounds(
    val headerB64Max: Int,
    val payloadMax: Int,
    val tailMax: Int,
    val kbPayloadMax: Int,
    val saltMax: Int,
    val issuerSigB64Len: Int,
    val challengeLen: Int,
    val subjectLen: Int,
    /** Not in the ABI (an internal loop bound of the circuit); a wrong value fails at witness time. */
    val maxAgeEntries: Int = 8,
) {
    companion object {
        fun fromArtifact(json: JSONObject): CircuitBounds {
            val params = json.getJSONObject("abi").getJSONArray("parameters")
            val byName = HashMap<String, JSONObject>()
            for (i in 0 until params.length()) byName[params.getJSONObject(i).getString("name")] = params.getJSONObject(i).getJSONObject("type")
            fun capacity(name: String): Int {
                val t = byName[name] ?: throw IllegalArgumentException("ABI has no parameter $name")
                return when (t.getString("kind")) {
                    "array" -> t.getInt("length")
                    "struct" -> {
                        val fields = t.getJSONArray("fields")
                        var storage: JSONObject? = null
                        for (i in 0 until fields.length()) if (fields.getJSONObject(i).getString("name") == "storage") storage = fields.getJSONObject(i).getJSONObject("type")
                        storage?.getInt("length") ?: throw IllegalArgumentException("$name is a struct without storage")
                    }
                    else -> throw IllegalArgumentException("$name has kind ${t.getString("kind")}")
                }
            }
            return CircuitBounds(
                headerB64Max = capacity("issuer_header_b64"),
                payloadMax = capacity("payload"),
                tailMax = capacity("disclosures_tail"),
                kbPayloadMax = capacity("kb_payload"),
                saltMax = capacity("age_salt"),
                issuerSigB64Len = capacity("issuer_sig_b64"),
                challengeLen = capacity("challenge"),
                subjectLen = capacity("subject"),
            )
        }

        fun fromArtifact(stream: InputStream): CircuitBounds =
            stream.use { fromArtifact(JSONObject(String(it.readBytes(), Charsets.UTF_8))) }
    }
}
