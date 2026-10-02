#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_apk="$project_dir/phone/app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
output_dir="${1:-$project_dir/artifacts/release}"
output_apk="$output_dir/realtopia-phone-debug-with-models.apk"

[[ -f "$source_apk" ]] || { echo "Build output missing: $source_apk" >&2; exit 2; }
mkdir -p "$output_dir"
install -m 0644 "$source_apk" "$output_apk"
sha256sum "$output_apk" >"$output_apk.sha256"

unzip -l "$output_apk" | grep -q 'assets/vad/silero_vad.mnn' || {
  echo "Silero VAD is missing from APK" >&2
  exit 3
}
unzip -l "$output_apk" | grep -q 'assets/turnsense/turnsense_fp16.mnn' || {
  echo "TurnSense FP16 is missing from APK" >&2
  exit 4
}

echo "Self-contained phone APK: $output_apk"
du -h "$output_apk"
