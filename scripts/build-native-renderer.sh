#!/usr/bin/env bash
set -euo pipefail

# Cross-compile the board-renderer-ffi Rust crate for iOS and Android.
# Produces:
#   - iOS: xcframework at packages/mobile/modules/board-renderer/ios/BoardRendererNative.xcframework
#   - Android: .so files at packages/mobile/modules/board-renderer/android/src/main/jniLibs/{abi}/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FFI_DIR="$ROOT_DIR/packages/board-renderer/ffi"
MODULE_DIR="$ROOT_DIR/packages/mobile/modules/board-renderer"

# -- iOS targets --
IOS_TARGETS=(
  "aarch64-apple-ios"         # device
  "aarch64-apple-ios-sim"     # Apple Silicon simulator
  "x86_64-apple-ios"          # Intel simulator
)

# -- Android targets --
# Maps Rust target triple to Android ABI directory name
declare -A ANDROID_TARGETS=(
  ["aarch64-linux-android"]="arm64-v8a"
  ["armv7-linux-androideabi"]="armeabi-v7a"
  ["x86_64-linux-android"]="x86_64"
  ["i686-linux-android"]="x86"
)

echo "==> Installing Rust targets..."
for target in "${IOS_TARGETS[@]}"; do
  rustup target add "$target" 2>/dev/null || true
done
for target in "${!ANDROID_TARGETS[@]}"; do
  rustup target add "$target" 2>/dev/null || true
done

# -- Build iOS static libraries --
echo "==> Building iOS static libraries..."
for target in "${IOS_TARGETS[@]}"; do
  echo "  Building $target..."
  cargo build --manifest-path "$FFI_DIR/Cargo.toml" --release --target "$target"
done

# -- Create xcframework --
echo "==> Creating xcframework..."
XCFW_DIR="$MODULE_DIR/ios/BoardRendererNative.xcframework"
rm -rf "$XCFW_DIR"

# Combine simulator architectures into a fat library
RELEASE_DIR="$ROOT_DIR/packages/board-renderer/target"
SIM_FAT_DIR="$RELEASE_DIR/ios-sim-fat"
mkdir -p "$SIM_FAT_DIR"

lipo -create \
  "$RELEASE_DIR/aarch64-apple-ios-sim/release/libboard_renderer_ffi.a" \
  "$RELEASE_DIR/x86_64-apple-ios/release/libboard_renderer_ffi.a" \
  -output "$SIM_FAT_DIR/libboard_renderer_ffi.a"

# xcodebuild -create-xcframework expects a headers directory, not a single file
HEADERS_DIR="$MODULE_DIR/ios/include"
mkdir -p "$HEADERS_DIR"
cp "$MODULE_DIR/ios/board_renderer.h" "$HEADERS_DIR/"

xcodebuild -create-xcframework \
  -library "$RELEASE_DIR/aarch64-apple-ios/release/libboard_renderer_ffi.a" \
  -headers "$HEADERS_DIR" \
  -library "$SIM_FAT_DIR/libboard_renderer_ffi.a" \
  -headers "$HEADERS_DIR" \
  -output "$XCFW_DIR"

echo "  xcframework created at $XCFW_DIR"

# -- Build Android shared libraries --
echo "==> Building Android shared libraries..."

# Detect NDK
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  if [ -d "$HOME/Android/Sdk/ndk" ]; then
    ANDROID_NDK_HOME="$(ls -d "$HOME/Android/Sdk/ndk"/*/ 2>/dev/null | sort -V | tail -1)"
  elif [ -d "$HOME/Library/Android/sdk/ndk" ]; then
    ANDROID_NDK_HOME="$(ls -d "$HOME/Library/Android/sdk/ndk"/*/ 2>/dev/null | sort -V | tail -1)"
  fi
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  echo "WARNING: ANDROID_NDK_HOME not set and NDK not found. Skipping Android builds."
  echo "Set ANDROID_NDK_HOME to your NDK installation directory."
else
  TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)"

  for target in "${!ANDROID_TARGETS[@]}"; do
    abi="${ANDROID_TARGETS[$target]}"
    echo "  Building $target -> $abi..."

    # Set the appropriate linker for each target
    case "$target" in
      aarch64-linux-android)
        export CC_aarch64_linux_android="$TOOLCHAIN/bin/aarch64-linux-android24-clang"
        export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/aarch64-linux-android24-clang"
        ;;
      armv7-linux-androideabi)
        export CC_armv7_linux_androideabi="$TOOLCHAIN/bin/armv7a-linux-androideabi24-clang"
        export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$TOOLCHAIN/bin/armv7a-linux-androideabi24-clang"
        ;;
      x86_64-linux-android)
        export CC_x86_64_linux_android="$TOOLCHAIN/bin/x86_64-linux-android24-clang"
        export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/x86_64-linux-android24-clang"
        ;;
      i686-linux-android)
        export CC_i686_linux_android="$TOOLCHAIN/bin/i686-linux-android24-clang"
        export CARGO_TARGET_I686_LINUX_ANDROID_LINKER="$TOOLCHAIN/bin/i686-linux-android24-clang"
        ;;
    esac

    cargo build --manifest-path "$FFI_DIR/Cargo.toml" --release --target "$target"

    # Copy .so to jniLibs
    JNILIBS_DIR="$MODULE_DIR/android/src/main/jniLibs/$abi"
    mkdir -p "$JNILIBS_DIR"
    cp "$RELEASE_DIR/$target/release/libboard_renderer_ffi.so" "$JNILIBS_DIR/"
    echo "  Copied to $JNILIBS_DIR/"
  done
fi

echo "==> Build complete!"
echo "iOS: $XCFW_DIR"
echo "Android: $MODULE_DIR/android/src/main/jniLibs/"
