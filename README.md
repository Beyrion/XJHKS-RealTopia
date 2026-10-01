# RealTopia

RealTopia connects a Tauri + React phone app with Rokid glasses for scene perception, local speech recognition, contextual conversations and personal 3D Topia worlds.

## Development

```sh
git submodule update --init --recursive
cd phone/app
npm ci
npm run dev
```

For Android, copy `.env.example` to `.env`, configure the SDK/NDK/JDK and both device serials, then run `./scripts/build.sh` and `./scripts/deploy.sh`. See [device testing](docs/device-testing.md) and the [transport protocol](shared/protocol.md).

- `phone/app`: React UI, Rust services and Android Tauri plugins.
- `phone/MNN`, `phone/*-native`: pinned MNN runtime and local inference bridges.
- `glasses`: camera, HUD, Bluetooth commands and Wi-Fi Direct transport.
- `scripts`: build, deployment and regression checks.

Model weights are supplied separately and are not tracked. See [model setup](docs/models.md) before building an APK with offline speech support. Runtime dependencies retain their own upstream licenses.
