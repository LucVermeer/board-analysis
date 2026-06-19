cmake_minimum_required(VERSION 3.22)
project(board_renderer_jni)

add_library(board_renderer_jni SHARED jni_bridge.cpp)

# Link by library name so Android records DT_NEEDED as
# libboard_renderer_ffi.so, not this machine's absolute source path.
target_link_directories(board_renderer_jni PRIVATE ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI})
target_link_libraries(board_renderer_jni PRIVATE board_renderer_ffi log)

# Align LOAD segments to 16 KB. Android 15 devices with 16 KB memory pages
# (Pixel 8/9, etc.) refuse to dlopen a .so whose segments are only 4 KB aligned
# ("not 16 KB aligned" → UnsatisfiedLinkError), and Google Play rejects an AAB
# with such libs when targeting API 35+. The NDK that ships with React Native
# (r27) still links to 4 KB by default, so force it here — the same flag the
# prebuilt Rust FFI lib already uses in scripts/build-native-renderer.sh. 16 KB
# aligned libs also load fine on 4 KB devices, so this is unconditionally safe.
target_link_options(board_renderer_jni PRIVATE "-Wl,-z,max-page-size=16384")
