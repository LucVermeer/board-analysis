cmake_minimum_required(VERSION 3.22)
project(board_renderer_jni)

add_library(board_renderer_jni SHARED jni_bridge.cpp)
target_link_libraries(board_renderer_jni board_renderer_ffi log)

# Link pre-built Rust library
add_library(board_renderer_ffi SHARED IMPORTED)
set_target_properties(board_renderer_ffi PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libboard_renderer_ffi.so
)
