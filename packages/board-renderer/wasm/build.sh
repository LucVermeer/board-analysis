#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -d "$HOME/.rustup/toolchains/stable-$(rustc -vV | grep host | cut -d' ' -f2)/bin" ]; then
  export PATH="$HOME/.rustup/toolchains/stable-$(rustc -vV | grep host | cut -d' ' -f2)/bin:$PATH"
fi
wasm-pack build --target web --out-dir pkg
echo "WASM build complete. Output in pkg/"
