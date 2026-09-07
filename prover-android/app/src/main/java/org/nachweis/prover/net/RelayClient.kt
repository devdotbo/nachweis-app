package org.nachweis.prover.net

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Blind relay of the verifier service (docs/blind-relay.md): request, status, one-time pickup. */
class RelayClient(private val http: OkHttpClient = defaultClient()) {
    data class Session(
        val sessionId: String,
        val requestUri: String,
        val openid4vpUri: String,
        val nonce: String,
        val boundAddress: String,
        val pickupUrl: String,
        val pickupToken: String,
        val statusUrl: String,
    )

    data class Pickup(val jwe: String, val nonce: String, val boundAddress: String, val receivedAt: Long)

    class HttpException(val code: Int, body: String) : IOException("HTTP $code: ${body.take(300)}")

    fun createRequest(baseUrl: String, clientJwk: JSONObject, boundAddress: String, challengeHex: String, redirectUri: String? = null): Session {
        val body = JSONObject()
            .put("client_jwk", clientJwk)
            .put("bound_address", boundAddress)
            .put("challenge", if (challengeHex.startsWith("0x")) challengeHex else "0x$challengeHex")
        if (!redirectUri.isNullOrBlank()) body.put("redirect_uri", redirectUri)
        val json = postJson("${baseUrl.trimEnd('/')}/relay/request", body)
        return Session(
            sessionId = json.getString("session_id"),
            requestUri = json.getString("request_uri"),
            openid4vpUri = json.getString("openid4vp_uri"),
            nonce = json.getString("nonce"),
            boundAddress = json.optString("bound_address", boundAddress),
            pickupUrl = json.getString("pickup_url"),
            pickupToken = json.getString("pickup_token"),
            statusUrl = json.getString("status_url"),
        )
    }

    /** pending | responded | picked_up */
    fun status(statusUrl: String): String = getJson(statusUrl, emptyMap()).getString("status")

    fun pickup(pickupUrl: String, pickupToken: String): Pickup {
        val json = getJson(pickupUrl, mapOf("X-Pickup-Token" to pickupToken))
        return Pickup(
            jwe = json.getString("jwe"),
            nonce = json.optString("nonce"),
            boundAddress = json.optString("bound_address"),
            receivedAt = json.optLong("received_at"),
        )
    }

    private fun postJson(url: String, body: JSONObject): JSONObject {
        val req = Request.Builder().url(url).post(body.toString().toRequestBody(JSON)).build()
        return execute(req)
    }

    private fun getJson(url: String, headers: Map<String, String>): JSONObject {
        val b = Request.Builder().url(url).get()
        headers.forEach { (k, v) -> b.header(k, v) }
        return execute(b.build())
    }

    private fun execute(req: Request): JSONObject {
        http.newCall(req).execute().use { resp ->
            val text = resp.body?.string() ?: ""
            if (!resp.isSuccessful) throw HttpException(resp.code, text)
            return JSONObject(text)
        }
    }

    companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}
