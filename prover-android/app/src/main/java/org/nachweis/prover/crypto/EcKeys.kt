package org.nachweis.prover.crypto

import org.json.JSONObject
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64

/**
 * Ephemeral P-256 key for the blind relay. Kept in process memory only: the
 * Android Keystore supports ECDH key agreement from API 31, the app targets
 * minSdk 30, and the key lives exactly one session anyway.
 */
object EcKeys {
    val p256: ECParameterSpec by lazy {
        AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
            .getParameterSpec(ECParameterSpec::class.java)
    }

    fun generate(): KeyPair =
        KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1"), SecureRandom()) }.generateKeyPair()

    /** Public JWK as the relay expects it: EC, P-256, alg ECDH-ES, use enc. */
    fun publicJwk(pair: KeyPair, kid: String): JSONObject {
        val pub = pair.public as ECPublicKey
        return JSONObject()
            .put("kty", "EC")
            .put("crv", "P-256")
            .put("x", b64url(coord(pub.w.affineX)))
            .put("y", b64url(coord(pub.w.affineY)))
            .put("alg", "ECDH-ES")
            .put("use", "enc")
            .put("kid", kid)
    }

    fun publicKeyFromJwk(jwk: JSONObject): ECPublicKey {
        require(jwk.optString("kty") == "EC" && jwk.optString("crv") == "P-256") { "epk is not an EC P-256 key" }
        val x = BigInteger(1, Base64.getUrlDecoder().decode(jwk.getString("x")))
        val y = BigInteger(1, Base64.getUrlDecoder().decode(jwk.getString("y")))
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), p256)) as ECPublicKey
    }

    fun coord(v: BigInteger): ByteArray {
        val b = v.toByteArray()
        val trimmed = if (b.size > 32) b.copyOfRange(b.size - 32, b.size) else b
        return ByteArray(32 - trimmed.size) + trimmed
    }

    fun randomBytes(n: Int): ByteArray = ByteArray(n).also { SecureRandom().nextBytes(it) }
    fun b64url(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)
}
