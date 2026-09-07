package org.nachweis.prover.prover

import android.content.Context
import org.nachweis.prover.core.ProveResult
import org.nachweis.prover.core.executePidSdjwt
import org.nachweis.prover.core.initSrs
import org.nachweis.prover.core.peakRssBytes
import org.nachweis.prover.core.provePidSdjwt
import org.nachweis.prover.core.proverVersion
import java.io.File

/**
 * Copies the bundled circuit, VK and SRS into app storage once (Barretenberg
 * reads files, not asset streams) and drives the Rust core.
 */
class ProverService(private val context: Context) {
    data class Paths(val circuit: File, val vk: File, val vkHash: ByteArray, val g1: File, val g2: File)

    private val assetsToCopy = listOf("pid_sdjwt.json", "pid_sdjwt_evm.vk", "bn254_g1.dat", "bn254_g2.dat")

    @Volatile
    private var paths: Paths? = null

    fun version(): String = proverVersion()

    @Synchronized
    fun ensureAssets(): Paths {
        paths?.let { return it }
        val dir = File(context.filesDir, "prover").apply { mkdirs() }
        for (name in assetsToCopy) {
            val target = File(dir, name)
            val assetLen = context.assets.openFd(name).use { it.length }
            if (!target.exists() || target.length() != assetLen) {
                context.assets.open(name).use { input -> target.outputStream().use { input.copyTo(it, 1 shl 20) } }
            }
        }
        val vkHash = context.assets.open("pid_sdjwt_evm.vk_hash").use { it.readBytes() }
        return Paths(File(dir, "pid_sdjwt.json"), File(dir, "pid_sdjwt_evm.vk"), vkHash, File(dir, "bn254_g1.dat"), File(dir, "bn254_g2.dat"))
            .also { paths = it }
    }

    /** Loads the SRS into Barretenberg (idempotent in the Rust core); returns the point count. */
    fun loadSrs(): UInt {
        val p = ensureAssets()
        return initSrs(p.g1.absolutePath, p.g2.absolutePath)
    }

    /** Solves the witness only and returns the circuit return values (36 field elements). */
    fun execute(proverToml: String): List<ByteArray> = executePidSdjwt(ensureAssets().circuit.absolutePath, proverToml)

    fun prove(proverToml: String, lowMemory: Boolean): ProveResult {
        val p = ensureAssets()
        loadSrs()
        return provePidSdjwt(p.circuit.absolutePath, p.vk.absolutePath, proverToml, lowMemory)
    }

    fun peakRss(): ULong = peakRssBytes()
}
