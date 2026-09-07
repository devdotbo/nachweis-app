package org.nachweis.prover.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

@Composable
fun FlowScreen(vm: FlowViewModel) {
    Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Nachweis Prover", style = MaterialTheme.typography.headlineSmall)
        Text(vm.proverVersion, style = MaterialTheme.typography.bodySmall)
        Text("Step ${vm.step.ordinal + 1}/5: ${vm.step.name.lowercase().replaceFirstChar { it.uppercase() }}", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        vm.error?.let { Text("Error: $it", color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(8.dp))
        when (vm.step) {
            Step.SESSION -> SessionScreen(vm)
            Step.WAITING -> WaitingScreen(vm)
            Step.PICKUP -> PickupScreen(vm)
            Step.PROVE -> ProveScreen(vm)
            Step.SUBMIT -> SubmitScreen(vm)
        }
        Spacer(Modifier.height(16.dp))
        HorizontalDivider()
        Row { TextButton(onClick = { vm.reset() }) { Text("Start over") } }
        Text("Log", style = MaterialTheme.typography.titleSmall)
        vm.log.value.takeLast(30).forEach { Text(it, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace) }
    }
}

@Composable
fun SessionScreen(vm: FlowViewModel) {
    OutlinedTextField(vm.verifierUrl, { vm.verifierUrl = it }, label = { Text("Verifier (blind relay) URL") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(vm.bridgeUrl, { vm.bridgeUrl = it }, label = { Text("Bridge URL (submission)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(vm.boundAddress, { vm.boundAddress = it }, label = { Text("Bound Ethereum address") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(vm.expectedAud, { vm.expectedAud = it }, label = { Text("KB-JWT aud pinned by the circuit") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(vm.issuerKeyOverrideHex, { vm.issuerKeyOverrideHex = it }, label = { Text("Issuer key SEC1 hex (optional, default: x5c leaf)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    Spacer(Modifier.height(8.dp))
    Button(onClick = { vm.requestPresentation() }, enabled = !vm.busy) { Text("Request presentation") }
    Text("Generates a fresh P-256 key and challenge, posts /relay/request. The verifier never sees the plaintext.", style = MaterialTheme.typography.bodySmall)
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = { vm.loadTestPresentation() }, enabled = !vm.busy) { Text("Load test presentation") }
    Text("Bundled synthetic PID vector; runs pickup, prove and submit without a wallet.", style = MaterialTheme.typography.bodySmall)
}

@Composable
fun WaitingScreen(vm: FlowViewModel) {
    val s = vm.relaySession ?: return
    val ctx = LocalContext.current
    Text("Scan with the wallet phone, or open on this device:")
    QrImage(s.openid4vpUri)
    TextButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(s.openid4vpUri))) }) { Text("Open openid4vp:// link (same device)") }
    Text("Session ${s.sessionId}", style = MaterialTheme.typography.bodySmall)
    Text("Nonce ${s.nonce}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
    Text("Status: ${vm.relayStatus}")
    Spacer(Modifier.height(8.dp))
    Button(onClick = { vm.pickup() }, enabled = !vm.busy && vm.relayStatus == "responded") { Text("Pick up and decrypt") }
}

@Composable
fun PickupScreen(vm: FlowViewModel) {
    val pres = vm.presentation ?: return
    Text("Presentation received, ${pres.length} bytes")
    Text("Source: ${vm.presentationSource}", style = MaterialTheme.typography.bodySmall)
    Text("Bound address ${vm.boundAddress}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
    Row { Checkbox(vm.showClaims, { vm.showClaims = it }); Text("Debug: show disclosed claims", Modifier.padding(top = 12.dp)) }
    if (vm.showClaims) vm.claims.forEach { (k, v) -> Text("$k = $v", fontFamily = FontFamily.Monospace) }
    Spacer(Modifier.height(8.dp))
    Button(onClick = { vm.toProve() }, enabled = !vm.busy) { Text("Derive circuit inputs") }
}

@Composable
fun ProveScreen(vm: FlowViewModel) {
    val d = vm.derived
    if (d != null) {
        Text("Inputs derived (${d.toml.length} chars of Prover.toml)")
        Text("expected issuer_key_hash ${d.expected.issuerKeyHashHex}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
        Text("expected nonce ${d.expected.nonceHex}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
        Text("expiry ${d.expected.expiry}", style = MaterialTheme.typography.bodySmall)
    }
    Row { Checkbox(vm.lowMemory, { vm.lowMemory = it }); Text("Low memory mode (file backed polynomials, slower)", Modifier.padding(top = 12.dp)) }
    Button(onClick = { vm.prove() }, enabled = !vm.busy && d != null && vm.proof == null) { Text(if (vm.busy) "Proving..." else "Prove on this device") }
    vm.proof?.let { p ->
        Spacer(Modifier.height(8.dp))
        Text("Proof ${p.proofHex.length / 2} bytes, ${p.publicInputsHex.size} public inputs", style = MaterialTheme.typography.titleSmall)
        Text("witness ${p.witnessMs} ms, prove ${p.proveMs} ms, wall ${p.wallMs} ms")
        Text("peak RSS ${p.peakRssBytes / 1_000_000} MB (VmHWM), low memory ${p.lowMemory}")
        Text("on-device verify: ${p.verifiedOnDevice}")
        Text("over18 ${p.decoded.over18}, expiry ${p.decoded.expiry}", style = MaterialTheme.typography.bodySmall)
        Text("subject ${p.decoded.subjectHex}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
        Text("nonce ${p.decoded.nonceHex}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
        Spacer(Modifier.height(8.dp))
        Button(onClick = { vm.toSubmit() }, enabled = !vm.busy) { Text("Continue to submit") }
    }
}

@Composable
fun SubmitScreen(vm: FlowViewModel) {
    val clipboard = LocalClipboardManager.current
    val p = vm.proof ?: return
    OutlinedTextField(vm.bridgeUrl, { vm.bridgeUrl = it }, label = { Text("Bridge URL") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    Text("POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[]} then poll GET /sessions/:id", style = MaterialTheme.typography.bodySmall)
    Button(onClick = { vm.submit() }, enabled = !vm.busy) { Text("Submit to bridge") }
    vm.bridgeSessionId?.let { Text("bridge session $it", style = MaterialTheme.typography.bodySmall) }
    vm.bridgeState?.let { st ->
        Text("State: ${st.state}", style = MaterialTheme.typography.titleSmall)
        Text(st.detail)
        st.txHash?.let { Text("tx $it", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
        st.error?.let { Text("error: $it", color = MaterialTheme.colorScheme.error) }
    }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = { clipboard.setText(AnnotatedString(vm.proofExportText())) }) { Text("Copy proof JSON (${p.proofHex.length / 2} B)") }
}

@Composable
fun QrImage(text: String, sizePx: Int = 640) {
    val bitmap = remember(text) {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
        for (x in 0 until sizePx) for (y in 0 until sizePx) bmp.setPixel(x, y, if (matrix[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt())
        bmp
    }
    Image(bitmap.asImageBitmap(), contentDescription = "openid4vp QR", modifier = Modifier.size(280.dp))
}
