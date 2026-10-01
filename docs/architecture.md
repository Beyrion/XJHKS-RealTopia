# Architecture

The phone owns application state, people and memories, quest progression and Topia generation. React calls Rust commands through Tauri; Android plugins provide Rokid transport, local inference and device context.

The glasses own camera warm-up, hot captures, microphone input and contextual HUD choices. Bluetooth carries commands and Wi-Fi Direct carries binary JPEG/PCM frames. Each new session establishes P2P before the phone requests captures.

Keep model weights outside version control. MNN and the native ASR/vision bridges run on the phone; cloud configuration is supplied locally. Validate cold capture and repeated hot capture latency using the phone benchmark and the dual-device test workflow.
