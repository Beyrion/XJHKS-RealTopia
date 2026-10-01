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
