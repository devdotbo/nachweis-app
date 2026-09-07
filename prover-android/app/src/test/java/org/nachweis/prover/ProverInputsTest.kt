package org.nachweis.prover

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.nachweis.prover.circuit.CircuitBounds
import org.nachweis.prover.circuit.ProverInputs
import java.io.File

class ProverInputsTest {
    private fun resource(name: String): String =
        javaClass.classLoader!!.getResourceAsStream(name)!!.bufferedReader().readText()

    private fun vector(): JSONObject = JSONObject(resource("input.json"))

    /** Bounds from the artifact the app ships (working directory of unit tests is app/). */
    private val bounds: CircuitBounds by lazy { CircuitBounds.fromArtifact(File("src/main/assets/pid_sdjwt.json").inputStream()) }

    /** Comment lines differ (tool name, input path); every input line must be identical. */
    private fun body(toml: String): List<String> = toml.lines().filter { it.isNotBlank() && !it.startsWith("#") }

    @Test
    fun matchesProverTomlFromGenProverTs() {
        val v = vector()
        val derived = ProverInputs.derive(
            presentation = v.getString("presentation"),
            issuerKeySec1Hex = v.getString("issuer_key_sec1_hex"),
            boundAddressHex = v.getString("bound_address_hex"),
            challengeHex = v.getString("challenge_hex"),
            bounds = bounds,
            expectedAud = v.getString("expected_aud"),
        )
        val expected = body(resource("Prover.expected.toml"))
        val actual = body(derived.toml)
        assertEquals(expected.size, actual.size)
        for (i in expected.indices) {
            assertEquals("line ${i + 1}: ${expected[i].substringBefore(" = ")}", expected[i], actual[i])
        }
        assertEquals("78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183", derived.expected.issuerKeyHashHex)
        assertEquals(1819756800L, derived.expected.expiry)
        assertEquals("306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762", derived.expected.nonceHex)
        assertEquals("f99edde971f4e9c88715a79ca78963284a2955dc", derived.expected.subjectHex)
    }

    @Test
    fun rejectsWrongChallenge() {
        val v = vector()
        val bad = "00" + v.getString("challenge_hex").removePrefix("0x").drop(2)
        val e = runCatching {
            ProverInputs.derive(v.getString("presentation"), v.getString("issuer_key_sec1_hex"), v.getString("bound_address_hex"), bad, bounds)
        }.exceptionOrNull()
        assertTrue(e is ProverInputs.DerivationException)
        assertTrue(e!!.message!!.contains("nonce"))
    }

    @Test
    fun rejectsWrongSubject() {
        val v = vector()
        val e = runCatching {
            ProverInputs.derive(v.getString("presentation"), v.getString("issuer_key_sec1_hex"), "0x0000000000000000000000000000000000000001", v.getString("challenge_hex"), bounds)
        }.exceptionOrNull()
        assertTrue(e is ProverInputs.DerivationException)
    }

    @Test
    fun lowSNormalisation() {
        val n = java.math.BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551", 16)
        val r = ByteArray(32) { 7 }
        val high = n.subtract(java.math.BigInteger.valueOf(5))
        val sig = r + high.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else ByteArray(32 - it.size) + it }
        val normalised = ProverInputs.lowS(sig)
        assertEquals(64, normalised.size)
        assertEquals(java.math.BigInteger.valueOf(5), java.math.BigInteger(1, normalised.copyOfRange(32, 64)))
        val low = ByteArray(31) + byteArrayOf(9)
        assertEquals(java.math.BigInteger.valueOf(9), java.math.BigInteger(1, ProverInputs.lowS(r + low).copyOfRange(32, 64)))
    }

    @Test
    fun boundsFromArtifactMatchConstantsNr() {
        // Runs only inside the repository checkout: the shipped artifact must be the circuit's current build.
        val f = File("../../circuits/pid-sdjwt/src/constants.nr")
        if (!f.exists()) return
        val src = f.readText()
        fun c(name: String) = Regex("pub global $name: u32 = (\\d+);").find(src)!!.groupValues[1].toInt()
        assertEquals(c("HEADER_B64_MAX"), bounds.headerB64Max)
        assertEquals(c("PAYLOAD_MAX_LEN"), bounds.payloadMax)
        assertEquals(c("TAIL_MAX"), bounds.tailMax)
        assertEquals(c("KB_PAYLOAD_MAX"), bounds.kbPayloadMax)
        assertEquals(c("SALT_MAX_LEN"), bounds.saltMax)
        assertEquals(c("MAX_AGE_ENTRIES"), bounds.maxAgeEntries)
        assertEquals(c("B64_64_LEN"), bounds.issuerSigB64Len)
        assertEquals(20, bounds.subjectLen)
        assertEquals(32, bounds.challengeLen)
    }
}
