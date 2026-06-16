# Maestro screenshot flows

Native App Store / onboarding screenshot capture for the Boardsesh mobile app.
Driven by [Maestro](https://maestro.mobile.dev). Don't run these by hand — the
orchestrator (`scripts/mobile-screenshots.ts`, exposed as `vp run
mobile:screenshots`) boots the simulator, applies a clean status bar, installs a
Debug **dev-client** `.app` (prebuilt/cached, or built on the fly when no
`--app-path` is given), resets the keychain, then starts **Metro** with
`EXPO_PUBLIC_SCREENSHOT_MODE=1`. The flow loads the JS bundle from Metro (via the
expo-development-client deep link), captures each screen, and the orchestrator
collects the PNGs into `app-stores/<apple|google>/screenshots/<device>/`.

The screenshot behaviour lives in the **Metro JS bundle**, not the native binary,
so the `.app` is reusable and CI caches it (keyed on native inputs) — a JS-only
run skips the ~30-min native build. See `scripts/mobile-build-sim-app.ts`.

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
- `app-store.yaml` — logs in, then captures Home, Discover, Profile, Climbs,
  Record, and the board view.
- `onboarding.yaml` — captures app screens for onboarding-card illustrations
  (`--flow onboarding`).

## Required env (passed by the orchestrator via `maestro test -e`)

- `SCREENSHOT_USER_EMAIL` — test account email (default `test@boardsesh.com`).
- `SCREENSHOT_USER_PASSWORD` — test account password. **Not committed** — pass it
  at runtime (prod differs from the local-DB `test`).

## Notes

- The app is a dev-client, so each flow first loads its JS from Metro with
  `openLink: ${MAESTRO_DEV_CLIENT_URL}` instead of `launchApp` — a bare launch
  would land on the launcher. The orchestrator passes that env via `maestro test
  -e` (an `expo-development-client` deep link pointing at its Metro port, default
  8081, override with `BOARDSESH_METRO_PORT`), so the flow isn't pinned to a port.
  Re-opening the deep link reloads the JS runtime (used to clear the play drawer
  before the board-sheet shot). The first load waits up to 180s for the cold Metro
  bundle. The orchestrator uninstalls + reinstalls and resets the keychain, so the
  app cold-loads signed out with fresh app data (no Maestro `clearState` needed).
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
