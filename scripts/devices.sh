#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$project_dir/scripts/android-env.sh"
realtopia_android_sdk_env
adb_bin="$REALTOPIA_ADB_BIN"
"$adb_bin" devices -l

echo
echo "Classification hints:"
"$adb_bin" devices | awk 'NR>1 && $2=="device" {print $1}' | while read -r serial; do
  model=$("$adb_bin" -s "$serial" shell getprop ro.product.model | tr -d '\r')
  manufacturer=$("$adb_bin" -s "$serial" shell getprop ro.product.manufacturer | tr -d '\r')
  echo "$serial  manufacturer=$manufacturer  model=$model"
done
