package org.nachweis.prover

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import org.nachweis.prover.crypto.EcKeys
import org.nachweis.prover.crypto.Jwe
import java.security.interfaces.ECPublicKey
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

class JweTest {
    /** RFC 7518 appendix C: ECDH-ES Concat KDF test vector. */
    @Test
    fun concatKdfRfc7518AppendixC() {
        val z = byteArrayOf(
            158.toByte(), 86, 217.toByte(), 29, 129.toByte(), 113, 53, 211.toByte(), 114, 131.toByte(), 66, 131.toByte(), 191.toByte(), 132.toByte(), 38, 156.toByte(),
            251.toByte(), 49, 110, 163.toByte(), 218.toByte(), 128.toByte(), 106, 72, 246.toByte(), 218.toByte(), 167.toByte(), 121, 140.toByte(), 254.toByte(), 144.toByte(), 196.toByte(),
        )
        val key = Jwe.concatKdf(z, "A128GCM", "Alice".toByteArray(), "Bob".toByteArray(), 128)
        assertEquals("VqqN6vgjbSBcIijNcacQGg", Base64.getUrlEncoder().withoutPadding().encodeToString(key))
    }

    @Test
    fun jwkRoundTrip() {
        val pair = EcKeys.generate()
        val jwk = EcKeys.publicJwk(pair, "test")
        assertEquals("EC", jwk.getString("kty"))
        assertEquals("ECDH-ES", jwk.getString("alg"))
        assertEquals("enc", jwk.getString("use"))
        val back = EcKeys.publicKeyFromJwk(jwk)
        assertEquals((pair.public as ECPublicKey).w, back.w)
    }

    /** Encrypts like a wallet (ECDH-ES + A128GCM and A256GCM) and decrypts with the app code. */
    @Test
    fun decryptsEcdhEsGcm() {
        for (enc in listOf("A128GCM", "A256GCM")) {
            val recipient = EcKeys.generate()
            val ephemeral = EcKeys.generate()
            val header = JSONObject()
                .put("alg", "ECDH-ES").put("enc", enc)
                .put("epk", EcKeys.publicJwk(ephemeral, "e").apply { remove("alg"); remove("use"); remove("kid") })
            val protectedB64 = EcKeys.b64url(header.toString().toByteArray())
            val z = Jwe.ecdh(ephemeral.private, recipient.public)
            val cek = Jwe.concatKdf(z, enc, ByteArray(0), ByteArray(0), if (enc == "A128GCM") 128 else 256)
            val iv = EcKeys.randomBytes(12)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, iv))
            cipher.updateAAD(protectedB64.toByteArray(Charsets.US_ASCII))
            val plaintext = """{"vp_token":{"pid":["a~b~c"]}}""".toByteArray()
            val out = cipher.doFinal(plaintext)
            val ct = out.copyOfRange(0, out.size - 16)
            val tag = out.copyOfRange(out.size - 16, out.size)
            val jwe = listOf(protectedB64, "", EcKeys.b64url(iv), EcKeys.b64url(ct), EcKeys.b64url(tag)).joinToString(".")

            val dec = Jwe.decryptCompact(jwe, recipient.private)
            assertArrayEquals(plaintext, dec.plaintext)
            assertEquals(enc, dec.header.getString("enc"))
        }
    }
}
