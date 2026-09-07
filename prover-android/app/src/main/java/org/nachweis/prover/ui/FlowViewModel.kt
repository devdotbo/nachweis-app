package org.nachweis.prover.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.nachweis.prover.circuit.IssuerKey
import org.nachweis.prover.circuit.ProverInputs
import org.nachweis.prover.circuit.PublicInputs
import org.nachweis.prover.crypto.EcKeys
import org.nachweis.prover.crypto.Jwe
import org.nachweis.prover.net.BridgeClient
import org.nachweis.prover.net.RelayClient
import org.nachweis.prover.prover.ProverService
import java.security.KeyPair
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class Step { SESSION, WAITING, PICKUP, PROVE, SUBMIT }

data class ProofSummary(
    val proofHex: String,
    val publicInputsHex: List<String>,
    val decoded: PublicInputs,
    val witnessMs: Long,
    val proveMs: Long,
    val wallMs: Long,
    val peakRssBytes: Long,
    val lowMemory: Boolean,
    val verifiedOnDevice: Boolean?,
)

class FlowViewModel(app: Application) : AndroidViewModel(app) {
    companion object { const val TAG = "NachweisProver" }
    private val relay = RelayClient()
    private val bridge = BridgeClient()
    private val prover = ProverService(app)

    var step by mutableStateOf(Step.SESSION); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    val log = mutableStateOf(listOf<String>())

    // Session
    var verifierUrl by mutableStateOf("http://10.0.2.2:8080")
    var bridgeUrl by mutableStateOf("http://10.0.2.2:8787")
    var boundAddress by mutableStateOf("0xf99edde971f4e9c88715a79ca78963284a2955dc")
    var issuerKeyOverrideHex by mutableStateOf("")
    var challengeHex by mutableStateOf(""); private set
    private var keyPair: KeyPair? = null
    var relaySession by mutableStateOf<RelayClient.Session?>(null); private set
    var relayStatus by mutableStateOf("pending"); private set
    private var pollJob: Job? = null

    // Pickup
    var presentation by mutableStateOf<String?>(null); private set
    var presentationSource by mutableStateOf(""); private set
    var showClaims by mutableStateOf(false)
    var claims by mutableStateOf(listOf<Pair<String, String>>()); private set

    // Prove
    var lowMemory by mutableStateOf(false)
    var derived by mutableStateOf<ProverInputs.Derived?>(null); private set
    var proof by mutableStateOf<ProofSummary?>(null); private set
    var proverVersion by mutableStateOf(""); private set

    // Submit
    var bridgeSessionId by mutableStateOf<String?>(null); private set
    var bridgeState by mutableStateOf<BridgeClient.SessionState?>(null); private set

    init {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { prover.version() }.onSuccess { v -> withContext(Dispatchers.Main) { proverVersion = v } }
                .onFailure { e -> withContext(Dispatchers.Main) { proverVersion = "core not loaded: ${e.message}" } }
        }
    }

    private fun logLine(s: String) {
        val t = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        android.util.Log.i(TAG, s)
        log.value = log.value + "$t $s"
    }

    /** `adb shell am start -n org.nachweis.prover/.MainActivity --ez autoprove true [--ez lowmem true]`:
     *  test vector -> derive -> prove, results in logcat (tag NachweisProver) and in the files dir. */
    fun autoProve(lowMem: Boolean) {
        if (proof != null || busy) return
        lowMemory = lowMem
        viewModelScope.launch {
            busy = true; error = null
            try {
                withContext(Dispatchers.IO) {
                    loadTestPresentationBlocking()
                    toProveBlocking()
                    proveBlocking()
                }
            } catch (e: Throwable) {
                error = e.message ?: e.toString(); logLine("error: $error")
            } finally { busy = false }
        }
    }

    private fun run(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true; error = null
            try {
                withContext(Dispatchers.IO) { block() }
            } catch (e: Throwable) {
                error = e.message ?: e.toString()
                logLine("error: ${error}")
            } finally {
                busy = false
            }
        }
    }

    fun reset() {
        pollJob?.cancel()
        step = Step.SESSION; error = null; relaySession = null; relayStatus = "pending"
        presentation = null; derived = null; proof = null; bridgeSessionId = null; bridgeState = null
        claims = emptyList(); challengeHex = ""; keyPair = null
    }

    /** Session: fresh P-256 key, fresh 32-byte challenge, POST /relay/request. */
    fun requestPresentation() = run {
        val kp = EcKeys.generate()
        keyPair = kp
        val challenge = EcKeys.randomBytes(32)
        val ch = ProverInputs.toHex(challenge)
        val jwk = EcKeys.publicJwk(kp, "prover-" + ProverInputs.toHex(EcKeys.randomBytes(4)))
        val s = relay.createRequest(verifierUrl, jwk, boundAddress.trim(), ch)
        val expectedNonce = ProverInputs.toHex(ProverInputs.sha256(ProverInputs.hex(boundAddress) + challenge))
        if (s.nonce != expectedNonce) throw IllegalStateException("relay nonce ${s.nonce} != sha256(address||challenge) $expectedNonce")
        withContext(Dispatchers.Main) {
            challengeHex = ch; relaySession = s; relayStatus = "pending"; step = Step.WAITING
            logLine("relay session ${s.sessionId} created, nonce ${s.nonce.take(16)}...")
        }
        startPolling()
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch(Dispatchers.IO) {
            while (isActive) {
                val s = relaySession ?: break
                val st = runCatching { relay.status(s.statusUrl) }.getOrElse { "error: ${it.message}" }
                withContext(Dispatchers.Main) { relayStatus = st }
                if (st == "responded" || st == "picked_up") break
                delay(2000)
            }
        }
    }

    /** Pickup: one-time fetch, ECDH-ES decrypt, keep only the vp_token. */
    fun pickup() = run {
        val s = relaySession ?: throw IllegalStateException("no relay session")
        val kp = keyPair ?: throw IllegalStateException("no key")
        val p = relay.pickup(s.pickupUrl, s.pickupToken)
        val dec = Jwe.decryptCompact(p.jwe, kp.private)
        val obj = JSONObject(String(dec.plaintext, Charsets.UTF_8))
        val vpToken = obj.getJSONObject("vp_token")
        val firstKey = vpToken.keys().next()
        val entry = vpToken.get(firstKey)
        val pres = when (entry) {
            is org.json.JSONArray -> entry.getString(0)
            else -> entry.toString()
        }
        withContext(Dispatchers.Main) {
            presentation = pres
            presentationSource = "wallet via relay (${dec.header.optString("enc")})"
            claims = ProverInputs.disclosedClaims(pres)
            step = Step.PICKUP
            logLine("presentation received, ${pres.length} bytes; JWE ${p.jwe.length} bytes")
        }
    }

    /** Bundled test vector: whole flow without a wallet or a relay. */
    fun loadTestPresentation() = run { loadTestPresentationBlocking() }

    private suspend fun loadTestPresentationBlocking() {
        val text = getApplication<Application>().assets.open("test-vector.json").bufferedReader().readText()
        val v = JSONObject(text)
        withContext(Dispatchers.Main) {
            pollJob?.cancel()
            boundAddress = v.getString("bound_address_hex")
            challengeHex = v.getString("challenge_hex").removePrefix("0x")
            issuerKeyOverrideHex = v.getString("issuer_key_sec1_hex")
            presentation = v.getString("presentation")
            presentationSource = "bundled test vector (synthetic PID, prover-sp1/fixtures/input.json)"
            claims = ProverInputs.disclosedClaims(v.getString("presentation"))
            relaySession = null
            step = Step.PICKUP
            logLine("test presentation loaded, ${v.getString("presentation").length} bytes")
        }
    }

    fun toProve() = run { toProveBlocking() }

    private suspend fun toProveBlocking() {
        val pres = presentation ?: throw IllegalStateException("no presentation")
        val issuerKey = issuerKeyOverrideHex.trim().ifEmpty { IssuerKey.fromPresentationX5c(pres) }
        val d = ProverInputs.derive(pres, issuerKey, boundAddress.trim(), challengeHex)
        withContext(Dispatchers.Main) {
            derived = d; step = Step.PROVE
            logLine("inputs derived: nonce ${d.expected.nonceHex.take(16)}..., expiry ${d.expected.expiry}")
        }
    }

    fun prove() = run { proveBlocking() }

    private suspend fun proveBlocking() {
        val d = derived ?: throw IllegalStateException("inputs not derived")
        withContext(Dispatchers.Main) { logLine("copying assets / loading SRS") }
        val points = prover.loadSrs()
        withContext(Dispatchers.Main) { logLine("SRS ready: $points points; proving (lowMemory=$lowMemory)") }
        val t0 = System.nanoTime()
        val r = prover.prove(d.toml, lowMemory)
        val wall = (System.nanoTime() - t0) / 1_000_000
        val decoded = PublicInputs.decode(r.publicInputs)
        if (decoded.nonceHex != d.expected.nonceHex) throw IllegalStateException("public nonce differs from expected")
        if (decoded.subjectHex != d.expected.subjectHex) throw IllegalStateException("public subject differs from expected")
        val verified = runCatching {
            org.nachweis.prover.core.verifyPidSdjwt(prover.ensureAssets().vk.absolutePath, r.proof, r.publicInputs)
        }.getOrNull()
        val summary = ProofSummary(
            proofHex = ProverInputs.toHex(r.proof),
            publicInputsHex = r.publicInputs.map { ProverInputs.toHex(it) },
            decoded = decoded,
            witnessMs = r.witnessMs.toLong(),
            proveMs = r.proveMs.toLong(),
            wallMs = wall,
            peakRssBytes = r.peakRssBytes.toLong(),
            lowMemory = lowMemory,
            verifiedOnDevice = verified,
        )
        // Keep the last proof for `adb pull` and desktop `bb verify -t evm`.
        runCatching {
            val dir = getApplication<Application>().getExternalFilesDir(null) ?: getApplication<Application>().filesDir
            java.io.File(dir, "proof").writeBytes(r.proof)
            java.io.File(dir, "public_inputs").writeBytes(r.publicInputs.fold(ByteArray(0)) { acc, b -> acc + b })
            java.io.File(dir, "proof.json").writeText(
                JSONObject().put("proof_hex", "0x" + ProverInputs.toHex(r.proof))
                    .put("public_inputs_hex", org.json.JSONArray(r.publicInputs.map { "0x" + ProverInputs.toHex(it) })).toString()
            )
        }
        withContext(Dispatchers.Main) {
            proof = summary
            logLine("proof ${r.proof.size} B, ${r.publicInputs.size} public inputs, witness ${r.witnessMs} ms, prove ${r.proveMs} ms, wall $wall ms, peak RSS ${r.peakRssBytes.toLong() / 1_000_000} MB, on-device verify $verified")
        }
    }

    fun toSubmit() { step = Step.SUBMIT }

    fun submit() = run {
        val p = proof ?: throw IllegalStateException("no proof")
        val id = bridgeSessionId ?: bridge.createSession(bridgeUrl, boundAddress.trim(), challengeHex).also {
            withContext(Dispatchers.Main) { bridgeSessionId = it; logLine("bridge session $it") }
        }
        val resp = bridge.submitNoirProof(bridgeUrl, id, p.proofHex, p.publicInputsHex)
        withContext(Dispatchers.Main) { logLine("noir-proof accepted: ${resp.toString().take(120)}") }
        var last: BridgeClient.SessionState? = null
        for (i in 0 until 120) {
            val st = bridge.getSession(bridgeUrl, id)
            withContext(Dispatchers.Main) { bridgeState = st }
            last = st
            if (st.state == "attested" || st.state == "failed") break
            delay(2000)
        }
        withContext(Dispatchers.Main) { logLine("bridge state: ${last?.state} ${last?.detail ?: ""}") }
    }

    /** Proof bytes for sharing by hand (adb, clipboard) when no bridge is reachable. */
    fun proofExportText(): String {
        val p = proof ?: return ""
        return JSONObject().put("proof_hex", "0x" + p.proofHex)
            .put("public_inputs_hex", org.json.JSONArray(p.publicInputsHex.map { "0x$it" })).toString()
    }
}
