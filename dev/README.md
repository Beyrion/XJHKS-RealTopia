# Development tools

External development tools are pinned as Git submodules under this directory.

## Browser control for phone and Rokid glasses

`ws-scrcpy-web` provides browser video, Android audio output, touch/mouse and
keyboard control. RealTopia runs two isolated server instances so the phone and
Rokid glasses each have a stable port.

Initialize the tool and start both endpoints from the repository root:

```bash
git submodule update --init --recursive dev/ws-scrcpy-web
./scripts/android-control.sh
```

The script reads `.env` when present. At minimum, configure `PHONE_SERIAL` and
`GLASS_SERIAL`; the default ports are `18001` and `18002`. The first run installs
the submodule's Node dependencies and builds its browser bundle. It then stays in
the foreground like a normal dev server and prints two `localhost` links. In an
SSH development client with automatic port forwarding, click either link to open
that device locally. Before printing the links it verifies and launches this
repository's `com.realtopia.phone` and `com.realtopia.glasses` applications.
Press `Ctrl+C` to stop both endpoints.

The generated direct links identify the phone and glasses as touch-capable
devices, so mouse dragging sends Android touch gestures by default. The toolbar
input-mode button can still switch between Touch and D-pad control manually.

The first run also downloads the official scrcpy-server v4.0 binary into the
ignored `dev/.runtime/` cache and verifies its SHA-256 checksum. This exact
version is required by the submodule's v4 stream parser; subsequent starts are
offline and reuse the verified cache.

RealTopia also applies `dev/android-control/ws-scrcpy-web-runtime.patch` only
while building the ignored browser bundle. It fixes the pinned upstream
player's WebCodecs Annex-B handling and unbound animation-frame callbacks, and
forwards scrcpy v4 resize packets so portrait/landscape changes update the
browser canvas. The patch is reversed immediately after the build so the Git
submodule remains clean and only the reproducible patch is tracked by this
repository.

`ANDROID_REFERENCE_DIR`, when used, only locates an Android SDK/JDK/ADB
installation. It does not select or launch the reference project's app. For
screen control, the script also accepts an explicit `ADB` path or falls back to
an `adb` executable available on `PATH`.

For a plain SSH client without clickable automatic forwarding, use:

```bash
ssh -N \
  -L 18001:127.0.0.1:18001 \
  -L 18002:127.0.0.1:18002 \
  USER@LINUX_SERVER
```

Keep these endpoints behind SSH or another authenticated tunnel: they expose
Android control and an ADB shell. RealTopia's launcher preloads
`dev/android-control/loopback-listen.cjs`, forcing both endpoints to bind only
to the Linux server's `127.0.0.1` interface.
