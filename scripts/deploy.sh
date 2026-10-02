#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$project_dir/scripts/android-env.sh"
realtopia_android_sdk_env
adb_bin="$REALTOPIA_ADB_BIN"
glass_serial="$(realtopia_detect_device glasses)"
phone_serial="$(realtopia_detect_device phone)"
glass_apk="$project_dir/glasses/build/outputs/apk/debug/glasses-debug.apk"
phone_apk="$project_dir/phone/app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"

"$project_dir/scripts/build.sh"
test -f "$phone_apk" || { echo "Phone APK is missing: run Tauri android build first" >&2; exit 1; }
realtopia_install_apk "$glass_serial" "$glass_apk"
realtopia_install_apk "$phone_serial" "$phone_apk"
for permission in android.permission.CAMERA android.permission.RECORD_AUDIO android.permission.BLUETOOTH_CONNECT; do "$adb_bin" -s "$glass_serial" shell pm grant com.realtopia.glasses "$permission" || true; done
for permission in android.permission.RECORD_AUDIO android.permission.BLUETOOTH_CONNECT; do "$adb_bin" -s "$phone_serial" shell pm grant com.realtopia.phone "$permission" || true; done
for permission in android.permission.BLUETOOTH_SCAN android.permission.BLUETOOTH_ADVERTISE android.permission.NEARBY_WIFI_DEVICES; do
  "$adb_bin" -s "$phone_serial" shell pm grant com.realtopia.phone "$permission" || true
done
"$adb_bin" -s "$glass_serial" shell am start -n com.realtopia.glasses/.MainActivity
"$adb_bin" -s "$phone_serial" shell monkey -p com.realtopia.phone 1
echo "Started phone=$phone_serial glasses=$glass_serial"
