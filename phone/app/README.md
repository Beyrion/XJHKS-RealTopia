# RealTopia phone app

Tauri 2 application for controlling the Rokid glasses, receiving REA/1 JPEG
frames, and running on-device face detection/recognition.

The boundary is intentional:

- `RealiaTransportPlugin`: Bluetooth/CXR/Wi-Fi Direct and JPEG persistence;
- Rust application core: request orchestration, gallery persistence and
  `known`/`unknown`/`ambiguous` decisions;
- `RealiaFacePlugin` + `phone/face-native`: Bitmap decode, SCRFD, alignment and
  ArcFace through the MNN Module API.
- `RealiaModelManagerPlugin`: keeps optional Qwen models outside the APK,
  opens their ModelScope repositories, and queues the Qwen3-ASR snapshot in
  Android `DownloadManager` on the first validated internet connection. The
  resumable ASR files are stored under the app-specific external files
  directory and are removed by Android when the app is uninstalled. A file is
  considered installed only after `DownloadManager.STATUS_SUCCESSFUL`, its
  expected length, and the ModelScope SHA-256 all match; a mismatch is deleted
  and queued again.

The downloaded Qwen3-ASR snapshot is wired to MNN through `RealiaAsrPlugin` and
`realtopia_asr_jni`. Incoming 16 kHz mono PCM is transcribed locally by default;
the cloud transcription route is only a fallback when a cloud key is configured.
The Qwen3 1.7B, Qwen3-VL 2B/4B and Qwen3-TTS entries are intentionally manual
because of their storage footprint. None of these five Qwen repositories is
packaged in the APK.

The Topia home screen also supports a user-initiated mood check-in. The mood
plugin records 16 kHz mono PCM into app-specific storage; `RealiaAsrPlugin`
transcribes it locally with Qwen3-ASR and deletes the temporary PCM before only
the resulting transcript is sent through `RealiaCloudPlugin`. The model must return
a constrained JSON mood (`joyful`, `calm`, `sad`, `anxious`, `angry`, `tired`,
or `neutral`) plus intensity and short Chinese copy. The WebView validates that
response and maps it to local, predefined Three.js/CSS weather effects; the
model cannot provide executable effects. The current mood and its memory entry
are persisted locally. A cloud key must first be saved in Intelligence settings.

Cloud chat uses Alibaba Cloud Model Studio's OpenAI-compatible Beijing endpoint.
`RealiaCloudPlugin` owns the HTTPS request and encrypts the API key with an
AES-256-GCM key generated in AndroidKeyStore. Rust and the WebView receive only
`has_api_key`; plaintext credentials are never returned, logged, embedded in the
APK, or persisted in `localStorage`. Enter or rotate the key from the app's
Intelligence settings page. Leaving the field empty preserves the installed key.

For a host-side endpoint check, export `DASHSCOPE_API_KEY` and optionally
`DASHSCOPE_MODEL` / `DASHSCOPE_BASE_URL`, then run
`python3 scripts/test-cloud-client.py` from the repository root. The script does
not print or persist the key. Android intentionally does not import build-machine
environment variables, because doing so would embed a reusable credential in the
APK.

Build from the repository root with `./scripts/build-phone-android.sh`. See
`docs/architecture.md` for the architecture and `docs/device-testing.md` for device tests.
