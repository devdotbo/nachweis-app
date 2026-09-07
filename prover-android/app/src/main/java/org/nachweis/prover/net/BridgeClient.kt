package org.nachweis.prover.net

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridge (service/) client for `POST /sessions/:id/noir-proof`
 * `{proof_hex, public_inputs_hex[86], tier?}` (service/src/noir.rs), which
 * attests synchronously; the app then polls `GET /sessions/:id` (`state`,
 * `detail`, `tx_hash`) to show the result.
 */
class BridgeClient(private val http: OkHttpClient = RelayClient.defaultClient()) {
    data class SessionState(val state: String, val detail: String, val txHash: String?, val error: String?)

    /** Creates a bridge session with the same address and challenge the relay request used. */
    fun createSession(baseUrl: String, boundAddress: String, challengeHex: String): String {
        val body = JSONObject().put("bound_address", boundAddress).put("challenge_hex", challengeHex.removePrefix("0x"))
        return post("${baseUrl.trimEnd('/')}/sessions", body).getString("session_id")
    }

    fun submitNoirProof(baseUrl: String, sessionId: String, proofHex: String, publicInputsHex: List<String>): JSONObject {
        val body = JSONObject()
            .put("proof_hex", "0x" + proofHex.removePrefix("0x"))
            .put("public_inputs_hex", JSONArray(publicInputsHex.map { "0x" + it.removePrefix("0x") }))
        return post("${baseUrl.trimEnd('/')}/sessions/$sessionId/noir-proof", body)
    }

    fun getSession(baseUrl: String, sessionId: String): SessionState {
        val req = Request.Builder().url("${baseUrl.trimEnd('/')}/sessions/$sessionId").get().build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw RelayClient.HttpException(resp.code, text)
            val json = JSONObject(text)
            return SessionState(
                state = json.optString("state"),
                detail = json.optString("detail"),
                txHash = json.optString("tx_hash").takeIf { it.isNotBlank() && it != "null" },
                error = json.optString("error").takeIf { it.isNotBlank() && it != "null" },
            )
        }
    }

    private fun post(url: String, body: JSONObject): JSONObject {
        val req = Request.Builder().url(url).post(body.toString().toRequestBody(RelayClient.JSON)).build()
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw RelayClient.HttpException(resp.code, text)
            return JSONObject(text)
        }
    }
}
