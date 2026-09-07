package org.nachweis.prover.circuit

import java.math.BigInteger

/**
 * The 86 public inputs of `pid_sdjwt` as bb emits them: subject (20 bytes,
 * one field each), then the return values issuer_key_hash (32), over18 (1),
 * expiry (1, u64), nonce (32).
 */
data class PublicInputs(
    val subjectHex: String,
    val issuerKeyHashHex: String,
    val over18: Boolean,
    val expiry: Long,
    val nonceHex: String,
) {
    companion object {
        const val COUNT = 86

        fun decode(fields: List<ByteArray>): PublicInputs {
            require(fields.size == COUNT) { "expected $COUNT public inputs, got ${fields.size}" }
            fun byteAt(i: Int): Byte = fields[i].last()
            fun bytesRange(from: Int, count: Int) = ByteArray(count) { byteAt(from + it) }
            return PublicInputs(
                subjectHex = ProverInputs.toHex(bytesRange(0, 20)),
                issuerKeyHashHex = ProverInputs.toHex(bytesRange(20, 32)),
                over18 = byteAt(52).toInt() == 1,
                expiry = BigInteger(1, fields[53]).toLong(),
                nonceHex = ProverInputs.toHex(bytesRange(54, 32)),
            )
        }
    }
}
