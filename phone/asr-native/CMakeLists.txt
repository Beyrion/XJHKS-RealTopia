cmake_minimum_required(VERSION 3.22)
project(realtopia_asr_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT ANDROID)
    message(FATAL_ERROR "realtopia_asr_native currently targets Android only")
endif()
if(NOT DEFINED MNN_ROOT)
    get_filename_component(MNN_ROOT "${CMAKE_CURRENT_LIST_DIR}/../MNN" ABSOLUTE)
endif()
if(NOT DEFINED MNN_ANDROID_LIB_DIR)
    message(FATAL_ERROR "MNN_ANDROID_LIB_DIR must point to packaged arm64 MNN libraries")
endif()

add_library(MNN SHARED IMPORTED)
set_target_properties(MNN PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libMNN.so")
add_library(MNN_Express SHARED IMPORTED)
set_target_properties(MNN_Express PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libMNN_Express.so")
add_library(MNNAudio SHARED IMPORTED)
set_target_properties(MNNAudio PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libMNNAudio.so")
add_library(llm SHARED IMPORTED)
set_target_properties(llm PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libllm.so")

add_library(
    realtopia_asr_jni SHARED
    src/asr_jni.cpp
    src/turnsense_engine.cpp
    src/turnsense_frontend.cpp
)
target_include_directories(
    realtopia_asr_jni PRIVATE
    "${MNN_ROOT}/include"
    "${MNN_ROOT}/transformers/llm/engine/include"
)
target_compile_options(realtopia_asr_jni PRIVATE -Wall -Wextra)
target_link_libraries(realtopia_asr_jni PRIVATE llm MNNAudio MNN_Express MNN log)

# Not packaged in the APK. This executable is pushed to /data/local/tmp by the
# real-device test workflow and exercises the same in-memory PCM model API.
add_executable(realtopia_asr_bench src/asr_bench.cpp)
target_include_directories(
    realtopia_asr_bench PRIVATE
    "${MNN_ROOT}/include"
    "${MNN_ROOT}/transformers/llm/engine/include"
)
target_link_libraries(realtopia_asr_bench PRIVATE llm MNNAudio MNN_Express MNN log)
