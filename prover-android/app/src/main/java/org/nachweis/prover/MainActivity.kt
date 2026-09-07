package org.nachweis.prover

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import org.nachweis.prover.ui.FlowScreen
import org.nachweis.prover.ui.FlowViewModel

class MainActivity : ComponentActivity() {
    private val vm: FlowViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (intent?.getBooleanExtra("autoprove", false) == true) {
            vm.autoProve(intent.getBooleanExtra("lowmem", false))
        }
        handleHandoff(intent)
        setContent {
            MaterialTheme {
                Surface { FlowScreen(vm) }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleHandoff(intent)
    }

    /** Two-device handoff without typing: a `nachweis://handoff?...` link (ACTION_VIEW) or
     *  `adb shell am start -n org.nachweis.prover/.MainActivity --es handoff '<json or uri>'`. */
    private fun handleHandoff(intent: Intent?) {
        val text = intent?.getStringExtra("handoff")
            ?: intent?.data?.takeIf { it.scheme == "nachweis" }?.toString()
            ?: return
        vm.handoffText = text
        vm.applyHandoff()
    }
}
