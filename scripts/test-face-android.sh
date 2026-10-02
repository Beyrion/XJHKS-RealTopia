#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$project_dir/scripts/android-env.sh"
realtopia_android_build_env
phone_serial="$(realtopia_detect_device phone)"
sample="$project_dir/pc/.venv/lib/python3.12/site-packages/insightface/data/images/t1.jpg"

test -f "$sample" || {
  echo "Missing InsightFace test image: $sample" >&2
  echo "Create the pc/.venv environment before running the device pipeline test." >&2
  exit 1
}

"$project_dir/scripts/prepare-face-models.sh"
export ANDROID_SERIAL="$phone_serial"

cd "$project_dir/phone/app/src-tauri/gen/android"
./gradlew :app:connectedDebugAndroidTest
