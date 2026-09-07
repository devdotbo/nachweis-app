package org.nachweis.prover.crypto

import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * JWE compact serialisation, alg ECDH-ES (direct key agreement), enc A128GCM
 * or A256GCM: what the EUDI wallet produces for `direct_post.jwt` (RFC 7516,
 * RFC 7518 sections 4.6 and 5.3).
 */
object Jwe {
    data class Decrypted(val header: JSONObject, val plaintext: ByteArray)

    fun decryptCompact(jwe: String, privateKey: PrivateKey): Decrypted {
        val parts = jwe.trim().split(".")
        require(parts.size == 5) { "JWE compact serialisation needs 5 parts, got ${parts.size}" }
        val (protectedB64, encryptedKeyB64, ivB64, ciphertextB64, tagB64) = parts
        val header = JSONObject(String(b64(protectedB64), Charsets.UTF_8))
        val alg = header.optString("alg")
        val enc = header.optString("enc")
        require(alg == "ECDH-ES") { "unsupported alg $alg (expected ECDH-ES)" }
        require(encryptedKeyB64.isEmpty()) { "ECDH-ES direct mode has an empty encrypted key" }
        val keyBits = when (enc) {
            "A128GCM" -> 128
            "A256GCM" -> 256
            else -> throw IllegalArgumentException("unsupported enc $enc")
        }
        val epk = EcKeys.publicKeyFromJwk(header.getJSONObject("epk"))
        val z = ecdh(privateKey, epk)
        val apu = header.optString("apu", "").let { if (it.isEmpty()) ByteArray(0) else b64(it) }
        val apv = header.optString("apv", "").let { if (it.isEmpty()) ByteArray(0) else b64(it) }
        val cek = concatKdf(z, enc, apu, apv, keyBits)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, b64(ivB64)))
        cipher.updateAAD(protectedB64.toByteArray(Charsets.US_ASCII))
        val plaintext = cipher.doFinal(b64(ciphertextB64) + b64(tagB64))
        return Decrypted(header, plaintext)
    }

    fun ecdh(privateKey: PrivateKey, publicKey: PublicKey): ByteArray {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(privateKey)
        ka.doPhase(publicKey, true)
        return ka.generateSecret()
    }

    /**
     * NIST SP 800-56A Concat KDF with SHA-256, one round (keys up to 256 bits):
     * H(0x00000001 || Z || len(alg)||alg || len(apu)||apu || len(apv)||apv || keydatalen).
     */
    fun concatKdf(z: ByteArray, algorithmId: String, apu: ByteArray, apv: ByteArray, keyBits: Int): ByteArray {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(ByteBuffer.allocate(4).putInt(1).array())
        md.update(z)
        md.update(lengthPrefixed(algorithmId.toByteArray(Charsets.US_ASCII)))
        md.update(lengthPrefixed(apu))
        md.update(lengthPrefixed(apv))
        md.update(ByteBuffer.allocate(4).putInt(keyBits).array())
        return md.digest().copyOf(keyBits / 8)
    }

    private fun lengthPrefixed(b: ByteArray): ByteArray = ByteBuffer.allocate(4).putInt(b.size).array() + b
    private fun b64(s: String): ByteArray = Base64.getUrlDecoder().decode(s)
}
