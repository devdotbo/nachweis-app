package org.nachweis.prover

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
        setContent {
            MaterialTheme {
                Surface { FlowScreen(vm) }
            }
        }
    }
}
