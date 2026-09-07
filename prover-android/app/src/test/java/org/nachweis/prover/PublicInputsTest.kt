package org.nachweis.prover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.nachweis.prover.circuit.ProverInputs
import org.nachweis.prover.circuit.PublicInputs

class PublicInputsTest {
    @Test
    fun decodesDesktopLayout() {
        val subject = ProverInputs.hex("f99edde971f4e9c88715a79ca78963284a2955dc")
        val hash = ProverInputs.hex("78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183")
        val nonce = ProverInputs.hex("306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762")
        fun field(b: Byte) = ByteArray(31) + b
        val fields = mutableListOf<ByteArray>()
        subject.forEach { fields += field(it) }
        hash.forEach { fields += field(it) }
        fields += field(1)
        fields += ByteArray(32).also { java.math.BigInteger.valueOf(1819756800L).toByteArray().let { e -> System.arraycopy(e, 0, it, 32 - e.size, e.size) } }
        nonce.forEach { fields += field(it) }
        val pi = PublicInputs.decode(fields)
        assertEquals("f99edde971f4e9c88715a79ca78963284a2955dc", pi.subjectHex)
        assertEquals("78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183", pi.issuerKeyHashHex)
        assertTrue(pi.over18)
        assertEquals(1819756800L, pi.expiry)
        assertEquals("306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762", pi.nonceHex)
    }
}
