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

Build from the repository root with `./scripts/build-phone-android.sh`. See
`docs/architecture.md` for the architecture and `docs/device-testing.md` for device tests.
