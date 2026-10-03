// Vendored from k2-fsa/sherpa-onnx v1.13.8. SPDX-License-Identifier: Apache-2.0
package com.k2fsa.sherpa.mnn

data class SpeakerEmbeddingExtractorConfig(
    val model: String = "",
    var numThreads: Int = 1,
    var debug: Boolean = false,
    var provider: String = "cpu",
)
