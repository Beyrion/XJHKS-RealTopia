#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$project_dir/scripts/android-env.sh"
realtopia_android_build_env

cd "$project_dir/phone/app"
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
"$project_dir/scripts/build-phone-android.sh"

cd "$project_dir"
./gradlew :glasses:testDebugUnitTest :glasses:assembleDebug :glasses:lintDebug --stacktrace
echo "RealTopia application-layer build passed."
