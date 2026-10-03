#!/usr/bin/env bash

# Resolve the Android toolchain without embedding developer-specific paths.
# Set ANDROID_REFERENCE_DIR to an indoor-vln-app-demo checkout, or provide the
# standard JAVA_HOME / ANDROID_HOME / NDK_HOME variables directly.
realtopia_android_sdk_env() {
  local reference_dir="${ANDROID_REFERENCE_DIR:-}"
  if [[ -n "$reference_dir" ]]; then
    export ANDROID_HOME="${ANDROID_HOME:-$reference_dir/.android-sdk}"
  fi
  if [[ -z "${ANDROID_HOME:-}" ]]; then
    echo "Set ANDROID_HOME or ANDROID_REFERENCE_DIR." >&2
    return 1
  fi
  REALTOPIA_ADB_BIN="${ADB:-$ANDROID_HOME/platform-tools/adb}"
  if [[ ! -x "$REALTOPIA_ADB_BIN" ]]; then
    echo "ADB is not executable: $REALTOPIA_ADB_BIN" >&2
    return 1
  fi
}

realtopia_android_build_env() {
  local reference_dir="${ANDROID_REFERENCE_DIR:-}"
  realtopia_android_sdk_env
  if [[ -n "$reference_dir" ]]; then
    export JAVA_HOME="${JAVA_HOME:-$reference_dir/.jdk}"
    export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$reference_dir/.gradle-home}"
  fi
  if [[ -z "${JAVA_HOME:-}" ]]; then
    echo "Set JAVA_HOME or ANDROID_REFERENCE_DIR." >&2
    return 1
  fi
  export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/28.2.13676358}"
  if [[ ! -d "$NDK_HOME" ]]; then
    echo "Android NDK is missing: $NDK_HOME" >&2
    return 1
  fi
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
}

realtopia_require_env() {
  local variable_name="$1"
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Set $variable_name before running this script." >&2
    return 1
  fi
}

realtopia_detect_device() {
  local kind="$1"
  local override=""
  local serial_variable=""
  local -a matches=()
  if [[ "$kind" == "phone" ]]; then
    override="${PHONE_SERIAL:-}"
    serial_variable=PHONE_SERIAL
  elif [[ "$kind" == "glasses" ]]; then
    override="${GLASS_SERIAL:-}"
    serial_variable=GLASS_SERIAL
  else
    echo "Unknown Android device kind: $kind" >&2
    return 1
  fi
  if [[ -n "$override" ]]; then
    printf '%s\n' "$override"
    return 0
  fi
  while read -r serial state details; do
    [[ -n "$serial" && "$state" == "device" ]] || continue
    local identity
    identity="$(printf '%s' "$details" | tr '[:upper:]' '[:lower:]')"
    if [[ "$kind" == "glasses" ]]; then
      if [[ "$identity" == *glass* ]]; then
        matches+=("$serial")
      fi
    elif [[ "$identity" != *glass* ]]; then
      matches+=("$serial")
    fi
  done < <($REALTOPIA_ADB_BIN devices -l | tail -n +2)
  if [[ ${#matches[@]} -ne 1 ]]; then
    echo "Expected exactly one connected $kind device, found ${#matches[@]}. Set $serial_variable to disambiguate." >&2
    return 1
  fi
  printf '%s\n' "${matches[0]}"
}

realtopia_install_apk() {
  local serial="$1"
  local apk="$2"
  local remote="/data/local/tmp/realtopia-$(basename "$apk")"
  [[ -f "$apk" ]] || { echo "APK is missing: $apk" >&2; return 1; }
  "$REALTOPIA_ADB_BIN" -s "$serial" push "$apk" "$remote" >/dev/null
  local host_size device_size
  host_size="$(wc -c < "$apk" | tr -d '[:space:]')"
  device_size="$($REALTOPIA_ADB_BIN -s "$serial" shell stat -c %s "$remote" | tr -d '\r')"
  if [[ "$host_size" != "$device_size" ]]; then
    echo "APK transfer size mismatch: host=$host_size device=$device_size" >&2
    return 1
  fi
  local result
  result="$($REALTOPIA_ADB_BIN -s "$serial" shell pm install -r -t "$remote")"
  printf '%s\n' "$result"
  [[ "$result" == *Success* ]]
}
