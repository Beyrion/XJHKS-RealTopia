#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tool_dir="$project_dir/dev/ws-scrcpy-web"
runtime_dir="${ANDROID_CONTROL_RUNTIME_DIR:-$project_dir/dev/.runtime/android-control}"
shared_deps="$runtime_dir/dependencies"
runtime_patch="$project_dir/dev/android-control/ws-scrcpy-web-runtime.patch"
scrcpy_server_version="4.0"
scrcpy_server_sha256="84924bd564a1eb6089c872c7521f968058977f91f5ff02514a8c74aff3210f3a"
scrcpy_server_url="https://github.com/Genymobile/scrcpy/releases/download/v${scrcpy_server_version}/scrcpy-server-v${scrcpy_server_version}"

if [[ -f "$project_dir/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$project_dir/.env"
  set +a
fi

# shellcheck source=android-env.sh
source "$project_dir/scripts/android-env.sh"

phone_port="${PHONE_CONTROL_PORT:-18001}"
glass_port="${GLASS_CONTROL_PORT:-18002}"
phone_component="${PHONE_CONTROL_COMPONENT:-com.realtopia.phone/.MainActivity}"
glass_component="${GLASS_CONTROL_COMPONENT:-com.realtopia.glasses/.MainActivity}"

usage() {
  echo "Usage: $0 [start|status|stop]"
}

validate_port() {
  local name="$1" value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value < 1024 || value > 65535 )); then
    echo "$name must be an integer between 1024 and 65535: $value" >&2
    return 1
  fi
}

pid_is_running() {
  local pid_file="$1" pid
  [[ -f "$pid_file" ]] || return 1
  pid="$(<"$pid_file")"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

instance_dir() {
  echo "$runtime_dir/$1"
}

direct_url() {
  local port="$1" serial="$2" device_kind="${3:-phone}"
  echo "http://localhost:$port/embed.html?device=$serial&deviceKind=$device_kind"
}

device_kind_for_label() {
  if [[ "$1" == "glasses" ]]; then
    echo "tablet"
  else
    echo "phone"
  fi
}

write_config() {
  local config_file="$1" port="$2" adb_bin="$3"
  node -e '
    const fs = require("node:fs");
    const [file, port, adbPath, dependenciesPath] = process.argv.slice(1);
    fs.mkdirSync(require("node:path").dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      webPort: Number(port),
      installMode: null,
      firstRunComplete: true,
      adbPath,
      dependenciesPath,
    }, null, 2)}\n`);
  ' "$config_file" "$port" "$adb_bin" "$shared_deps"
}

ensure_scrcpy_server() {
  local server_dir="$shared_deps/scrcpy-server"
  local server_file="$server_dir/scrcpy-server"
  local version_file="$server_dir/.version"
  local download_file="$server_dir/.scrcpy-server.download.$$"
  local installed_version=""

  if [[ -f "$version_file" ]]; then
    installed_version="$(<"$version_file")"
  fi
  if [[ "$installed_version" == "$scrcpy_server_version" ]] &&
    echo "$scrcpy_server_sha256  $server_file" | sha256sum --check --status 2>/dev/null; then
    return 0
  fi

  mkdir -p "$server_dir"
  echo "Downloading scrcpy-server v$scrcpy_server_version (first run only)..."
  if ! curl --fail --location --retry 3 --connect-timeout 10 \
    --output "$download_file" "$scrcpy_server_url"; then
    rm -f "$download_file"
    echo "Failed to download scrcpy-server v$scrcpy_server_version from its official release." >&2
    return 1
  fi
  if ! echo "$scrcpy_server_sha256  $download_file" | sha256sum --check --status; then
    rm -f "$download_file"
    echo "scrcpy-server v$scrcpy_server_version checksum mismatch; refusing to run it." >&2
    return 1
  fi
  mv "$download_file" "$server_file"
  printf '%s\n' "$scrcpy_server_version" >"$version_file"
}

build_patched_tool() {
  local build_status patch_applied=0
  if [[ ! -f "$runtime_patch" ]]; then
    echo "Missing ws-scrcpy-web runtime patch: $runtime_patch" >&2
    return 1
  fi
  if ! git -C "$tool_dir" apply --check "$runtime_patch"; then
    echo "The ws-scrcpy-web runtime patch no longer applies to the pinned submodule revision." >&2
    return 1
  fi

  git -C "$tool_dir" apply "$runtime_patch"
  patch_applied=1
  restore_build_sources() {
    if (( patch_applied )); then
      git -C "$tool_dir" apply --reverse "$runtime_patch"
      patch_applied=0
    fi
  }
  trap 'restore_build_sources; exit 130' INT
  trap 'restore_build_sources; exit 143' TERM

  set +e
  npm --prefix "$tool_dir" run build
  build_status=$?
  set -e
  restore_build_sources
  trap - INT TERM
  return "$build_status"
}

ensure_tool() {
  if [[ ! -f "$tool_dir/package.json" ]]; then
    echo "Initializing dev/ws-scrcpy-web submodule..."
    git -C "$project_dir" submodule update --init --recursive dev/ws-scrcpy-web
  fi
  command -v node >/dev/null || { echo "Node.js 24+ is required." >&2; return 1; }
  command -v npm >/dev/null || { echo "npm is required." >&2; return 1; }
  local node_major
  node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
  if (( node_major < 24 )); then
    echo "Node.js 24+ is required; found $(node --version)." >&2
    return 1
  fi
  if [[ ! -d "$tool_dir/node_modules" ]]; then
    echo "Installing ws-scrcpy-web dependencies..."
    npm --prefix "$tool_dir" ci
  fi
  local build_revision build_stamp
  build_revision="$(git -C "$tool_dir" rev-parse HEAD):$(sha256sum "$tool_dir/package-lock.json" "$runtime_patch" | sha256sum | awk '{print $1}')"
  build_stamp="$runtime_dir/build.revision"
  if [[ ! -f "$tool_dir/dist/index.js" || ! -f "$build_stamp" || "$(<"$build_stamp")" != "$build_revision" ]]; then
    echo "Building ws-scrcpy-web..."
    build_patched_tool
    node "$tool_dir/scripts/stage-seed-scrcpy-server.mjs"
    node "$tool_dir/scripts/stage-seed-node-pty.mjs"
    mkdir -p "$runtime_dir"
    echo "$build_revision" >"$build_stamp"
  fi
  # ws-scrcpy-web's parser targets the scrcpy v4 protocol, but its current
  # vendored seed is still v3.3.4. Keep the compatible official server in the
  # ignored runtime cache and never overwrite it with the stale seed.
  ensure_scrcpy_server
}

check_device() {
  local label="$1" serial="$2" state
  if [[ "${ANDROID_CONTROL_SKIP_DEVICE_CHECK:-0}" == "1" ]]; then
    return 0
  fi
  state="$($REALTOPIA_ADB_BIN -s "$serial" get-state 2>/dev/null || true)"
  if [[ "$state" != "device" ]]; then
    echo "$label is not connected or authorized: $serial" >&2
    return 1
  fi
}

resolve_adb() {
  if [[ -n "${ADB:-}" ]]; then
    REALTOPIA_ADB_BIN="$ADB"
  elif [[ -n "${ANDROID_HOME:-}" || -n "${ANDROID_REFERENCE_DIR:-}" ]]; then
    realtopia_android_sdk_env
    return
  elif command -v adb >/dev/null 2>&1; then
    REALTOPIA_ADB_BIN="$(command -v adb)"
  else
    echo "ADB was not found. Set ADB, ANDROID_HOME, or ANDROID_REFERENCE_DIR." >&2
    return 1
  fi
  if [[ ! -x "$REALTOPIA_ADB_BIN" ]]; then
    echo "ADB is not executable: $REALTOPIA_ADB_BIN" >&2
    return 1
  fi
}

launch_realtopia() {
  local label="$1" serial="$2" component="$3" package output
  if [[ "${ANDROID_CONTROL_SKIP_DEVICE_CHECK:-0}" == "1" || "${ANDROID_CONTROL_SKIP_APP_LAUNCH:-0}" == "1" ]]; then
    return 0
  fi
  package="${component%%/*}"
  if ! "$REALTOPIA_ADB_BIN" -s "$serial" shell pm path "$package" | grep -q '^package:'; then
    echo "RealTopia $label app is not installed: $package" >&2
    echo "Build and install the current project with ./scripts/deploy.sh first." >&2
    return 1
  fi
  if ! output="$("$REALTOPIA_ADB_BIN" -s "$serial" shell am start -W -n "$component" 2>&1)"; then
    echo "Failed to launch RealTopia $label ($component):" >&2
    echo "$output" >&2
    return 1
  fi
  if grep -q '^Error:' <<<"$output"; then
    echo "Failed to launch RealTopia $label ($component):" >&2
    echo "$output" >&2
    return 1
  fi
  echo "RealTopia $label launched: $component"
}

start_instance() {
  local label="$1" serial="$2" port="$3" dir pid_file log_file config_file pid
  dir="$(instance_dir "$label")"
  pid_file="$dir/server.pid"
  log_file="$dir/server.log"
  config_file="$dir/config.json"
  mkdir -p "$dir"
  if pid_is_running "$pid_file"; then
    if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/" >/dev/null; then
      echo "$label already running; reusing pid $(<"$pid_file") on port $port."
      return 0
    fi
    echo "$label has a live process but is not serving port $port; restarting it."
    stop_instance "$label"
  fi
  write_config "$config_file" "$port" "$REALTOPIA_ADB_BIN"
  (
    cd "$tool_dir"
    export DATA_ROOT="$dir"
    export DEPS_PATH="$shared_deps"
    export WS_SCRCPY_CONFIG="$config_file"
    export WS_SCRCPY_WEB_PORT="$port"
    export WS_SCRCPY_NO_BROWSER=1
    export NODE_OPTIONS="--require=$project_dir/dev/android-control/loopback-listen.cjs${NODE_OPTIONS:+ $NODE_OPTIONS}"
    exec node dist/index.js
  ) >>"$log_file" 2>&1 &
  pid=$!
  echo "$pid" >"$pid_file"

  local attempt
  for attempt in {1..60}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$label server exited during startup. Last log lines:" >&2
      tail -40 "$log_file" >&2 || true
      return 1
    fi
    if curl --silent --fail --max-time 1 "http://127.0.0.1:$port/" >/dev/null; then
      echo "$label ready: $(direct_url "$port" "$serial" "$(device_kind_for_label "$label")")"
      return 0
    fi
    sleep 0.25
  done
  echo "$label server did not become ready on port $port. See $log_file" >&2
  return 1
}

stop_instance() {
  local label="$1" dir pid_file pid attempt
  dir="$(instance_dir "$label")"
  pid_file="$dir/server.pid"
  if ! pid_is_running "$pid_file"; then
    rm -f "$pid_file"
    echo "$label is not running."
    return 0
  fi
  pid="$(<"$pid_file")"
  kill -TERM "$pid"
  for attempt in {1..40}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "$label stopped."
      return 0
    fi
    sleep 0.25
  done
  echo "$label did not stop within 10 seconds; sending KILL." >&2
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$pid_file"
}

show_status() {
  local label="$1" serial="$2" port="$3" dir pid_file
  dir="$(instance_dir "$label")"
  pid_file="$dir/server.pid"
  if pid_is_running "$pid_file"; then
    echo "$label: running pid=$(<"$pid_file") url=$(direct_url "$port" "$serial" "$(device_kind_for_label "$label")")"
  else
    echo "$label: stopped"
  fi
}

start_all() {
  resolve_adb
  realtopia_require_env PHONE_SERIAL
  realtopia_require_env GLASS_SERIAL
  validate_port PHONE_CONTROL_PORT "$phone_port"
  validate_port GLASS_CONTROL_PORT "$glass_port"
  if [[ "$phone_port" == "$glass_port" ]]; then
    echo "PHONE_CONTROL_PORT and GLASS_CONTROL_PORT must be different." >&2
    return 1
  fi
  check_device phone "$PHONE_SERIAL"
  check_device glasses "$GLASS_SERIAL"
  launch_realtopia phone "$PHONE_SERIAL" "$phone_component"
  launch_realtopia glasses "$GLASS_SERIAL" "$glass_component"
  ensure_tool
  mkdir -p "$runtime_dir"
  start_instance phone "$PHONE_SERIAL" "$phone_port"
  if ! start_instance glasses "$GLASS_SERIAL" "$glass_port"; then
    stop_instance phone
    return 1
  fi
  echo
  echo "  Phone  -> $(direct_url "$phone_port" "$PHONE_SERIAL" phone)"
  echo "  Rokid  -> $(direct_url "$glass_port" "$GLASS_SERIAL" tablet)"
  echo
  echo "Click a link in the SSH development terminal to forward it locally."
  echo "Press Ctrl+C to stop both servers."

  cleanup_all() {
    trap - EXIT INT TERM
    echo
    stop_instance glasses
    stop_instance phone
  }
  trap cleanup_all EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  # Poll PID files instead of `wait`: an already-running instance may have
  # been started from another terminal and is therefore not this shell's child.
  while pid_is_running "$(instance_dir phone)/server.pid" &&
    pid_is_running "$(instance_dir glasses)/server.pid"; do
    sleep 1
  done
  echo "One Android control server exited; stopping the other." >&2
  return 1
}

action="${1:-start}"
case "$action" in
  start)
    start_all
    ;;
  stop)
    stop_instance glasses
    stop_instance phone
    ;;
  status)
    realtopia_require_env PHONE_SERIAL
    realtopia_require_env GLASS_SERIAL
    show_status phone "$PHONE_SERIAL" "$phone_port"
    show_status glasses "$GLASS_SERIAL" "$glass_port"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
