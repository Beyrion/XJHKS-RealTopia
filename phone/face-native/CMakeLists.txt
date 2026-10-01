cmake_minimum_required(VERSION 3.22)
project(realtopia_face_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT ANDROID)
    message(FATAL_ERROR "realtopia_face_native currently targets Android only")
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
set_target_properties(
    MNN_Express
    PROPERTIES IMPORTED_LOCATION "${MNN_ANDROID_LIB_DIR}/libMNN_Express.so"
)

add_library(realtopia_face_jni SHARED src/face_jni.cpp)
target_include_directories(realtopia_face_jni PRIVATE "${MNN_ROOT}/include")
target_compile_options(realtopia_face_jni PRIVATE -fno-exceptions -fno-rtti -Wall -Wextra)
target_link_libraries(realtopia_face_jni PRIVATE MNN_Express MNN android jnigraphics log)

