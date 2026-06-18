#!/usr/bin/env bash
# Capture Android Play Store screenshots inside the android-emulator-runner step.
#
# reactivecircus/android-emulator-runner splits its `script:` input by newline
# and runs each line as its OWN `sh -c` (see the action's script-parser). That
# makes inline multi-line shell impossible: for-loops, cross-line variables, and
# backslash line-continuations each blow up ("Syntax error: end of file
# unexpected (expecting \"done\")"). So the capture logic lives here and the
# workflow invokes it on a single line.
#
# Inputs come from the environment (set on the workflow step):
#   SCREENSHOT_FLOW            app-store | onboarding   (default app-store)
#   SCREENSHOT_ANDROID_DEVICE  output device label      (default "Pixel 2")
#   SCREENSHOT_APK_PATH        prebuilt screenshot APK  (default /tmp/boardsesh-screenshot.apk)
set -euo pipefail

flow="${SCREENSHOT_FLOW:-app-store}"
device="${SCREENSHOT_ANDROID_DEVICE:-Pixel 2}"
apk_path="${SCREENSHOT_APK_PATH:-/tmp/boardsesh-screenshot.apk}"

# `sys.boot_completed` fires before the window manager is fully up, so an
# `adb shell wm …` right after the runner reports "booted" can hit a transient
# "device offline" (exit 1). Wait for the device, then retry the display setup
# until it sticks.
adb wait-for-device

wm_ready=0
for attempt in 1 2 3 4 5 6; do
  if adb shell wm size 1080x1920 && adb shell wm density 420; then
    wm_ready=1
    break
  fi
  echo "display setup not ready (attempt ${attempt}/6); retrying in 5s…"
  sleep 5
done
[ "$wm_ready" = 1 ] || {
  echo "::error::adb wm display setup failed after retries"
  exit 1
}

vp run mobile:screenshots -- \
  --platform android \
  --flow "$flow" \
  --backend prod \
  --device "$device" \
  --app-path "$apk_path"
