# Maestro screenshot flows

Native App Store / onboarding screenshot capture for the Boardsesh mobile app.
Driven by [Maestro](https://maestro.mobile.dev). Don't run these by hand — the
orchestrator (`scripts/mobile-screenshots.ts`, exposed as `vp run
mobile:screenshots`) prepares the simulator/emulator, applies a clean status bar,
installs the native app artifact, captures each screen, and collects the PNGs
into `app-stores/<apple|google>/screenshots/<device>/`.

On iOS, the artifact is a Debug **dev-client** `.app` (prebuilt/cached, or built
on the fly when no `--app-path` is given). The flow starts **Metro** with
`EXPO_PUBLIC_SCREENSHOT_MODE=1` and opens the expo-development-client deep link.
The screenshot behaviour lives in the **Metro JS bundle**, not the native binary,
so the `.app` is reusable and CI caches it (keyed on native inputs) — a JS-only
run skips the ~30-min native build. See `scripts/mobile-build-sim-app.ts`.

On Android, the artifact is a standalone screenshot APK built with the same
`EXPO_PUBLIC_SCREENSHOT_*` values present during Gradle's JS bundle step. The
Android flows use `launchApp`, not the iOS dev-client deep link.

## Backend

App Store captures run against **prod** (`vp run mobile:screenshots -- --backend
prod`), signed in as a curated test user (real feed, sessions, boards). The
orchestrator builds with the prod `EXPO_PUBLIC_BACKEND_URL` and resets the
simulator keychain first so login authenticates cleanly against prod.
`--backend local` (the default) points at the seeded dev DB instead.

## Flows

- `login.yaml` — reusable subflow. Fills the test credentials, submits via the
  keyboard return key, and dismisses the iOS "Save Password" prompt. Only runs
  when the auth screen is showing (the Keychain token survives `clearState`).
- `app-store.yaml` / `app-store-android.yaml` — log in, then capture Home,
  Discover, Profile, Climbs, Record, board view, and board sheet.
- `onboarding.yaml` / `onboarding-android.yaml` — capture app screens for
  onboarding-card illustrations (`--flow onboarding`).

## Required env (passed by the orchestrator via `maestro test -e`)

- `SCREENSHOT_USER_EMAIL` — test account email (default `test@boardsesh.com`).
- `SCREENSHOT_USER_PASSWORD` — test account password. **Not committed** — pass it
  at runtime (prod differs from the local-DB `test`).

## Notes

- The iOS app is a dev-client, so each iOS flow first loads its JS from Metro with
  `openLink: ${MAESTRO_DEV_CLIENT_URL}` instead of `launchApp` — a bare launch
  would land on the launcher. The orchestrator passes that env via `maestro test
-e` (an `expo-development-client` deep link pointing at its Metro port, default
  8081, override with `BOARDSESH_METRO_PORT`), so the flow isn't pinned to a port.
  Re-opening the deep link reloads the JS runtime (used to clear the play drawer
  before the board-sheet shot). The orchestrator pre-warms the Metro bundle before
  Maestro runs, but the first load still waits up to 300s as a safety net for a
  cold bundle on a slow CI runner. The orchestrator uninstalls + reinstalls and
  resets the keychain, so the app cold-loads signed out with fresh app data (no
  Maestro `clearState` needed).
- The Android app is a standalone screenshot APK, so Android flows use
  `launchApp`. The orchestrator uninstalls + reinstalls the APK and clears app
  data before capture.
- Navigation uses custom-scheme deep links (`com.boardsesh.app://<route>`); Expo
  Router maps tab routes with the `(tabs)` group stripped (`://climbs`, `://home`,
  `://boards`, …). Each `openLink` is followed by an optional `tapOn "Open"` to
  clear iOS's "Open in 'Boardsesh'?" confirmation.
- **Coordinate taps**: on this iOS 26 / RN Fabric build Maestro's accessibility
  tree only exposes native text inputs and system dialogs — plain Views, Text,
  reanimated pressables and gesture rows don't surface, so app buttons can't be
  matched by id/text. The board pick and the climb tap (board view) therefore use
  percentage `point:` taps **pinned to the iPhone 16 Pro Max**. Re-check them if
  the device changes. Login works because it drives `TextInput`s (by testID) and
  the keyboard return key, not buttons.
- Screenshot mode (build-time flag) locks the theme to light + the platform
  variant and stops the onboarding gate from auto-presenting the tour.
