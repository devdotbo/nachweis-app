package org.nachweis.prover.circuit

import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.ECPublicKey
import java.util.Base64

/** Issuer P-256 key as SEC1 uncompressed hex, from the `x5c` leaf of the issuer JWT header. */
object IssuerKey {
    fun fromPresentationX5c(presentation: String): String {
        val headerB64 = presentation.substringBefore("~").substringBefore(".")
        val header = JSONObject(String(Base64.getUrlDecoder().decode(headerB64), Charsets.UTF_8))
        val x5c = header.optJSONArray("x5c") ?: throw IllegalArgumentException("issuer JWT header has no x5c")
        val der = Base64.getDecoder().decode(x5c.getString(0))
        val cert = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(der)) as X509Certificate
        val pub = cert.publicKey as? ECPublicKey ?: throw IllegalArgumentException("x5c leaf is not an EC key")
        val x = pub.w.affineX.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        val y = pub.w.affineY.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        return ProverInputs.toHex(byteArrayOf(4) + x + y)
    }
}
