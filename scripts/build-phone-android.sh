#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
phone_dir="$project_dir/phone/app"
tauri_dir="$phone_dir/src-tauri"
android_dir="$tauri_dir/gen/android"
source "$project_dir/scripts/android-env.sh"
realtopia_android_build_env
export WRY_ANDROID_PACKAGE="com.realtopia.phone"
export WRY_ANDROID_LIBRARY="realtopia_phone_lib"
export WRY_ANDROID_KOTLIN_FILES_OUT_DIR="$android_dir/app/src/main/java/com/realtopia/phone"
export TAURI_ANDROID_PROJECT_PATH="$android_dir"
export TAURI_ANDROID_PACKAGE_UNESCAPED="com.realtopia.phone"
export TAURI_ANDROID_PACKAGE="com_realtopia_phone"
export TAURI_ENV_PLATFORM="android"
export TAURI_ENV_ARCH="aarch64"
export TAURI_ENV_FAMILY="unix"
export CC_aarch64_linux_android="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android28-clang"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$CC_aarch64_linux_android"

"$project_dir/scripts/prepare-face-models.sh"
face_build_dir="$project_dir/phone/.build/mnn-android"
cmake -S "$project_dir/phone/MNN" -B "$face_build_dir" -G "Unix Makefiles" \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 \
  -DCMAKE_BUILD_TYPE=Release -DMNN_BUILD_SHARED_LIBS=ON \
  -DMNN_BUILD_TOOLS=OFF -DMNN_BUILD_TEST=OFF -DMNN_BUILD_BENCHMARK=OFF \
  -DMNN_BUILD_OPENCV=ON -DMNN_IMGCODECS=OFF \
  -DMNN_OPENCL=OFF -DMNN_VULKAN=OFF -DMNN_KLEIDIAI=OFF \
  -DMNN_ARM82=ON -DMNN_SME2=ON \
  -DMNN_BUILD_LLM=ON -DMNN_BUILD_AUDIO=ON -DMNN_LLM_BUILD_DEMO=OFF \
  -DMNN_SUPPORT_TRANSFORMER_FUSE=ON
cmake --build "$face_build_dir" --target MNN MNN_Express MNNOpenCV MNNAudio llm -j "$(nproc)"
native_lib_dir="$android_dir/app/src/main/jniLibs/arm64-v8a"
install -Dm755 "$face_build_dir/OFF/arm64-v8a/libMNN.so" "$native_lib_dir/libMNN.so"
install -Dm755 "$face_build_dir/express/OFF/arm64-v8a/libMNN_Express.so" \
  "$native_lib_dir/libMNN_Express.so"
install -Dm755 "$face_build_dir/tools/audio/OFF/arm64-v8a/libMNNAudio.so" \
  "$native_lib_dir/libMNNAudio.so"
install -Dm755 "$face_build_dir/tools/cv/OFF/arm64-v8a/libMNNOpenCV.so" \
  "$native_lib_dir/libMNNOpenCV.so"
install -Dm755 "$face_build_dir/OFF/arm64-v8a/libllm.so" "$native_lib_dir/libllm.so"
face_jni_build_dir="$project_dir/phone/.build/face-native-android"
cmake -S "$project_dir/phone/face-native" -B "$face_jni_build_dir" -G "Unix Makefiles" \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 \
  -DCMAKE_BUILD_TYPE=Release -DMNN_ROOT="$project_dir/phone/MNN" \
  -DMNN_ANDROID_LIB_DIR="$native_lib_dir"
cmake --build "$face_jni_build_dir" --target realtopia_face_jni -j "$(nproc)"
install -Dm755 "$face_jni_build_dir/librealtopia_face_jni.so" \
  "$native_lib_dir/librealtopia_face_jni.so"
asr_jni_build_dir="$project_dir/phone/.build/asr-native-android"
cmake -S "$project_dir/phone/asr-native" -B "$asr_jni_build_dir" -G "Unix Makefiles" \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 \
  -DCMAKE_BUILD_TYPE=Release -DMNN_ROOT="$project_dir/phone/MNN" \
  -DMNN_ANDROID_LIB_DIR="$native_lib_dir"
cmake --build "$asr_jni_build_dir" --target realtopia_asr_jni -j "$(nproc)"
install -Dm755 "$asr_jni_build_dir/librealtopia_asr_jni.so" \
  "$native_lib_dir/librealtopia_asr_jni.so"
vl_jni_build_dir="$project_dir/phone/.build/vl-native-android"
cmake -S "$project_dir/phone/vl-native" -B "$vl_jni_build_dir" -G "Unix Makefiles" \
  -DCMAKE_TOOLCHAIN_FILE="$NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 \
  -DCMAKE_BUILD_TYPE=Release -DMNN_ROOT="$project_dir/phone/MNN" \
  -DMNN_ANDROID_LIB_DIR="$native_lib_dir"
cmake --build "$vl_jni_build_dir" --target realtopia_vl_jni -j "$(nproc)"
install -Dm755 "$vl_jni_build_dir/librealtopia_vl_jni.so" \
  "$native_lib_dir/librealtopia_vl_jni.so"

cd "$phone_dir"
npm run tauri -- android build --debug --apk --target aarch64 --ci
cd "$android_dir"
./gradlew :app:testDebugUnitTest
echo "Phone APK: $android_dir/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
