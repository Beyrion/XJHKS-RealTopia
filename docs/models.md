# Local model setup

Model weights are not distributed in this repository. Supply licensed artifacts locally before building; the Android app packages the `model/` directory as assets.

- Face: set `FACE_MNN_SOURCE_DIR` and run `./scripts/prepare-face-models.sh`.
- Speech: download Qwen3-ASR through the app model manager.
- Endpoint detection: prepare `model/vad/silero_vad.mnn`, `model/turnsense/turnsense_fp16.mnn` and `model/turnsense/am.mvn`.
- Vision language: use the managed Qwen3-VL download in Settings.

# Silero VAD for RealTopia

`silero_vad.mnn` is converted from the 16 kHz Silero VAD ONNX model maintained
by k2-fsa for sherpa-onnx:

- Source: https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
- Upstream project: https://github.com/snakers4/silero-vad
- Upstream license: MIT
- Source ONNX SHA-256: `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6`
- MNN SHA-256: `3ee41c2d2fb3a3d643b28ae72b82a89d74b882907214b09e87bbd7ad978a355f`

Reproduce the conversion with the repository's host `MNNConvert`:

```sh
MNNConvert -f ONNX \
  --modelFile silero_vad.onnx \
  --MNNModel silero_vad.mnn \
  --bizCode RealTopiaSileroVAD \
  --optimizeLevel 1
```

Do not pass `--keepInputFormat` for this ONNX model. With MNN 3.6 it changes
the recurrent state layout and causes severe probability drift (0.99855 in
ONNX versus 0.29227 in MNN on the checked speech fixture).

The model consumes normalized mono PCM in 512-sample windows and carries two
`[2, 1, 64]` recurrent states between windows. It is only an acoustic boundary
detector; Qwen3-ASR remains responsible for transcription.

# TurnSense endpoint model

`am.mvn` is the CMVN frontend parameter file from `Baiji-Team/TurnSense`, and
`turnsense_fp16.mnn` is the MNN FP16 weight artifact converted from the official
FP32 ONNX model.

After you provision them locally, both files are packaged in the phone APK. On first startup the runtime copies
the MNN asset to the app's no-backup directory, verifies its size and SHA-256,
then gives MNN a real file path that can be memory-mapped. No sidecar download
or `adb push` step is required.

```text
<no-backup-files>/turnsense/turnsense_fp16.mnn
```

Model SHA-256:
`3a7738a51dc9ebeec00f7eb6cb456eaf77f8d62fa44f0bbf72e02f3a523243a9`.

The artifact was converted from the official FP32 ONNX model with MNNConvert
`--fp16 --keepInputFormat --optimizeLevel 1`.

