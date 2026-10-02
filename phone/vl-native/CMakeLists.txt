cmake_minimum_required(VERSION 3.22)
project(realtopia_vl_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT ANDROID)
    message(FATAL_ERROR "realtopia_vl_native currently targets Android only")
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
add_library(MNNOpenCV SHARED IMPORTED)
set_target_properties(MNNOpenCV PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libMNNOpenCV.so")
add_library(llm SHARED IMPORTED)
set_target_properties(llm PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libllm.so")

add_library(realtopia_vl_jni SHARED src/vl_jni.cpp)
target_include_directories(
    realtopia_vl_jni PRIVATE
    "${MNN_ROOT}/include"
    "${MNN_ROOT}/transformers/llm/engine/include"
)
target_compile_options(realtopia_vl_jni PRIVATE -Wall -Wextra)
target_link_libraries(realtopia_vl_jni PRIVATE llm MNNOpenCV MNN_Express MNN jnigraphics log)
